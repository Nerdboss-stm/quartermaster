import { currentUser } from "@/lib/auth";
import { tryRunNeed } from "@/lib/matcher";
import { getNeed } from "@/lib/needs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** "Run now" — for when the owner does not want to wait for a trigger. */
export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "sign in required" }, { status: 401 });

  const need = await getNeed(params.id);
  if (!need || need.owner_id !== user.id) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  const outcome = await tryRunNeed(need.id);
  if (!outcome) {
    return Response.json({
      claimed: false,
      detail: `need is ${need.state}, not pending`,
    });
  }
  return Response.json({ claimed: true, outcome });
}
