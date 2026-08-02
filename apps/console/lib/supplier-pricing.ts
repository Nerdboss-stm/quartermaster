import { randomBytes } from "node:crypto";
import { sqlGet, sqlRun } from "./db";
import type { ListingRow } from "./listings";

/**
 * The same pricing contract Agent B implements, for suppliers who signed
 * up here instead of running their own host. Prices round up to the cent,
 * and the rule is printed on the quote so a buyer can check the arithmetic
 * rather than trust it.
 */
export interface SupplierQuote {
  id: string;
  counterpartyId: string;
  amountCents: number;
  currency: "USD";
  attributes: { gpu: string; vram_gb: number; duration_h: number };
  createdAt: string;
  pricingRule: string;
  held?: boolean;
  note?: string;
}

export interface QuoteNeed {
  vramGb: number;
  durationH: number;
}

export function priceQuote(
  listing: ListingRow,
  need: QuoteNeed
): SupplierQuote | { error: string } {
  if (need.durationH > listing.max_duration_h) {
    return {
      error: `duration ${need.durationH}h exceeds max ${listing.max_duration_h}h`,
    };
  }
  if (need.vramGb > listing.vram_gb) {
    return { error: `needs ${need.vramGb}GB, listing has ${listing.vram_gb}GB` };
  }

  const amountCents = Math.ceil(need.durationH * listing.rate_cents_per_hour);
  return {
    id: `qt_${randomBytes(6).toString("hex")}`,
    counterpartyId: `sup_${listing.owner_id}`,
    amountCents,
    currency: "USD",
    attributes: {
      gpu: listing.gpu,
      vram_gb: listing.vram_gb,
      duration_h: need.durationH,
    },
    createdAt: new Date().toISOString(),
    pricingRule: `ceil(${need.durationH}h x ${listing.rate_cents_per_hour}c/GPU-h) = ${amountCents}c`,
  };
}

export async function storeQuote(
  listingId: string,
  quote: SupplierQuote
): Promise<void> {
  await sqlRun(
    "INSERT INTO supplier_quotes (id, listing_id, body, requoted, created_at) VALUES (?, ?, ?, 0, ?)",
    [quote.id, listingId, JSON.stringify(quote), new Date().toISOString()]
  );
}

export async function loadQuote(id: string): Promise<{
  quote: SupplierQuote;
  listingId: string;
  requoted: boolean;
} | null> {
  const row = await sqlGet<{
    body: string;
    listing_id: string;
    requoted: number;
  }>("SELECT body, listing_id, requoted FROM supplier_quotes WHERE id = ?", [id]);
  if (!row) return null;
  return {
    quote: JSON.parse(row.body) as SupplierQuote,
    listingId: row.listing_id,
    requoted: row.requoted === 1,
  };
}

/**
 * One reprice per quote, and only down to the supplier's private floor.
 * A seller who is already at their floor holds, and says so — the same
 * honest refusal Agent B gives.
 */
export async function repriceQuote(
  listing: ListingRow,
  quoteId: string
): Promise<SupplierQuote | { error: string }> {
  const stored = await loadQuote(quoteId);
  if (!stored) return { error: `unknown quote ${quoteId}` };

  const { quote } = stored;
  if (stored.requoted) {
    return { ...quote, held: true, note: "already repriced once; holding" };
  }

  // Claim the single reprice atomically, so two asks cannot both discount.
  const claim = await sqlRun(
    "UPDATE supplier_quotes SET requoted = 1 WHERE id = ? AND requoted = 0",
    [quoteId]
  );
  if (claim.changes !== 1) {
    return { ...quote, held: true, note: "already repriced once; holding" };
  }

  const candidate = Math.ceil(quote.amountCents * 0.9);
  const impliedRate = candidate / quote.attributes.duration_h;
  if (impliedRate < listing.floor_cents_per_hour) {
    return {
      ...quote,
      held: true,
      note: `at floor for ${listing.gpu}; holding at ${quote.amountCents}c`,
    };
  }

  const updated: SupplierQuote = {
    ...quote,
    amountCents: candidate,
    held: false,
    note: `dropped 10%: ceil(${quote.amountCents}c x 0.9) = ${candidate}c`,
    pricingRule: `ceil(${quote.amountCents}c x 0.9) = ${candidate}c`,
  };
  await sqlRun("UPDATE supplier_quotes SET body = ? WHERE id = ?", [
    JSON.stringify(updated),
    quoteId,
  ]);
  return updated;
}
