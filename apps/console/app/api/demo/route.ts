import { latestRunId, db } from "@/lib/db";
import {
  amendAndReEvaluate,
  recordedReply,
  runFirstNeed,
  runSecondNeedFlow,
  settleFirst,
} from "@/lib/demo-flow";
import {
  createEnvelopeSession,
  awaitNewMandate,
  knownMandateIds,
  storeEnvelope,
  type EnvelopeLabel,
} from "@/lib/envelopes";
import type { Verdict } from "mandate-arbiter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Latest recorded verdict for a run (the arbiter's, never the model's). */
function latestVerdict(runId: string): Verdict | null {
  const rows = db()
    .prepare("SELECT body FROM trace_events WHERE run_id = ? ORDER BY id DESC")
    .all(runId) as { body: string }[];
  for (const row of rows) {
    const b = JSON.parse(row.body) as { type?: string; verdict?: Verdict };
    if (b.type === "verdict_full" && b.verdict) return b.verdict;
  }
  return null;
}

export async function POST(req: Request) {
  let body: { action?: string; label?: string; runId?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const action = body.action;

  try {
    switch (action) {
      // Beat 1. Returns the approval URL; the passkey itself is the
      // owner's, on their device. Never automated, never bypassed.
      case "envelopeSession": {
        const label = body.label as EnvelopeLabel;
        if (label !== "A" && label !== "B") {
          return Response.json({ error: "label must be A or B" }, { status: 400 });
        }
        const known = await knownMandateIds();
        const { approvalUrl } = await createEnvelopeSession(label);
        return Response.json({ approvalUrl, known: [...known] });
      }

      // Polls List Mandates until the passkey-approved mandate appears.
      case "envelopeAwait": {
        const label = body.label as EnvelopeLabel;
        if (label !== "A" && label !== "B") {
          return Response.json({ error: "label must be A or B" }, { status: 400 });
        }
        const known = new Set<string>(
          (db().prepare("SELECT prava_mandate_id FROM envelopes").all() as {
            prava_mandate_id: string;
          }[]).map((r) => r.prava_mandate_id)
        );
        const mandate = await awaitNewMandate(known, 4 * 60_000);
        const row = storeEnvelope(label, mandate);
        return Response.json({ envelope: row });
      }

      case "run": {
        const { runId, verdict } = await runFirstNeed();
        return Response.json({ runId, decision: verdict?.decision ?? null });
      }

      case "replyStatus": {
        const runId = body.runId ?? latestRunId();
        if (!runId) return Response.json({ reply: null });
        return Response.json({ reply: recordedReply(runId) });
      }

      case "amend": {
        const runId = body.runId ?? latestRunId();
        if (!runId) return Response.json({ error: "no run" }, { status: 409 });
        const prior = latestVerdict(runId);
        if (!prior) return Response.json({ error: "no verdict" }, { status: 409 });
        const verdict = await amendAndReEvaluate(runId, prior.proposalId);
        return Response.json({ decision: verdict?.decision ?? "DECLINED_BY_OWNER" });
      }

      case "settle": {
        const runId = body.runId ?? latestRunId();
        if (!runId) return Response.json({ error: "no run" }, { status: 409 });
        const verdict = latestVerdict(runId);
        if (!verdict || verdict.decision !== "EXECUTE") {
          return Response.json(
            { error: `settlement requires EXECUTE, have ${verdict?.decision ?? "none"}` },
            { status: 409 }
          );
        }
        const s = await settleFirst(runId, verdict);
        return Response.json({
          envelope: s.envelope.label,
          amountCents: s.amountCents,
          merchantRef: s.merchantRef,
          transactionId: s.transactionId,
        });
      }

      case "second": {
        const { runId, settlement } = await runSecondNeedFlow();
        return Response.json({
          runId,
          envelope: settlement.envelope.label,
          amountCents: settlement.amountCents,
          merchantRef: settlement.merchantRef,
        });
      }

      default:
        return Response.json({ error: `unknown action ${action}` }, { status: 400 });
    }
  } catch (err) {
    console.error(`demo action ${action} failed: ${String(err)}`);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
