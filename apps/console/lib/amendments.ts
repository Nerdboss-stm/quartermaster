import type { Clause, Mandate } from "mandate-arbiter";
import { insertTraceEvent, sqlTx } from "./db";
import { loadActiveMandate, mandateChainIds } from "./mandates";
import { settlementMode } from "./prava";

function replaceAmountCap(
  clause: Clause,
  path: string,
  newCapCents: number
): string | null {
  if (clause.kind === "amount_cap") {
    clause.maxCents = newCapCents;
    return path;
  }
  if (clause.kind === "all_of" || clause.kind === "any_of") {
    for (let i = 0; i < clause.clauses.length; i++) {
      const hit = replaceAmountCap(
        clause.clauses[i],
        `${path}.${clause.kind}[${i}]`,
        newCapCents
      );
      if (hit) return hit;
    }
  }
  return null;
}

/**
 * Amendment = a NEW signed policy mandate superseding the old (mandates are
 * immutable). Copies the active mandate, replaces amount_cap, records the
 * supersede link and a ledger 'amendment' row.
 */
export async function amendActiveMandate(
  runId: string,
  newCapCents: number,
  reason: string
): Promise<{ oldId: string; newId: string; clausePath: string }> {
  const old = await loadActiveMandate();
  const next = JSON.parse(JSON.stringify(old)) as Mandate;
  const clausePath = replaceAmountCap(next.root, "root", newCapCents);
  if (!clausePath) {
    throw new Error("active mandate has no amount_cap clause: failing closed");
  }
  const version = (await mandateChainIds(old.id)).length + 1;
  next.id = `qm_mdt_policy_v${version}`;
  next.issuedAt = new Date().toISOString();

  const now = new Date().toISOString();
  // One atomic step: the new mandate, the supersede flip, and the ledger
  // row that records the amendment.
  await sqlTx([
    {
      sql: "INSERT INTO mandates (id, body, status, supersedes, created_at) VALUES (?, ?, 'active', ?, ?)",
      params: [next.id, JSON.stringify(next), old.id, now],
    },
    {
      sql: "UPDATE mandates SET status = 'superseded' WHERE id = ?",
      params: [old.id],
    },
    {
      sql: `INSERT INTO ledger (run_id, mandate_id, envelope_id, entry_type, autonomous,
              clause_paths, amount_cents, currency, mode, at)
            VALUES (?, ?, NULL, 'amendment', 0, ?, 0, ?, ?, ?)`,
      params: [
        runId,
        next.id,
        JSON.stringify([clausePath]),
        next.currency,
        settlementMode(),
        now,
      ],
    },
  ]);

  await insertTraceEvent(runId, {
    type: "mandate_amended",
    oldId: old.id,
    newId: next.id,
    clausePath,
    newCapCents,
    reason,
  });
  return { oldId: old.id, newId: next.id, clausePath };
}
