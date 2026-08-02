import { z } from "zod";
import { allOffers, upsertOffer } from "./db";

export const NeedSchema = z.object({
  vramGb: z.number().positive(),
  durationH: z.number().positive(),
  deadline: z
    .string()
    .refine((s) => !Number.isNaN(Date.parse(s)), "must be an ISO 8601 date"),
  maxPriceCents: z.number().int().positive(),
});
export type Need = z.infer<typeof NeedSchema>;

export const OfferSchema = z.object({
  id: z.string().min(1),
  agentId: z.string().min(1),
  service: z.string().min(1),
  quoteUrl: z.url(),
  requoteUrl: z.url(),
  maxDurationH: z.number().positive(),
  skus: z.array(
    z.object({
      sku: z.string().min(1),
      gpu: z.string().min(1),
      vramGb: z.number().positive(),
      rateCentsPerHour: z.number().int().positive(),
    })
  ),
  availableNow: z.boolean(),
});
export type Offer = z.infer<typeof OfferSchema>;

export interface OfferMatch {
  offer: Offer;
  /** ceil(durationH x cheapest eligible advertised rate). Advisory only:
   *  real prices come from the seller's /quote, never from the registry. */
  estimateCents: number;
  withinBudget: boolean;
}

/**
 * Agent B registers itself at boot, but a console that starts later (or a
 * fresh serverless instance pointed at a new database) would otherwise
 * have an empty registry until the merchant happens to restart. Pull its
 * self-description once instead of waiting. Best effort: a merchant that
 * is down simply yields no offers, and the caller fails closed.
 */
export async function ensureOffersSeeded(): Promise<void> {
  const existing = await allOffers();
  if (existing.length > 0) return;

  const agentBUrl = process.env.AGENT_B_URL;
  if (!agentBUrl) return;
  try {
    const res = await fetch(`${agentBUrl.replace(/\/$/, "")}/offer`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return;
    const parsed = OfferSchema.safeParse(await res.json());
    if (!parsed.success) return;
    await upsertOffer(parsed.data.id, parsed.data.agentId, parsed.data);
    console.log(`registry: pulled offer ${parsed.data.id} from ${agentBUrl}`);
  } catch (err) {
    console.warn(`registry: could not pull offer from ${agentBUrl}: ${String(err)}`);
  }
}

/** Deterministic capability filter. No LLM. Malformed offers never match. */
export async function queryOffers(need: Need): Promise<OfferMatch[]> {
  if (Date.parse(need.deadline) <= Date.now()) return [];
  await ensureOffersSeeded();

  const matches: OfferMatch[] = [];
  for (const row of await allOffers()) {
    let parsed: ReturnType<typeof OfferSchema.safeParse>;
    try {
      parsed = OfferSchema.safeParse(JSON.parse(row.body));
    } catch {
      continue;
    }
    if (!parsed.success) continue;
    const offer = parsed.data;

    if (!offer.availableNow) continue;
    if (offer.maxDurationH < need.durationH) continue;
    const eligible = offer.skus.filter((s) => s.vramGb >= need.vramGb);
    if (eligible.length === 0) continue;

    const minRate = Math.min(...eligible.map((s) => s.rateCentsPerHour));
    const estimateCents = Math.ceil(need.durationH * minRate);
    matches.push({
      offer,
      estimateCents,
      withinBudget: estimateCents <= need.maxPriceCents,
    });
  }
  return matches.sort((a, b) => a.estimateCents - b.estimateCents);
}
