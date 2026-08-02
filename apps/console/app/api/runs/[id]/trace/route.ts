import { traceEventsSince } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Full stored trace for a run, for replay-at-recorded-timing. */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const events = await traceEventsSince(params.id, 0).map((r) => ({
      id: r.id,
      at: r.at,
      body: JSON.parse(r.body) as Record<string, unknown>,
    }));
    return Response.json({ runId: params.id, events });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
