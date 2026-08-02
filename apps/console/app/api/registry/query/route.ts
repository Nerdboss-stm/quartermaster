import { NeedSchema, queryOffers } from "@/lib/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = NeedSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid need", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  try {
    return Response.json({ matches: await queryOffers(parsed.data) });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
