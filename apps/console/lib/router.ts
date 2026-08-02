import { insertTraceEvent } from "./db";
import {
  currentEnvelopes,
  envelopeCycleOpen,
  type EnvelopeRow,
} from "./envelopes";
import { merchantMatch } from "./merchant";
import { usd } from "./money";

export class RouteRefused extends Error {
  constructor(readonly reason: string) {
    super(`route refused: ${reason}`);
    this.name = "RouteRefused";
  }
}

/**
 * Deterministic funding selection: merchant match, cap fits, cycle open in
 * OUR ledger. Prefer A, then B (label order). No eligible envelope: fail
 * closed, never call Prava, surface like a clause refusal.
 */
export async function routeCharge(
  runId: string,
  amountCents: number,
  merchantName: string
): Promise<EnvelopeRow> {
  const notes: string[] = [];
  for (const env of await currentEnvelopes()) {
    if (!merchantMatch(env.merchant_name, merchantName)) {
      notes.push(`${env.label}: merchant mismatch`);
      continue;
    }
    if (env.per_charge_cap_cents < amountCents) {
      notes.push(
        `${env.label}: cap ${usd(env.per_charge_cap_cents)} < ${usd(amountCents)}`
      );
      continue;
    }
    if (!(await envelopeCycleOpen(env))) {
      notes.push(`${env.label}: cycle spent`);
      continue;
    }
    const reason = [
      ...notes,
      `${env.label}: selected (merchant match, cap ${usd(env.per_charge_cap_cents)} >= ${usd(amountCents)}, cycle open)`,
    ].join(" -> ");
    await insertTraceEvent(runId, {
      type: "route_selected",
      envelope: env.label,
      envelopeId: env.id,
      pravaMandateId: env.prava_mandate_id,
      reason,
    });
    return env;
  }
  const reason =
    notes.length > 0 ? notes.join(" -> ") : "no envelopes in current cycle";
  await insertTraceEvent(runId, { type: "route_refused", reason });
  throw new RouteRefused(reason);
}
