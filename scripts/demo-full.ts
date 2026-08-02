import { execSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(__dirname, "..");
try {
  process.loadEnvFile(path.join(root, ".env"));
} catch {
  // no .env; rely on ambient environment
}

import { runBuyerAgent } from "../apps/console/lib/agent-a";
import { amendActiveMandate } from "../apps/console/lib/amendments";
import { insertTraceEvent, setRunState, sqlAll, upsertOffer } from "../apps/console/lib/db";
import {
  awaitNewMandate,
  createEnvelopeSession,
  findReusableEnvelope,
  knownMandateIds,
  storeEnvelope,
  type EnvelopeLabel,
  type EnvelopeRow,
} from "../apps/console/lib/envelopes";
import { awaitReply } from "../apps/console/lib/escalation-flow";
import { evaluateQuote } from "../apps/console/lib/evaluate-quote";
import { usd } from "../apps/console/lib/money";
import { portfolioMeter } from "../apps/console/lib/portfolio";
import { findQuote } from "../apps/console/lib/quotes";
import { OfferSchema } from "../apps/console/lib/registry";
import { settleRun } from "../apps/console/lib/settlement";
import { printLedger, printMeter } from "./report";
import { POLICY_AMOUNT_CAP_CENTS, seedPolicyMandate } from "./seed-mandate";
import { runSecondNeed } from "./second-need";
import { demoNeed } from "./start-run";

const REHEARSE = process.argv.includes("--rehearse");
const AGENT_B_URL =
  process.env.AGENT_B_URL ?? "https://quartermaster-agent-b.fly.dev";

function beat(n: number, title: string): void {
  console.log(`\n=== BEAT ${n.toString().padStart(2, " ")}: ${title} ===`);
}

function humanTouch(n: number, msg: string): void {
  console.log(`\n*** HUMAN TOUCH ${n}/3 *** ${msg}`);
}

async function ensureEnvelope(
  label: EnvelopeLabel,
  touchNo: number
): Promise<EnvelopeRow> {
  const reusable = await findReusableEnvelope(label);
  if (reusable) {
    console.log(
      `envelope ${label}: reusing unused ${reusable.id} (${reusable.prava_mandate_id}, cycle open)`
    );
    return reusable;
  }
  const known = await knownMandateIds();
  const { approvalUrl } = await createEnvelopeSession(label);
  humanTouch(
    touchNo,
    `Passkey-approve Envelope ${label} (team card ...2226, enrolled Chrome). Waiting...\n    ${approvalUrl}`
  );
  const mandate = await awaitNewMandate(known);
  const row = await storeEnvelope(label, mandate);
  console.log(
    `envelope ${label}: ${row.id} prava=${mandate.id} merchant=${row.merchant_name} cap=${usd(row.per_charge_cap_cents)}/charge renews=${row.renews_at}`
  );
  return row;
}

async function main(): Promise<void> {
  execSync("pnpm db:migrate", { cwd: root, stdio: "inherit" });
  console.log(`policy mandate: ${await seedPolicyMandate()}`);

  const offer = OfferSchema.parse(
    await (await fetch(`${AGENT_B_URL}/offer`)).json()
  );
  await upsertOffer(offer.id, offer.agentId, offer);

  if (REHEARSE) {
    console.log(
      "\n--rehearse: beats 2-8 only. No Prava calls, no envelopes, no settlement."
    );
  } else {
    beat(1, "Evening. Owner approves the ENVELOPE PORTFOLIO (LOCK 2, twice)");
    await ensureEnvelope("A", 1);
    await ensureEnvelope("B", 2);
  }

  beat(2, "3:12 AM. Agent A hits a GPU capacity wall");
  beat(3, "Discovery. Agent A broadcasts a Need; Agent B answers");
  beat(4, "Negotiation flash. One visible exchange. Quote: $47.00");
  beat(5, "Mandate evaluation. Arbiter walks every clause");
  beat(6, "REFUSE. $47.00 vs the $40.00 per-charge policy cap (LOCK 1)");
  const { runId, verdict } = await runBuyerAgent(demoNeed());
  if (!verdict) throw new Error("run produced no verdict: failing closed");
  console.log(
    `verdict: ${verdict.decision}${verdict.determinedBy[0] ? ` (${verdict.determinedBy[0].detail})` : ""}`
  );
  if (verdict.decision !== "NEEDS_HUMAN") {
    throw new Error(`expected NEEDS_HUMAN, got ${verdict.decision}`);
  }
  const quoteId = verdict.proposalId;

  beat(7, "Escalate. iMessage to the owner");
  humanTouch(
    3,
    "Reply on iMessage (or the console approval strip): APPROVE, DECLINE, or RAISE CAP TO $47. Waiting..."
  );
  const reply = await awaitReply(runId);
  console.log(
    `owner replied: ${reply.action}${reply.newCapCents ? ` ${usd(reply.newCapCents)}` : ""}`
  );

  if (reply.action === "decline") {
    await setRunState(runId, "declined_by_owner");
    await insertTraceEvent(runId, { type: "owner_declined" });
    console.log("owner declined; the money never moves. Run ends.");
    return;
  }

  beat(8, "Amendment. NEW signed mandate supersedes the old. Re-evaluate");
  const quote = await findQuote(runId, quoteId);
  if (!quote) throw new Error("quote vanished from trace: failing closed");
  // APPROVE = raise the cap to exactly this quote, recorded as an amendment.
  const newCap = reply.action === "raise_cap" ? reply.newCapCents! : quote.amountCents;
  const { oldId, newId } = await amendActiveMandate(runId, newCap, `owner reply: ${reply.action}`);
  console.log(`amended: ${oldId} -> ${newId} (amount_cap now ${usd(newCap)})`);
  const verdict2 = await evaluateQuote(runId, quoteId);
  console.log(`re-eval: ${verdict2.decision}`);
  if (verdict2.decision !== "EXECUTE") {
    throw new Error(`expected EXECUTE after amendment, got ${verdict2.decision}`);
  }

  if (REHEARSE) {
    // Restore the seed policy cap so the next real run refuses at beat 6.
    // Mandates are immutable: the restore is itself a superseding amendment.
    const reset = await amendActiveMandate(
      runId,
      POLICY_AMOUNT_CAP_CENTS,
      "rehearsal reset: restore policy cap"
    );
    console.log(
      `rehearsal reset: ${reset.oldId} -> ${reset.newId} (amount_cap back to ${usd(POLICY_AMOUNT_CAP_CENTS)})`
    );
    console.log("\n--rehearse complete: stopped before settlement (beat 9+ needs Prava).");
    return;
  }

  beat(9, "Settlement. Router selects Envelope A. Fresh credential, no passkey");
  const s1 = await settleRun(runId, quoteId, verdict2, { autonomous: false });
  console.log(
    `settled: ${usd(s1.amountCents)} from Envelope ${s1.envelope.label} ref=${s1.merchantRef} txn=${s1.transactionId} [${s1.mode.toUpperCase()}]`
  );

  beat(10, "Agent B provisions compute. Agent A's job finishes");

  beat(11, "Hours later. Second need. Router skips A, selects B. ZERO touches");
  await runSecondNeed();

  beat(12, "The ledger and the audit trail. Every cent attributed");
  await printLedger();
  await printMeter();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
