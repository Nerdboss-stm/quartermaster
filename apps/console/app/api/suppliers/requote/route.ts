import { getListing } from "@/lib/listings";
import { repriceQuote } from "@/lib/supplier-pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One negotiation round, matching Agent B's contract exactly. */
export async function POST(req: Request) {
  const listingId = new URL(req.url).searchParams.get("listing");
  if (!listingId) {
    return Response.json({ error: "listing required" }, { status: 400 });
  }

  const listing = await getListing(listingId);
  if (!listing) {
    return Response.json({ error: "listing unavailable" }, { status: 404 });
  }

  let body: { quoteId?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.quoteId) {
    return Response.json({ error: "quoteId required" }, { status: 400 });
  }

  const result = await repriceQuote(listing, body.quoteId);
  if ("error" in result) {
    return Response.json({ error: result.error }, { status: 404 });
  }
  console.log(
    `supplier requote ${body.quoteId}: ${result.amountCents}c held=${result.held === true}`
  );
  return Response.json(result);
}
