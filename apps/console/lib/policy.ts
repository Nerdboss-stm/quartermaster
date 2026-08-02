import type { Mandate } from "mandate-arbiter";
import { sqlRun } from "./db";

export interface PolicyOptions {
  perChargeCapCents?: number;
  cumulativeCapCents?: number;
  minVramGb?: number;
  maxDurationH?: number;
  /** Omitted by default: in a marketplace, new suppliers must be reachable. */
  counterpartyIds?: string[];
  validDays?: number;
}

export const POLICY_DEFAULTS = {
  perChargeCapCents: 4000,
  cumulativeCapCents: 12000,
  minVramGb: 40,
  maxDurationH: 6,
  validDays: 30,
};

/**
 * The policy every new account starts with. It is a signed clause tree the
 * arbiter walks on every charge: what may be bought, from whom, how much
 * at once, and how much in total. Caps are escalatable, so exceeding one
 * wakes the owner rather than failing silently; the capability clauses are
 * hard refusals.
 */
export function buildPolicyMandate(
  ownerId: string,
  id: string,
  options: PolicyOptions = {}
): Mandate {
  const o = { ...POLICY_DEFAULTS, ...options };
  const issuedAt = new Date();

  const clauses: Mandate["root"][] = [];
  if (options.counterpartyIds?.length) {
    clauses.push({
      kind: "counterparty_allowlist",
      ids: options.counterpartyIds,
    });
  }
  clauses.push(
    { kind: "attribute", key: "vram_gb", op: "gte", value: o.minVramGb },
    { kind: "attribute", key: "duration_h", op: "lte", value: o.maxDurationH },
    { kind: "amount_cap", maxCents: o.perChargeCapCents, onFail: "escalate" },
    {
      kind: "cumulative_cap",
      maxCents: o.cumulativeCapCents,
      onFail: "escalate",
    }
  );

  return {
    id,
    principalId: ownerId,
    agentId: `agent_${ownerId}`,
    currency: "USD",
    root: { kind: "all_of", clauses },
    issuedAt: issuedAt.toISOString(),
    expiresAt: new Date(
      issuedAt.getTime() + o.validDays * 86_400_000
    ).toISOString(),
  };
}

/** Issues the first mandate for a new account. */
export async function createDefaultPolicy(
  ownerId: string,
  options: PolicyOptions = {}
): Promise<Mandate> {
  const mandate = buildPolicyMandate(ownerId, `qm_mdt_${ownerId}_v1`, options);
  await sqlRun(
    `INSERT INTO mandates (id, body, status, supersedes, created_at, owner_id)
     VALUES (?, ?, 'active', NULL, ?, ?)`,
    [mandate.id, JSON.stringify(mandate), new Date().toISOString(), ownerId]
  );
  return mandate;
}
