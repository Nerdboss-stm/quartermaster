import { upsertOffer } from "@/lib/db";
import { OfferSchema } from "@/lib/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = OfferSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid offer", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  try {
    upsertOffer(parsed.data.id, parsed.data.agentId, parsed.data);
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
  return Response.json({ ok: true, id: parsed.data.id });
}
