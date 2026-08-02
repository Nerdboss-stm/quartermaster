import { runBuyerAgent } from "./agent-a";
import { insertTraceEvent, sqlAll, sqlRun } from "./db";
import {
  claimNeed,
  getNeed,
  releaseNeed,
  setNeedState,
  type NeedRow,
} from "./needs";
import { queryOffers, type Need } from "./registry";
import { settleRun } from "./settlement";

/** A need is abandoned if it has been 'running' this long. */
const STALE_RUN_MS = 15 * 60_000;

export interface MatchOutcome {
  needId: string;
  state: NeedRow["state"] | "skipped";
  runId?: string;
  detail?: string;
}

function toNeed(row: NeedRow): Need {
  return {
    vramGb: row.vram_gb,
    durationH: row.duration_h,
    deadline: row.deadline,
    maxPriceCents: row.max_price_cents,
  };
}

/**
 * Run one need to a conclusion: find supply, let the buying agent
 * negotiate, and let the arbiter rule. Money only moves on EXECUTE, and
 * only through settleRun.
 *
 * The caller must already hold the claim (see claimNeed) — this function
 * assumes exclusivity and does not check for it.
 */
export async function runClaimedNeed(row: NeedRow): Promise<MatchOutcome> {
  const need = toNeed(row);

  // No supply yet is not a failure: the need goes back to pending and waits
  // for a supplier to list capacity. That is the whole point of sleeping.
  const matches = await queryOffers(need);
  if (matches.length === 0) {
    await releaseNeed(row.id);
    return { needId: row.id, state: "pending", detail: "no matching supply yet" };
  }

  let runId: string | undefined;
  try {
    const result = await runBuyerAgent(need, row.owner_id, row.id);
    runId = result.runId;
    const verdict = result.verdict;

    if (!verdict) {
      await setNeedState(row.id, "failed", runId);
      return { needId: row.id, state: "failed", runId, detail: "no verdict" };
    }

    if (verdict.decision === "REFUSE") {
      await setNeedState(row.id, "refused", runId);
      return {
        needId: row.id,
        state: "refused",
        runId,
        detail: verdict.determinedBy[0]?.detail,
      };
    }

    if (verdict.decision === "NEEDS_HUMAN") {
      // The agent's escalate tool has already texted the owner. The reply
      // arrives at the webhook and continues from there; nothing waits here.
      await setNeedState(row.id, "escalated", runId);
      return {
        needId: row.id,
        state: "escalated",
        runId,
        detail: verdict.determinedBy[0]?.detail,
      };
    }

    const settlement = await settleRun(runId, verdict.proposalId, verdict, {
      autonomous: true,
    });
    await setNeedState(row.id, "settled", runId);
    return {
      needId: row.id,
      state: "settled",
      runId,
      detail: settlement.receiptText,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await setNeedState(row.id, "failed", runId);
    if (runId) {
      await insertTraceEvent(runId, { type: "match_failed", error: message });
    }
    return { needId: row.id, state: "failed", runId, detail: message };
  }
}

/** Claim then run. Returns null when someone else got there first. */
export async function tryRunNeed(needId: string): Promise<MatchOutcome | null> {
  if (!(await claimNeed(needId))) return null;
  const row = await getNeed(needId);
  if (!row) return null;
  return runClaimedNeed(row);
}

/**
 * Housekeeping plus a bounded amount of work. Called by the cron, by a new
 * listing arriving, and by an open dashboard.
 *
 * A need stuck in 'running' is marked failed, never retried: the previous
 * attempt may have charged a card, and a blind retry could charge it
 * twice. A human can post the need again.
 */
export async function tickMatcher(limit = 2): Promise<MatchOutcome[]> {
  const now = new Date().toISOString();

  await sqlRun(
    "UPDATE needs SET state = 'expired', updated_at = ? WHERE state = 'pending' AND deadline < ?",
    [now, now]
  );
  await sqlRun(
    "UPDATE needs SET state = 'failed', updated_at = ? WHERE state = 'running' AND claimed_at < ?",
    [now, new Date(Date.now() - STALE_RUN_MS).toISOString()]
  );

  const pending = await sqlAll<{ id: string }>(
    "SELECT id FROM needs WHERE state = 'pending' ORDER BY created_at LIMIT ?",
    [limit]
  );

  const outcomes: MatchOutcome[] = [];
  for (const { id } of pending) {
    const outcome = await tryRunNeed(id);
    if (outcome) outcomes.push(outcome);
  }
  return outcomes;
}
