import type { ParsedReply } from "@quartermaster/escalation";
import { amendActiveMandate } from "./amendments";
import { insertTraceEvent, setRunState } from "./db";
import {
  buildEscalator,
  ownerNumber,
  type PendingEscalation,
} from "./escalation-flow";
import { evaluateQuote } from "./evaluate-quote";
import { needForRun, setNeedState } from "./needs";
import { findQuote } from "./quotes";
import { settleRun } from "./settlement";
import { getUser } from "./tenant";
import { usd } from "./money";

export interface ContinuationResult {
  status: "settled" | "declined" | "still_refused" | "skipped" | "failed";
  detail: string;
  runId: string;
}

/**
 * What happens after the owner answers.
 *
 * The old flow had a CLI process sitting in a loop waiting for a reply. A
 * product cannot work that way: the owner is asleep and nothing of ours is
 * running. So the reply itself drives the rest — amend the policy,
 * re-evaluate the same quote, and settle — entirely server-side, whether
 * it arrived by iMessage or from the in-app inbox.
 *
 * The caller must have already claimed the escalation (recordReply's
 * atomic status flip), so this runs exactly once per answer even if Linq
 * delivers the same message twice.
 */
export async function continueAfterReply(
  escalation: PendingEscalation,
  parsed: ParsedReply
): Promise<ContinuationResult> {
  const runId = escalation.run_id;

  // Only product runs continue here. A demo run driven by the CLI has no
  // need attached, and it does its own amend-and-settle; continuing here
  // too would settle the same quote twice.
  const need = await needForRun(runId);
  if (!need) {
    return {
      status: "skipped",
      runId,
      detail: "no need attached; reply recorded only",
    };
  }

  const owner = await getUser(need.owner_id);
  const notify = buildEscalator(
    runId,
    ownerNumber(need.owner_id, owner?.phone)
  );

  if (parsed.action === "decline") {
    await insertTraceEvent(runId, { type: "owner_declined" });
    await setRunState(runId, "declined_by_owner");
    await setNeedState(need.id, "declined");
    await notify.sendText("Declined. Nothing was charged.").catch(() => {});
    return { status: "declined", runId, detail: "owner declined" };
  }

  try {
    const quote = await findQuote(runId, escalation.quote_id);
    if (!quote) throw new Error(`quote ${escalation.quote_id} missing`);

    // APPROVE raises the cap to exactly this purchase; RAISE CAP TO $X
    // raises it to what they said. Either way it is a new signed mandate
    // superseding the old one, never an edit.
    const newCap =
      parsed.action === "raise_cap" ? parsed.newCapCents! : quote.amountCents;
    await amendActiveMandate(
      runId,
      newCap,
      `owner reply: ${parsed.action}`
    );

    const verdict = await evaluateQuote(runId, escalation.quote_id);
    if (verdict.decision !== "EXECUTE") {
      // They raised it, but not enough — or another clause now binds.
      const detail =
        verdict.determinedBy[0]?.detail ?? "still outside policy";
      await insertTraceEvent(runId, {
        type: "continuation_still_refused",
        decision: verdict.decision,
        detail,
      });
      await notify
        .sendText(`Still blocked: ${detail}. Reply RAISE CAP TO $X to allow it.`)
        .catch(() => {});
      return { status: "still_refused", runId, detail };
    }

    // A human touched this one, so it is not marked autonomous.
    const settlement = await settleRun(runId, escalation.quote_id, verdict, {
      autonomous: false,
    });
    await setNeedState(need.id, "settled", runId);
    return {
      status: "settled",
      runId,
      detail: `${usd(settlement.amountCents)} from Envelope ${settlement.envelope.label}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await insertTraceEvent(runId, {
      type: "continuation_failed",
      error: message,
    });
    await setNeedState(need.id, "failed", runId);
    await notify
      .sendText(`Could not complete that purchase: ${message}`)
      .catch(() => {});
    return { status: "failed", runId, detail: message };
  }
}
