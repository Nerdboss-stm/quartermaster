import path from "node:path";
import type { Mandate } from "mandate-arbiter";

const root = path.resolve(__dirname, "..");
try {
  process.loadEnvFile(path.join(root, ".env"));
} catch {
  // no .env; rely on ambient environment
}

import { sqlAll, sqlGet, sqlRun } from "../apps/console/lib/db";
import { DEMO_OWNER } from "../apps/console/lib/tenant";

export const POLICY_MANDATE_ID = "qm_mdt_policy_v1";
export const POLICY_AMOUNT_CAP_CENTS = 4000;

/** How long a freshly issued policy mandate stays valid. */
const VALID_DAYS = Number(process.env.QM_MANDATE_VALID_DAYS ?? 30);

function policyMandate(id: string, issuedAt: Date): Mandate {
  // LAYERS: cumulative_cap and envelope routing are enforced by OUR ledger;
  // the per-envelope one-charge-per-cycle rule is enforced by Visa at the
  // network. Both layers render on screen.
  return {
    id,
    principalId: "saran",
    agentId: "agent_a",
    currency: "USD",
    root: {
      kind: "all_of",
      clauses: [
        { kind: "counterparty_allowlist", ids: ["agent_b"] },
        { kind: "attribute", key: "vram_gb", op: "gte", value: 40 },
        { kind: "attribute", key: "duration_h", op: "lte", value: 6 },
        { kind: "amount_cap", maxCents: POLICY_AMOUNT_CAP_CENTS, onFail: "escalate" },
        { kind: "cumulative_cap", maxCents: 12000, onFail: "escalate" },
      ],
    },
    issuedAt: issuedAt.toISOString(),
    expiresAt: new Date(
      issuedAt.getTime() + VALID_DAYS * 86_400_000
    ).toISOString(),
  };
}

interface MandateRow {
  id: string;
  body: string;
}

/**
 * Seeds the policy mandate, or re-issues it when the active one has
 * expired. Mandates are immutable, so a refresh is a NEW mandate that
 * supersedes the old one and keeps the supersede chain intact — the same
 * rule amendments follow, so cumulative spend is never reset.
 *
 * Every statement here is scoped to the demo owner. Other accounts —
 * suppliers, guests, anyone who signed up — carry their own active mandate,
 * and this script must neither count them nor supersede them.
 */
export async function seedPolicyMandate(): Promise<
  "inserted" | "exists" | "reissued"
> {
  const now = new Date();
  const active = await sqlAll<MandateRow>(
    "SELECT id, body FROM mandates WHERE status = 'active' AND owner_id = ?",
    [DEMO_OWNER]
  );

  if (active.length === 0) {
    const existing = await sqlGet<{ id: string }>(
      "SELECT id FROM mandates WHERE id = ?",
      [POLICY_MANDATE_ID]
    );
    if (existing) {
      // Chain exists but nothing is active: re-issue on top of it.
      return reissue(now);
    }
    await sqlRun(
      "INSERT INTO mandates (id, body, status, supersedes, created_at, owner_id) VALUES (?, ?, 'active', NULL, ?, ?)",
      [
        POLICY_MANDATE_ID,
        JSON.stringify(policyMandate(POLICY_MANDATE_ID, now)),
        now.toISOString(),
        DEMO_OWNER,
      ]
    );
    return "inserted";
  }

  if (active.length > 1) {
    throw new Error(
      `${active.length} active mandates for ${DEMO_OWNER}: refusing to guess which is authoritative`
    );
  }

  const current = JSON.parse(active[0].body) as Mandate;
  if (Date.parse(current.expiresAt) > now.getTime()) return "exists";
  return reissue(now);
}

async function reissue(now: Date): Promise<"reissued"> {
  const rows = await sqlAll<{ id: string }>(
    "SELECT id FROM mandates WHERE owner_id = ?",
    [DEMO_OWNER]
  );
  const nextId = `qm_mdt_policy_v${rows.length + 1}`;
  const previous = await sqlGet<{ id: string }>(
    "SELECT id FROM mandates WHERE status = 'active' AND owner_id = ? ORDER BY created_at DESC LIMIT 1",
    [DEMO_OWNER]
  );

  await sqlRun(
    "UPDATE mandates SET status = 'superseded' WHERE status = 'active' AND owner_id = ?",
    [DEMO_OWNER]
  );
  await sqlRun(
    "INSERT INTO mandates (id, body, status, supersedes, created_at, owner_id) VALUES (?, ?, 'active', ?, ?, ?)",
    [
      nextId,
      JSON.stringify(policyMandate(nextId, now)),
      previous?.id ?? null,
      now.toISOString(),
      DEMO_OWNER,
    ]
  );
  console.log(
    `seed-mandate: re-issued as ${nextId} (previous mandate had expired), valid ${VALID_DAYS} days`
  );
  return "reissued";
}

if (require.main === module) {
  seedPolicyMandate()
    .then((result) => {
      console.log(`seed-mandate: ${result}`);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
