import { ownerOrDemo } from "@/lib/auth";
import { latestRunId } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ id: await latestRunId(await ownerOrDemo()) });
  } catch (err) {
    // Pre-migration the panel just shows NO RUN; not an error state.
    return Response.json({ id: null, note: String(err) });
  }
}
