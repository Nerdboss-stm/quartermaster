import Database from "better-sqlite3";
import path from "node:path";
import type { Mandate } from "../packages/mandate-arbiter/src/types";

const root = path.resolve(__dirname, "..");

export const POLICY_MANDATE_ID = "qm_mdt_policy_v1";

// LAYERS: cumulative_cap and envelope routing are enforced by OUR ledger;
// the per-envelope one-charge-per-cycle rule is enforced by Visa at the
// network. Both layers render on screen.
const mandate: Mandate = {
  id: POLICY_MANDATE_ID,
  principalId: "saran",
  agentId: "agent_a",
  currency: "USD",
  root: {
    kind: "all_of",
    clauses: [
      { kind: "counterparty_allowlist", ids: ["agent_b"] },
      { kind: "attribute", key: "vram_gb", op: "gte", value: 40 },
      { kind: "attribute", key: "duration_h", op: "lte", value: 6 },
      { kind: "amount_cap", maxCents: 4000, onFail: "escalate" },
      { kind: "cumulative_cap", maxCents: 12000, onFail: "escalate" },
    ],
  },
  issuedAt: new Date().toISOString(),
  // Sunday Aug 2, 6:00 PM ET.
  expiresAt: "2026-08-02T22:00:00.000Z",
};

export function seedPolicyMandate(): "inserted" | "exists" {
  const db = new Database(path.join(root, "db", "quartermaster.db"), {
    fileMustExist: true,
  });
  try {
    // Mandates are immutable: if it exists, leave it alone.
    const existing = db
      .prepare("SELECT id FROM mandates WHERE id = ?")
      .get(POLICY_MANDATE_ID);
    if (existing) return "exists";
    db.prepare(
      "INSERT INTO mandates (id, body, status, supersedes, created_at) VALUES (?, ?, 'active', NULL, ?)"
    ).run(POLICY_MANDATE_ID, JSON.stringify(mandate), new Date().toISOString());
    return "inserted";
  } finally {
    db.close();
  }
}

if (require.main === module) {
  console.log(`seed-mandate: ${seedPolicyMandate()} (${POLICY_MANDATE_ID})`);
}
