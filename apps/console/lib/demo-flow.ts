import type { Verdict } from "mandate-arbiter";
import { runBuyerAgent } from "./agent-a";
import { amendActiveMandate } from "./amendments";
import { insertTraceEvent, setRunState, sqlGet } from "./db";
import { evaluateQuote } from "./evaluate-quote";
import { usd } from "./money";
import { findQuote } from "./quotes";
import type { Need } from "./registry";
import { settleRun, type SettlementResult } from "./settlement";

/** Beat 2-8 need: prices to exactly 4700c against agent B's list
 *  (A100 80GB x 4h x 1175c), over the $40 policy cap on purpose. */
export function demoNeed(): Need {
  return {
    vramGb: 80,
    durationH: 4,
    deadline: new Date(Date.now() + 12 * 3_600_000).toISOString(),
    maxPriceCents: 4000,
  };
}

/** Beat 11 need: prices to exactly 1800c (L40S 48GB x 2h x 900c),
 *  inside the cap, so the whole loop runs with zero human touches. */
export function secondNeed(): Need {
  return {
    vramGb: 40,
    durationH: 2,
    deadline: new Date(Date.now() + 12 * 3_600_000).toISOString(),
    maxPriceCents: 2000,
  };
}

export async function runFirstNeed(): Promise<{
  runId: string;
  verdict: Verdict | null;
}> {
  const { runId, verdict } = await runBuyerAgent(demoNeed());
  return { runId, verdict };
}

/** The owner's reply, once the strict parser has accepted one. */
export async function recordedReply(
  runId: string
): Promise<{ action: "approve" | "decline" | "raise_cap"; newCapCents?: number } | null> {
  const row = await sqlGet<{
    action: "approve" | "decline" | "raise_cap";
    new_cap_cents: number | null;
  }>(
    "SELECT action, new_cap_cents FROM escalation_replies WHERE run_id = ? AND action IS NOT NULL ORDER BY id LIMIT 1",
    [runId]
  );
  if (!row) return null;
  return {
    action: row.action,
    ...(row.new_cap_cents != null ? { newCapCents: row.new_cap_cents } : {}),
  };
}

/**
 * Beat 8. The amendment is a NEW signed mandate superseding the old one;
 * the SAME quote is then re-evaluated by the arbiter. Declines end the run
 * and the money never moves.
 */
export async function amendAndReEvaluate(
  runId: string,
  quoteId: string
): Promise<Verdict | null> {
  const reply = await recordedReply(runId);
  if (!reply) throw new Error("no parsed owner reply yet: failing closed");

  if (reply.action === "decline") {
    await insertTraceEvent(runId, { type: "owner_declined" });
    await setRunState(runId, "declined_by_owner");
    return null;
  }
  const quote = await findQuote(runId, quoteId);
  if (!quote) throw new Error(`unknown quote ${quoteId}: failing closed`);

  const newCap =
    reply.action === "raise_cap" ? reply.newCapCents! : quote.amountCents;
  await amendActiveMandate(runId, newCap, `owner reply: ${reply.action}`);
  return evaluateQuote(runId, quoteId);
}

/** Beat 9: human-touched settlement (the owner approved this one). */
export async function settleFirst(
  runId: string,
  verdict: Verdict
): Promise<SettlementResult> {
  return settleRun(runId, verdict.proposalId, verdict, { autonomous: false });
}

/** Beat 11: full loop, zero human touches, ledger autonomous=1. */
export async function runSecondNeedFlow(): Promise<{
  runId: string;
  settlement: SettlementResult;
}> {
  const { runId, verdict } = await runBuyerAgent(secondNeed());
  if (!verdict || verdict.decision !== "EXECUTE") {
    throw new Error(
      `beat 11 expected EXECUTE, got ${verdict?.decision ?? "no verdict"}: failing closed`
    );
  }
  const settlement = await settleRun(runId, verdict.proposalId, verdict, {
    autonomous: true,
  });
  console.log(`beat 11 settled autonomously: ${settlement.receiptText}`);
  return { runId, settlement };
}

export { usd };
