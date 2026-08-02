import type { Clause } from "mandate-arbiter";
import { sqlGet } from "./db";
import {
  currentEnvelopes,
  envelopeCycleOpen,
  envelopeSpentThisCycle,
} from "./envelopes";
import { loadActiveMandate, mandateChainIds } from "./mandates";
import { settlementMode } from "./prava";

function findCumulativeCap(clause: Clause): number | null {
  if (clause.kind === "cumulative_cap") return clause.maxCents;
  if (clause.kind === "all_of" || clause.kind === "any_of") {
    for (const child of clause.clauses) {
      const hit = findCumulativeCap(child);
      if (hit !== null) return hit;
    }
  }
  return null;
}

export async function portfolioMeter(ownerId: string) {
  const envelopes = await Promise.all(
    (await currentEnvelopes(ownerId)).map(async (env) => ({
      label: env.label,
      prava_mandate_id: env.prava_mandate_id,
      per_charge_cap_cents: env.per_charge_cap_cents,
      renews_at: env.renews_at,
      cycle: (await envelopeCycleOpen(env)) ? "OPEN" : "USED",
      spent_cents: await envelopeSpentThisCycle(env),
    }))
  );

  const portfolio = {
    spent_cents: envelopes.reduce((s, e) => s + e.spent_cents, 0),
    cap_cents: envelopes.reduce((s, e) => s + e.per_charge_cap_cents, 0),
  };

  let policy: { cumulative_cents: number; cap_cents: number | null } | null =
    null;
  try {
    const mandate = await loadActiveMandate(ownerId);
    const ids = await mandateChainIds(mandate.id);
    const placeholders = ids.map(() => "?").join(", ");
    const row = await sqlGet<{ total: number }>(
      `SELECT COALESCE(SUM(amount_cents), 0) AS total FROM ledger
       WHERE entry_type = 'spend' AND mandate_id IN (${placeholders})`,
      ids
    );
    policy = {
      cumulative_cents: Number(row?.total ?? 0),
      cap_cents: findCumulativeCap(mandate.root),
    };
  } catch {
    // no active mandate yet; meter still renders envelopes
  }

  return {
    environment: settlementMode().toUpperCase(),
    envelopes,
    portfolio,
    policy,
  };
}
