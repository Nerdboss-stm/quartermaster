import { createRun, insertTraceEvent, setRunState, sqlGet, sqlRun } from "./db";
import { evaluateQuote } from "./evaluate-quote";
import { findQuote } from "./quotes";
import { NeedSchema, queryOffers, type Need } from "./registry";
import { RouteRefused } from "./router";
import { settleRun } from "./settlement";

/**
 * The NANDA Town payments layer talks to Quartermaster over HTTP. This
 * module is the seam. It never decides whether money moves: the arbiter
 * decides and the router selects funding, exactly as in the console.
 */

export interface NandaQuote {
  runId: string;
  quoteId: string;
  amountCents: number;
  currency: string;
  attributes: Record<string, string | number | boolean>;
  pricingRule: string | null;
  counterpartyId: string;
  ttlSeconds: number;
}

export class NandaError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
    readonly httpStatus = 422
  ) {
    super(message);
    this.name = "NandaError";
  }
}

/** Prices come from the merchant's live /quote, never from the caller. */
export async function nandaQuote(rawNeed: unknown): Promise<NandaQuote> {
  const parsed = NeedSchema.safeParse(rawNeed);
  if (!parsed.success) {
    throw new NandaError("INVALID_NEED", "need failed validation", {
      issues: parsed.error.issues,
    });
  }
  const need: Need = parsed.data;

  const runId = `nanda_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await createRun(runId);
  await insertTraceEvent(runId, { type: "need_declared", need, source: "nanda" });

  const matches = await queryOffers(need);
  await insertTraceEvent(runId, {
    type: "registry_query",
    need,
    matches: matches.map((m) => ({
      offerId: m.offer.id,
      agentId: m.offer.agentId,
      estimateCents: m.estimateCents,
      withinBudget: m.withinBudget,
    })),
  });
  const match = matches[0];
  if (!match) {
    await setRunState(runId, "no_offer");
    throw new NandaError("NO_OFFER", "no registered offer satisfies the need", {
      runId,
    });
  }

  await insertTraceEvent(runId, {
    type: "quote_requested",
    offerId: match.offer.id,
    url: match.offer.quoteUrl,
    need,
  });
  const res = await fetch(match.offer.quoteUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(need),
  });
  if (!res.ok) {
    await setRunState(runId, "quote_failed");
    throw new NandaError("QUOTE_FAILED", `merchant quote failed: ${res.status}`, {
      runId,
    });
  }
  const quote = (await res.json()) as {
    id: string;
    counterpartyId: string;
    amountCents: number;
    currency: string;
    attributes: Record<string, string | number | boolean>;
    pricingRule?: string;
  };
  await insertTraceEvent(runId, {
    type: "quote_received",
    offerId: match.offer.id,
    quote,
  });
  await setRunState(runId, "quoted");

  return {
    runId,
    quoteId: quote.id,
    amountCents: quote.amountCents,
    currency: quote.currency,
    attributes: quote.attributes,
    pricingRule: quote.pricingRule ?? null,
    counterpartyId: quote.counterpartyId,
    ttlSeconds: 300,
  };
}

export interface NandaPayInput {
  ref: string;
  runId: string;
  quoteId: string;
  payer: string;
  payee: string;
  amountCents: number;
}

export interface NandaPayResult {
  ref: string;
  runId: string;
  transactionId: string;
  merchantRef: string;
  envelope: string;
  amountCents: number;
  currency: string;
  at: string;
}

async function recordFailure(
  input: NandaPayInput,
  code: string,
  message: string
): Promise<void> {
  await sqlRun(
    `INSERT INTO nanda_payments
       (ref, run_id, quote_id, payer, payee, amount_cents, currency, status,
        envelope_id, prava_txn_id, merchant_ref, error_code, error_message, at)
     VALUES (?, ?, ?, ?, ?, ?, 'USD', 'failed', NULL, NULL, NULL, ?, ?, ?)
     ON CONFLICT (ref) DO UPDATE SET status = 'failed', error_code = excluded.error_code,
       error_message = excluded.error_message, at = excluded.at`,
    [
      input.ref,
      input.runId,
      input.quoteId,
      input.payer,
      input.payee,
      input.amountCents,
      code,
      message,
      new Date().toISOString(),
    ]
  );
}

/**
 * Settles a quoted price against a PRE-APPROVED envelope. No passkey is
 * involved and none is simulated: the owner approved the envelope once,
 * by hand, before the simulation ran. Every refusal path returns before
 * any Prava call is made (fail closed).
 */
export async function nandaPay(input: NandaPayInput): Promise<NandaPayResult> {
  const existing = await sqlGet<{ ref: string; status: string }>(
    "SELECT ref, status FROM nanda_payments WHERE ref = ?",
    [input.ref]
  );
  if (existing?.status === "confirmed") {
    throw new NandaError(
      "DUPLICATE_REF",
      `payment reference already settled: ${input.ref}`,
      { ref: input.ref },
      409
    );
  }

  const quote = await findQuote(input.runId, input.quoteId);
  if (!quote) {
    throw new NandaError(
      "UNKNOWN_QUOTE",
      `no quote ${input.quoteId} on run ${input.runId}; call quote() first`,
      { runId: input.runId, quoteId: input.quoteId },
      404
    );
  }
  // The merchant's price is authoritative; a caller cannot pay a number
  // it made up.
  if (quote.amountCents !== input.amountCents) {
    const message = `amount ${input.amountCents} does not match quoted ${quote.amountCents}`;
    await recordFailure(input, "AMOUNT_MISMATCH", message);
    throw new NandaError("AMOUNT_MISMATCH", message, {
      quotedCents: quote.amountCents,
      requestedCents: input.amountCents,
    });
  }

  await insertTraceEvent(input.runId, {
    type: "nanda_pay_requested",
    ref: input.ref,
    payer: input.payer,
    payee: input.payee,
    amountCents: input.amountCents,
  });

  // LOCK 1: the deterministic arbiter, on every charge.
  const verdict = await evaluateQuote(input.runId, input.quoteId);
  if (verdict.decision !== "EXECUTE") {
    const failing = verdict.determinedBy[0];
    const message = failing?.detail ?? "policy refused the charge";
    await recordFailure(input, `POLICY_${verdict.decision}`, message);
    throw new NandaError(
      `POLICY_${verdict.decision}`,
      message,
      {
        decision: verdict.decision,
        mandateId: verdict.mandateId,
        failingClausePath: failing?.path ?? null,
        onFail: failing?.onFail ?? null,
        runId: input.runId,
      },
      402
    );
  }

  try {
    // Autonomous: no human touched this charge. The envelope approval
    // happened once, earlier, by passkey.
    const settlement = await settleRun(input.runId, input.quoteId, verdict, {
      autonomous: true,
    });
    const at = new Date().toISOString();
    db()
      .prepare(
        `INSERT OR REPLACE INTO nanda_payments
         (ref, run_id, quote_id, payer, payee, amount_cents, currency, status,
          envelope_id, prava_txn_id, merchant_ref, error_code, error_message, at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?, NULL, NULL, ?)`
      )
      .run(
        input.ref,
        input.runId,
        input.quoteId,
        input.payer,
        input.payee,
        settlement.amountCents,
        quote.currency,
        settlement.envelope.id,
        settlement.transactionId,
        settlement.merchantRef,
        at
      );
    await insertTraceEvent(input.runId, {
      type: "nanda_payment_confirmed",
      ref: input.ref,
      transactionId: settlement.transactionId,
      envelope: settlement.envelope.label,
    });
    return {
      ref: input.ref,
      runId: input.runId,
      transactionId: settlement.transactionId,
      merchantRef: settlement.merchantRef,
      envelope: settlement.envelope.label,
      amountCents: settlement.amountCents,
      currency: quote.currency,
      at,
    };
  } catch (err) {
    // No envelope with cycle capacity: refused before any Prava call.
    if (err instanceof RouteRefused) {
      await recordFailure(input, "NO_ENVELOPE_CAPACITY", err.reason);
      throw new NandaError(
        "NO_ENVELOPE_CAPACITY",
        `no envelope with cycle capacity: ${err.reason}`,
        { reason: err.reason, runId: input.runId },
        402
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    await recordFailure(input, "SETTLEMENT_FAILED", message);
    throw new NandaError("SETTLEMENT_FAILED", message, { runId: input.runId }, 502);
  }
}

export interface NandaPaymentStatus {
  ref: string;
  status: "confirmed" | "failed" | "not_found";
  transactionId: string | null;
  merchantRef: string | null;
  amountCents: number | null;
  currency: string | null;
  envelopeId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  at: string | null;
  /** True only when an append-only ledger row backs the payment. */
  ledgerConfirmed: boolean;
}

/** Verification reads the append-only ledger, not an in-memory cache. */
export function nandaVerify(ref: string): NandaPaymentStatus {
  const row = db()
    .prepare("SELECT * FROM nanda_payments WHERE ref = ?")
    .get(ref) as Record<string, string | number | null> | undefined;
  if (!row) {
    return {
      ref,
      status: "not_found",
      transactionId: null,
      merchantRef: null,
      amountCents: null,
      currency: null,
      envelopeId: null,
      errorCode: null,
      errorMessage: null,
      at: null,
      ledgerConfirmed: false,
    };
  }
  const txnId = (row.prava_txn_id as string | null) ?? null;
  const ledgerRow = txnId
    ? (db()
        .prepare(
          "SELECT id FROM ledger WHERE prava_txn_id = ? AND entry_type = 'spend'"
        )
        .get(txnId) as { id: number } | undefined)
    : undefined;

  return {
    ref,
    status: row.status === "confirmed" ? "confirmed" : "failed",
    transactionId: txnId,
    merchantRef: (row.merchant_ref as string | null) ?? null,
    amountCents: (row.amount_cents as number | null) ?? null,
    currency: (row.currency as string | null) ?? null,
    envelopeId: (row.envelope_id as string | null) ?? null,
    errorCode: (row.error_code as string | null) ?? null,
    errorMessage: (row.error_message as string | null) ?? null,
    at: (row.at as string | null) ?? null,
    ledgerConfirmed: !!ledgerRow,
  };
}
