import { NandaError, nandaQuote } from "@/lib/nanda";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { error: { code: "INVALID_JSON", message: "invalid json body" } },
      { status: 400 }
    );
  }
  try {
    return Response.json(await nandaQuote(body));
  } catch (err) {
    if (err instanceof NandaError) {
      console.warn(`nanda quote refused: ${err.code} ${err.message}`);
      return Response.json(
        { error: { code: err.code, message: err.message, details: err.details } },
        { status: err.httpStatus }
      );
    }
    console.error(`nanda quote failed: ${String(err)}`);
    return Response.json(
      { error: { code: "INTERNAL", message: String(err) } },
      { status: 500 }
    );
  }
}
