import { randomBytes } from "node:crypto";
import { sqlAll, sqlGet, sqlRun, upsertOffer } from "./db";

export interface ListingRow {
  id: string;
  owner_id: string;
  gpu: string;
  vram_gb: number;
  rate_cents_per_hour: number;
  floor_cents_per_hour: number;
  max_duration_h: number;
  available: 0 | 1;
  created_at: string;
}

export interface ListingInput {
  gpu: string;
  vramGb: number;
  rateCentsPerHour: number;
  /** Lowest they will accept after a negotiation. Never advertised. */
  floorCentsPerHour?: number;
  maxDurationH: number;
  available?: boolean;
}

function consoleUrl(): string {
  return (process.env.CONSOLE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/**
 * A listing is published to the same registry Agent B publishes to, in the
 * same shape. The buying agent cannot tell the difference: it reads a
 * quoteUrl and asks for a price. The only difference is that a platform
 * supplier's URL points back at us, because a person signing up cannot run
 * an HTTP server of their own.
 */
export function offerBodyFor(listing: ListingRow) {
  return {
    id: `off_${listing.id}`,
    agentId: `sup_${listing.owner_id}`,
    service: "gpu_compute",
    quoteUrl: `${consoleUrl()}/api/suppliers/quote?listing=${listing.id}`,
    requoteUrl: `${consoleUrl()}/api/suppliers/requote?listing=${listing.id}`,
    maxDurationH: listing.max_duration_h,
    skus: [
      {
        sku: listing.id,
        gpu: listing.gpu,
        vramGb: listing.vram_gb,
        rateCentsPerHour: listing.rate_cents_per_hour,
      },
    ],
    availableNow: listing.available === 1,
  };
}

export async function syncListingOffer(listing: ListingRow): Promise<void> {
  await upsertOffer(
    `off_${listing.id}`,
    `sup_${listing.owner_id}`,
    offerBodyFor(listing),
    listing.owner_id
  );
}

export async function createListing(
  ownerId: string,
  input: ListingInput
): Promise<ListingRow> {
  const id = `ls_${randomBytes(5).toString("hex")}`;
  const floor =
    input.floorCentsPerHour ?? Math.ceil(input.rateCentsPerHour * 0.9);
  await sqlRun(
    `INSERT INTO listings (id, owner_id, gpu, vram_gb, rate_cents_per_hour,
       floor_cents_per_hour, max_duration_h, available, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      ownerId,
      input.gpu,
      input.vramGb,
      input.rateCentsPerHour,
      Math.min(floor, input.rateCentsPerHour),
      input.maxDurationH,
      input.available === false ? 0 : 1,
      new Date().toISOString(),
    ]
  );
  const listing = (await getListing(id))!;
  await syncListingOffer(listing);
  return listing;
}

export async function getListing(id: string): Promise<ListingRow | null> {
  return (
    (await sqlGet<ListingRow>("SELECT * FROM listings WHERE id = ?", [id])) ??
    null
  );
}

export async function listingsForOwner(ownerId: string): Promise<ListingRow[]> {
  return sqlAll<ListingRow>(
    "SELECT * FROM listings WHERE owner_id = ? ORDER BY created_at DESC",
    [ownerId]
  );
}

export async function allListings(): Promise<ListingRow[]> {
  return sqlAll<ListingRow>(
    "SELECT * FROM listings WHERE available = 1 ORDER BY rate_cents_per_hour ASC"
  );
}

/** What a supplier has earned, from the append-only ledger. */
export async function salesForOwner(ownerId: string) {
  return sqlAll<{
    id: number;
    amount_cents: number;
    at: string;
    merchant_ref: string | null;
    run_id: string;
  }>(
    `SELECT id, amount_cents, at, merchant_ref, run_id FROM ledger
     WHERE supplier_owner_id = ? AND entry_type = 'spend' ORDER BY at DESC`,
    [ownerId]
  );
}
