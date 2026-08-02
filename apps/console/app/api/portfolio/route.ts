import { ownerOrDemo } from "@/lib/auth";
import { portfolioMeter } from "@/lib/portfolio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await portfolioMeter(await ownerOrDemo()));
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
