import { isCycleDeclined, type ChargeCredentials } from "@quartermaster/prava-client";
import type { Verdict } from "mandate-arbiter";
import { insertTraceEvent, db, setRunState, traceEventsSince } from "./db";
import { buildEscalator } from "./escalation-flow";
import type { EnvelopeRow } from "./envelopes";
import { MERCHANT } from "./merchant";
import { usd } from "./money";
import { portfolioMeter } from "./portfolio";
import { prava, settlementMode } from "./prava";
import { findQuote } from "./quotes";
import { routeCharge } from "./router";
import { settleViaStripeCheckout } from "./stripe-settle";

const AGENT_B_URL =
  process.env.AGENT_B_URL ?? "https://quartermaster-agent-b.fly.dev";

export interface SettlementResult {
  envelope: EnvelopeRow;
  transactionId: string;
  merchantRef: string;
  amountCents: number;
  mode: "sandbox" | "production";
  receiptText: string;
}

interface OrderResponse {
  orderRef: string;
  status: string;
  environment: string;
}

function countChargeAttempts(runId: string): number {
  let n = 0;
  for (const row of traceEventsSince(runId, 0)) {
    const t = (JSON.parse(row.body) as { type?: string }).type;
    if (t === "charge_created" || t === "charge_failed" || t === "charge_error") n++;
  }
  return n;
}

/**
 * Code-only settlement after an EXECUTE verdict. The router selects
 * funding; the network mints the credential; agent B is paid; the charge
 * is reported; the ledger attributes every cent to clause paths and an
 * envelope. Any failure at any step: stop, trace, throw (fail closed).
 */
