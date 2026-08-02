import { ownerOrDemo } from "@/lib/auth";
import { continueAfterReply } from "@/lib/continuation";
import { latestPendingEscalation, recordReply } from "@/lib/escalation-flow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Console-channel reply surface (fallback + guest runs). Same strict
 *  parser as the iMessage path. */
export async function POST(req: Request) {
  let body: { raw?: unknown };
  try {
    body = (await req.json()) as { raw?: unknown };
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  if (typeof body.raw !== "string" || body.raw.length === 0 || body.raw.length > 200) {
    return Response.json({ error: "raw reply required" }, { status: 400 });
  }
  const pending = await latestPendingEscalation(await ownerOrDemo());
  if (!pending) {
    return Response.json({ error: "no pending escalation" }, { status: 409 });
  }
  const { parsed, claimed, correction } = await recordReply(
    pending,
    body.raw,
    "console"
  );

  if (parsed && claimed) {
    const outcome = await continueAfterReply(pending, parsed);
    return Response.json({
      ok: true,
      parsed,
      correction: null,
      continuation: outcome,
    });
  }
  return Response.json({ ok: true, parsed, correction: correction ?? null });
}
