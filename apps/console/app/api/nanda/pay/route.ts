import { NandaError, nandaPay } from "@/lib/nanda";
import { ownerForApiKey } from "@/lib/api-keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  let body: Partial<{
    ref: string;
    runId: string;
    quoteId: string;
    payer: string;
    payee: string;
    amountCents: number;
  }>;
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json(
      { error: { code: "INVALID_JSON", message: "invalid json body" } },
      { status: 400 }
    );
  }

  const missing = (["ref", "runId", "quoteId", "payer", "payee"] as const).filter(
    (k) => typeof body[k] !== "string" || !body[k]
  );
  if (missing.length > 0 || !Number.isInteger(body.amountCents)) {
    return Response.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: `missing or invalid: ${[...missing, ...(Number.isInteger(body.amountCents) ? [] : ["amountCents"])].join(", ")}`,
        },
      },
      { status: 400 }
    );
  }

  try {
    const result = await nandaPay(
      {
      ref: body.ref!,
      runId: body.runId!,
      quoteId: body.quoteId!,
      payer: body.payer!,
      payee: body.payee!,
        amountCents: body.amountCents!,
      },
      await ownerForApiKey(req)
    );
    return Response.json(result);
  } catch (err) {
    if (err instanceof NandaError) {
      console.warn(`nanda pay refused: ${err.code} ${err.message}`);
      return Response.json(
        { error: { code: err.code, message: err.message, details: err.details } },
        { status: err.httpStatus }
      );
    }
    console.error(`nanda pay failed: ${String(err)}`);
    return Response.json(
      { error: { code: "INTERNAL", message: String(err) } },
      { status: 500 }
    );
  }
}
