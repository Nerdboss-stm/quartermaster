import { nandaVerify } from "@/lib/nanda";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ref = new URL(req.url).searchParams.get("ref");
  if (!ref) {
    return Response.json(
      { error: { code: "INVALID_REQUEST", message: "ref query param required" } },
      { status: 400 }
    );
  }
  try {
    return Response.json(nandaVerify(ref));
  } catch (err) {
    console.error(`nanda verify failed for ${ref}: ${String(err)}`);
    return Response.json(
      { error: { code: "INTERNAL", message: String(err) } },
      { status: 500 }
    );
  }
}
