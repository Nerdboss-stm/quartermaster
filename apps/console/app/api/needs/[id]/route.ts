import { currentUser } from "@/lib/auth";
import { sqlGet } from "@/lib/db";
import { getNeed } from "@/lib/needs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Polled while a need is in flight, to learn its state and its run id. */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "sign in required" }, { status: 401 });

  const need = await getNeed(params.id);
  if (!need || need.owner_id !== user.id) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  // Whether the owner was actually reached, so the page never claims a
  // text that did not arrive.
  const escalation = need.run_id
    ? await sqlGet<{ delivery: string | null }>(
        "SELECT delivery FROM escalations WHERE run_id = ? ORDER BY id DESC LIMIT 1",
        [need.run_id]
      )
    : null;

  return Response.json({
    state: need.state,
    runId: need.run_id,
    updatedAt: need.updated_at,
    delivery: escalation?.delivery ?? null,
  });
}
