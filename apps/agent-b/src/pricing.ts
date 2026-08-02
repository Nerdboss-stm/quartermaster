import { randomUUID } from "node:crypto";

export interface Need {
  vramGb: number;
  durationH: number;
  deadline: string;
  maxPriceCents: number;
}

export interface Quote {
  id: string;
  counterpartyId: "agent_b";
  amountCents: number;
  currency: "USD";
  attributes: { gpu: string; vram_gb: number; duration_h: number };
  createdAt: string;
  pricingRule: string;
  held?: boolean;
  note?: string;
}

interface Sku {
  sku: string;
  gpu: string;
  vramGb: number;
  rateCentsPerHour: number;
  /** Below this per-hour rate agent B will not sell. Never advertised. */
  floorCentsPerHour: number;
}

// The A100 is priced at floor: 3 AM capacity crunch, no margin to give.
// The L40S carries margin and can genuinely drop 10% when asked.
const PRICE_LIST: Sku[] = [
  { sku: "a100-80g", gpu: "A100 80GB", vramGb: 80, rateCentsPerHour: 1175, floorCentsPerHour: 1175 },
  { sku: "l40s-48g", gpu: "L40S 48GB", vramGb: 48, rateCentsPerHour: 900, floorCentsPerHour: 810 },
];

export const MAX_DURATION_H = 8;

export function skuCatalog() {
  // Floors are private; advertise only public rates.
  return PRICE_LIST.map(({ sku, gpu, vramGb, rateCentsPerHour }) => ({
    sku,
    gpu,
    vramGb,
    rateCentsPerHour,
  }));
}

export interface StoredQuote {
  quote: Quote;
  sku: Sku;
  need: Need;
  requoted: boolean;
}

export function quoteFor(need: Need): StoredQuote | { error: string } {
  if (need.durationH > MAX_DURATION_H) {
    return { error: `duration ${need.durationH}h exceeds max ${MAX_DURATION_H}h` };
  }
  const eligible = PRICE_LIST.filter((s) => s.vramGb >= need.vramGb).sort(
    (a, b) => a.rateCentsPerHour - b.rateCentsPerHour
  );
  const sku = eligible[0];
  if (!sku) return { error: `no sku with >= ${need.vramGb}GB VRAM` };

  const amountCents = Math.ceil(need.durationH * sku.rateCentsPerHour);
  const quote: Quote = {
    id: `qt_${randomUUID().slice(0, 12)}`,
    counterpartyId: "agent_b",
    amountCents,
    currency: "USD",
    attributes: { gpu: sku.gpu, vram_gb: sku.vramGb, duration_h: need.durationH },
    createdAt: new Date().toISOString(),
    pricingRule: `ceil(${need.durationH}h x ${sku.rateCentsPerHour}c/GPU-h) = ${amountCents}c`,
  };
  return { quote, sku, need, requoted: false };
}

/**
 * One reprice per quote: drop 10% (ceil) if the implied per-hour rate
 * stays at or above the sku floor; otherwise hold at the current price.
 * Asked again: hold.
 */
export function requote(stored: StoredQuote): Quote {
  const { quote, sku, need } = stored;
  if (stored.requoted) {
    return {
      ...quote,
      held: true,
      note: "already repriced once this run; holding",
    };
  }
  stored.requoted = true;

  const candidate = Math.ceil(quote.amountCents * 0.9);
  const impliedRate = candidate / need.durationH;
  if (impliedRate >= sku.floorCentsPerHour) {
    stored.quote = {
      ...quote,
      amountCents: candidate,
      held: false,
      note: `dropped 10%: ceil(${quote.amountCents}c x 0.9) = ${candidate}c`,
      pricingRule: `ceil(${quote.amountCents}c x 0.9) = ${candidate}c`,
    };
    return stored.quote;
  }
  return {
    ...quote,
    held: true,
    note: `at floor for ${sku.sku}; holding at ${quote.amountCents}c`,
  };
}
