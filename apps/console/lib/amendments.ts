import type { Clause, Mandate } from "mandate-arbiter";
import { insertTraceEvent, runOwner, sqlTx } from "./db";
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

export interface PolicyEdits {
  perChargeCapCents?: number;
  cumulativeCapCents?: number;
  minVramGb?: number;
  maxDurationH?: number;
}

/**
 * Applies the owner's edits to a copy of the clause tree, in place,
 * returning the paths that actually changed. Anything we do not recognise
 * is left exactly as it was signed — an editor may narrow or widen the
 * caps it understands, never quietly drop a clause it does not.
 */
function applyEdits(
  clause: Clause,
  path: string,
  edits: PolicyEdits
): string[] {
  if (clause.kind === "all_of" || clause.kind === "any_of") {
    return clause.clauses.flatMap((child, i) =>
      applyEdits(child, `${path}.${clause.kind}[${i}]`, edits)
    );
  }
  if (
    clause.kind === "amount_cap" &&
    edits.perChargeCapCents !== undefined &&
    clause.maxCents !== edits.perChargeCapCents
  ) {
    clause.maxCents = edits.perChargeCapCents;
    return [path];
  }
  if (
    clause.kind === "cumulative_cap" &&
    edits.cumulativeCapCents !== undefined &&
    clause.maxCents !== edits.cumulativeCapCents
  ) {
    clause.maxCents = edits.cumulativeCapCents;
    return [path];
  }
  if (clause.kind === "attribute" && clause.op === "gte" && clause.key === "vram_gb") {
    if (edits.minVramGb !== undefined && clause.value !== edits.minVramGb) {
      clause.value = edits.minVramGb;
      return [path];
    }
  }
  if (clause.kind === "attribute" && clause.op === "lte" && clause.key === "duration_h") {
    if (edits.maxDurationH !== undefined && clause.value !== edits.maxDurationH) {
      clause.value = edits.maxDurationH;
      return [path];
    }
  }
  return [];
}

/**
 * The owner changing their own policy at the keyboard. Same law as every
 * other amendment: the old mandate is never edited, a new one supersedes
 * it, and the chain is what cumulative spend is summed over — so raising a
 * cap can never reset what has already been spent.
 *
 * This is LOCK 1 only. Spending power is untouched: widening policy does
 * not widen an envelope, which still takes a passkey.
 */
export async function amendOwnerPolicy(
  ownerId: string,
  edits: PolicyEdits
): Promise<{ oldId: string; newId: string; changed: string[] }> {
  const old = await loadActiveMandate(ownerId);
  const next = JSON.parse(JSON.stringify(old)) as Mandate;
  const changed = applyEdits(next.root, "root", edits);
  if (changed.length === 0) {
    throw new Error("nothing in this policy would change");
  }

  const version = (await mandateChainIds(old.id)).length + 1;
  next.id = `qm_mdt_${ownerId}_v${version}`;
  next.issuedAt = new Date().toISOString();

  await sqlTx([
    {
      sql: "INSERT INTO mandates (id, body, status, supersedes, created_at, owner_id) VALUES (?, ?, 'active', ?, ?, ?)",
      params: [
        next.id,
        JSON.stringify(next),
        old.id,
        next.issuedAt,
        ownerId,
      ],
    },
    {
      sql: "UPDATE mandates SET status = 'superseded' WHERE id = ? AND owner_id = ?",
      params: [old.id, ownerId],
    },
  ]);

  return { oldId: old.id, newId: next.id, changed };
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
  const ownerId = await runOwner(runId);
  const old = await loadActiveMandate(ownerId);
  const next = JSON.parse(JSON.stringify(old)) as Mandate;
  const clausePath = replaceAmountCap(next.root, "root", newCapCents);
  if (!clausePath) {
    throw new Error("active mandate has no amount_cap clause: failing closed");
  }
  const version = (await mandateChainIds(old.id)).length + 1;
  // Namespaced per owner: two accounts amending at once must not collide.
  next.id = `qm_mdt_${ownerId}_v${version}`;
  next.issuedAt = new Date().toISOString();

  const now = new Date().toISOString();
  // One atomic step: the new mandate, the supersede flip, and the ledger
  // row that records the amendment.
  await sqlTx([
    {
      sql: "INSERT INTO mandates (id, body, status, supersedes, created_at, owner_id) VALUES (?, ?, 'active', ?, ?, ?)",
      params: [next.id, JSON.stringify(next), old.id, now, ownerId],
    },
    {
      sql: "UPDATE mandates SET status = 'superseded' WHERE id = ? AND owner_id = ?",
      params: [old.id, ownerId],
    },
    {
      sql: `INSERT INTO ledger (run_id, mandate_id, envelope_id, entry_type, autonomous,
              clause_paths, amount_cents, currency, mode, at, owner_id)
            VALUES (?, ?, NULL, 'amendment', 0, ?, 0, ?, ?, ?, ?)`,
      params: [
        runId,
        next.id,
        JSON.stringify([clausePath]),
        next.currency,
        settlementMode(),
        now,
        ownerId,
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
