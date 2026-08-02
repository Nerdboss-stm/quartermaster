import { allOffers, sqlAll } from "./db";
import { MERCHANT } from "./merchant";
import { OfferSchema } from "./registry";

export interface MarketRow {
  offerId: string;
  agentId: string;
  seller: string;
  /** An outside merchant on its own host, or a supplier with an account here. */
  kind: "merchant" | "supplier";
  gpu: string;
  vramGb: number;
  rateCentsPerHour: number;
  maxDurationH: number;
}

/**
 * The market as the buying agent sees it.
 *
 * Read straight out of the registry it queries, not a curated list — an
 * offer that fails to parse does not render here for the same reason it
 * never matches a need. Advertised rates only: what a seller will actually
 * accept comes from their own quote endpoint, and their floor is private.
 */
export async function marketRows(): Promise<MarketRow[]> {
  const [offers, users] = await Promise.all([
    allOffers(),
    sqlAll<{ id: string; display_name: string }>(
      "SELECT id, display_name FROM users"
    ),
  ]);
  const nameFor = new Map(users.map((u) => [u.id, u.display_name]));

  const rows: MarketRow[] = [];
  for (const row of offers) {
    let parsed: ReturnType<typeof OfferSchema.safeParse>;
    try {
      parsed = OfferSchema.safeParse(JSON.parse(row.body));
    } catch {
      continue;
    }
    if (!parsed.success || !parsed.data.availableNow) continue;
    const offer = parsed.data;

    const ownerId = offer.agentId.startsWith("sup_")
      ? offer.agentId.slice(4)
      : null;
    for (const sku of offer.skus) {
      rows.push({
        offerId: offer.id,
        agentId: offer.agentId,
        seller: ownerId
          ? (nameFor.get(ownerId) ?? offer.agentId)
          : MERCHANT.name,
        kind: ownerId ? "supplier" : "merchant",
        gpu: sku.gpu,
        vramGb: sku.vramGb,
        rateCentsPerHour: sku.rateCentsPerHour,
        maxDurationH: offer.maxDurationH,
      });
    }
  }
  return rows.sort((a, b) => a.rateCentsPerHour - b.rateCentsPerHour);
}
