import { traceEventsSince } from "@/lib/db";

import { canReadRun } from "@/lib/run-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Full stored trace for a run, for replay-at-recorded-timing. */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  if (!(await canReadRun(req, params.id))) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  try {
    // ?after=<id> makes this a cursor endpoint. Short polling costs far
    // less on serverless than holding an SSE function open per viewer.
    const after = Number(new URL(req.url).searchParams.get("after") ?? 0);
    const rows = await traceEventsSince(
      params.id,
      Number.isFinite(after) ? after : 0
    );
    const events = rows.map((r) => ({
      id: r.id,
      at: r.at,
      body: JSON.parse(r.body) as Record<string, unknown>,
    }));
    return Response.json({ runId: params.id, events });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