export async function settleRun(
  runId: string,
  quoteId: string,
  verdict: Verdict,
  opts: { autonomous: boolean }
): Promise<SettlementResult> {
  if (verdict.decision !== "EXECUTE") {
    throw new Error(`settlement requires EXECUTE, got ${verdict.decision}: failing closed`);
  }
  if (verdict.proposalId !== quoteId) {
    throw new Error("verdict/quote mismatch: failing closed");
  }
  const quote = findQuote(runId, quoteId);
  if (!quote) throw new Error(`unknown quote ${quoteId}: failing closed`);

  const mode = settlementMode();
  const envelope = routeCharge(runId, quote.amountCents, MERCHANT.name);

  // The sandbox does not always clear a FAILED charge's idempotency key
  // (DUPLICATE_RESOURCE observed), so each retry derives a unique
  // reference; any single attempt still deduplicates under its own key.
  const priorAttempts = countChargeAttempts(runId);
  const reference =
    `${runId}-${quoteId}` + (priorAttempts > 0 ? `-r${priorAttempts + 1}` : "");

  let charge;
  try {
    charge = await prava().chargeMandate(
      envelope.prava_mandate_id,
      quote.amountCents,
      reference
    );
  } catch (err) {
    insertTraceEvent(runId, { type: "charge_error", reference, error: String(err) });
    setRunState(runId, "settlement_failed");
    throw err;
  }

  if (charge.status !== "awaiting_result" || !charge.credentials) {
    if (isCycleDeclined(charge)) {
      // Hard law 3: our ledger should have made this impossible.
      insertTraceEvent(runId, {
        type: "router_bug_cycle_declined",
        envelopeId: envelope.id,
        pravaMandateId: envelope.prava_mandate_id,
        errorMessage: charge.errorMessage,
        alert: "ROUTER BUG: network cycle decline reached Prava. Never retry.",
      });
    } else {
      insertTraceEvent(runId, {
        type: "charge_failed",
        reference,
        errorCode: charge.errorCode,
        errorMessage: charge.errorMessage,
      });
    }
    setRunState(runId, "settlement_failed");
    throw new Error(
      `mandate charge failed: ${charge.errorCode ?? "unknown"} ${charge.errorMessage ?? ""}`.trim()
    );
  }

  insertTraceEvent(runId, {
    type: "charge_created",
    pravaMandateId: charge.mandateId,
    transactionId: charge.transactionId,
    instructionId: charge.instructionId ?? null,
    tokenLast4: charge.credentials.token.slice(-4),
    amountCents: quote.amountCents,
    deduplicated: charge.deduplicated === true,
    environment: mode.toUpperCase(),
  });

  const merchantRef =
    mode === "sandbox"
      ? await settleSandbox(runId, quoteId, quote.amountCents, charge.credentials)
      : (await settleViaStripeCheckout(quote.amountCents, charge.credentials))
          .paymentIntentId;

  const report = await prava().reportMandateCharge(
    envelope.prava_mandate_id,
    charge.transactionId,
    "APPROVED",
    quote.amountCents
  );
  insertTraceEvent(runId, {
    type: "charge_reported",
    transactionId: charge.transactionId,
    status: report.status,
    mandateStatus: report.mandateStatus ?? null,
    visaConfirmation: report.visaConfirmation,
  });

  const authorizingPaths = verdict.results
    .filter((r) => r.ok)
    .map((r) => r.path);
  db()
    .prepare(
      `INSERT INTO ledger (run_id, mandate_id, envelope_id, entry_type, autonomous,
         clause_paths, amount_cents, currency, mode, prava_session_id, prava_txn_id, merchant_ref, at)
       VALUES (?, ?, ?, 'spend', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      runId,
      verdict.mandateId,
      envelope.id,
      opts.autonomous ? 1 : 0,
      JSON.stringify(authorizingPaths),
      quote.amountCents,
      quote.currency,
      mode,
      charge.instructionId ?? null,
      charge.transactionId,
      merchantRef,
      new Date().toISOString()
    );

  const meter = portfolioMeter();
  const receiptText =
    `Charged ${usd(quote.amountCents)} to agent_b from Envelope ${envelope.label}.` +
    (opts.autonomous
      ? ` Portfolio: ${usd(meter.portfolio.spent_cents)} of ${usd(meter.portfolio.cap_cents)} this cycle.`
      : "");

  insertTraceEvent(runId, {
    type: "settlement_complete",
    envelope: envelope.label,
    envelopeId: envelope.id,
    merchantRef,
    amountCents: quote.amountCents,
    environment: mode.toUpperCase(),
    autonomous: opts.autonomous,
    noHumanInLoop: opts.autonomous,
  });
  setRunState(runId, "settled");

  try {
    await buildEscalator(runId).sendText(receiptText);
    insertTraceEvent(runId, { type: "receipt_sent", text: receiptText });
  } catch (err) {
    // Settlement already stands; a receipt failure must not unwind it.
    insertTraceEvent(runId, { type: "receipt_send_failed", error: String(err) });
  }

  return {
    envelope,
    transactionId: charge.transactionId,
    merchantRef,
    amountCents: quote.amountCents,
    mode,
    receiptText,
  };
}

async function settleSandbox(
  runId: string,
  quoteId: string,
  amountCents: number,
  credential: ChargeCredentials
): Promise<string> {
  const res = await fetch(`${AGENT_B_URL}/orders`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ runId, quoteId, amountCents, credential }),
  });
  if (!res.ok) {
    insertTraceEvent(runId, { type: "order_failed", status: res.status });
    // Charge minted but merchant unpaid: surface loudly, do not guess at
    // Prava report semantics for an unused credential.
    throw new Error(`agent-b order failed with ${res.status}: failing closed`);
  }
  const order = (await res.json()) as OrderResponse;
  if (order.status !== "paid" || order.environment !== "SANDBOX" || !order.orderRef) {
    insertTraceEvent(runId, { type: "order_invalid", order });
    throw new Error("agent-b order response invalid: failing closed");
  }
  insertTraceEvent(runId, {
    type: "order_paid",
    orderRef: order.orderRef,
    environment: order.environment,
  });
  return order.orderRef;
}
