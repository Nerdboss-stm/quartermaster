import { ownerOrDemo } from "@/lib/auth";
import { latestPendingEscalation, recordReply } from "@/lib/escalation-flow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const { parsed, correction } = await recordReply(pending.run_id, body.raw, "console");
  return Response.json({ ok: true, parsed, correction: correction ?? null });
}
