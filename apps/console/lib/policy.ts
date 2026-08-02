import type { Clause, Mandate } from "mandate-arbiter";
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

export interface PolicySummary {
  perChargeCapCents: number | null;
  cumulativeCapCents: number | null;
  minVramGb: number | null;
  maxDurationH: number | null;
  counterpartyIds: string[] | null;
}

/**
 * Reads the caps back out of a signed clause tree so a person can see
 * their own policy in plain numbers. Read-only: the arbiter still walks
 * the tree itself, and this never becomes the thing that decides.
 */
export function summarizePolicy(root: Clause): PolicySummary {
  const found: PolicySummary = {
    perChargeCapCents: null,
    cumulativeCapCents: null,
    minVramGb: null,
    maxDurationH: null,
    counterpartyIds: null,
  };

  const walk = (clause: Clause) => {
    switch (clause.kind) {
      case "all_of":
      case "any_of":
        clause.clauses.forEach(walk);
        return;
      case "amount_cap":
        found.perChargeCapCents ??= clause.maxCents;
        return;
      case "cumulative_cap":
        found.cumulativeCapCents ??= clause.maxCents;
        return;
      case "counterparty_allowlist":
        found.counterpartyIds ??= clause.ids;
        return;
      case "attribute":
        if (clause.key === "vram_gb" && typeof clause.value === "number") {
          found.minVramGb ??= clause.value;
        }
        if (clause.key === "duration_h" && typeof clause.value === "number") {
          found.maxDurationH ??= clause.value;
        }
        return;
      default:
    }
  };

  walk(root);
  return found;
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
