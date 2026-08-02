import { currentUser } from "@/lib/auth";
import { sqlGet, sqlRun } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Only the owner of a run may publish it. */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "sign in required" }, { status: 401 });

  const run = await sqlGet<{ owner_id: string }>(
    "SELECT owner_id FROM runs WHERE id = ?",
    [params.id]
  );
  if (!run || run.owner_id !== user.id) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  let shared = true;
  try {
    const body = (await req.json()) as { shared?: boolean };
    shared = body.shared !== false;
  } catch {
    // default to sharing
  }

  await sqlRun("UPDATE runs SET shared = ? WHERE id = ?", [
    shared ? 1 : 0,
    params.id,
  ]);
  return Response.json({ ok: true, shared });
}
