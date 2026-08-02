import { getListing } from "@/lib/listings";
import { priceQuote, storeQuote } from "@/lib/supplier-pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A platform supplier's quote endpoint. Published in the registry exactly
 * like Agent B's, and unauthenticated for the same reason: a price is not
 * a secret. Whether the price is allowed to be paid is the arbiter's call,
 * every time.
 */
export async function POST(req: Request) {
  const listingId = new URL(req.url).searchParams.get("listing");
  if (!listingId) {
    return Response.json({ error: "listing required" }, { status: 400 });
  }

  const listing = await getListing(listingId);
  if (!listing || listing.available !== 1) {
    return Response.json({ error: "listing unavailable" }, { status: 404 });
  }

  let body: { vramGb?: number; durationH?: number };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  if (
    typeof body.vramGb !== "number" ||
    typeof body.durationH !== "number" ||
    body.durationH <= 0
  ) {
    return Response.json({ error: "invalid need" }, { status: 400 });
  }

  const quote = priceQuote(listing, {
    vramGb: body.vramGb,
    durationH: body.durationH,
  });
  if ("error" in quote) {
    return Response.json({ error: quote.error }, { status: 422 });
  }

  await storeQuote(listing.id, quote);
  console.log(
    `supplier quote ${quote.id}: ${quote.amountCents}c [${quote.pricingRule}]`
  );
  return Response.json(quote);
}
