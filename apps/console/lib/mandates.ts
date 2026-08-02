import type { LedgerReader, Mandate } from "mandate-arbiter";
import { db } from "./db";

/** Exactly one active mandate, or the answer is NO (fail closed). */
export function loadActiveMandate(): Mandate {
  const rows = db()
    .prepare("SELECT id, body FROM mandates WHERE status = 'active'")
    .all() as { id: string; body: string }[];
  if (rows.length !== 1) {
    throw new Error(
      `expected exactly 1 active mandate, found ${rows.length}: failing closed`
    );
  }
  return JSON.parse(rows[0].body) as Mandate;
}

/** Follows supersedes links so amendments never reset cumulative spend. */
export function mandateChainIds(mandateId: string): string[] {
  const stmt = db().prepare("SELECT supersedes FROM mandates WHERE id = ?");
  const ids: string[] = [];
  let cur: string | null = mandateId;
  while (cur && !ids.includes(cur)) {
    ids.push(cur);
    const row = stmt.get(cur) as { supersedes: string | null } | undefined;
    cur = row?.supersedes ?? null;
  }
  return ids;
}

/** Sums 'spend' ledger rows across the mandate's supersede chain. */
export function ledgerReader(): LedgerReader {
  return {
    async cumulativeSpendCents(mandateId, windowMs) {
      const ids = mandateChainIds(mandateId);
      const placeholders = ids.map(() => "?").join(", ");
      const since = windowMs
        ? new Date(Date.now() - windowMs).toISOString()
        : "";
      const row = db()
        .prepare(
          `SELECT COALESCE(SUM(amount_cents), 0) AS total FROM ledger
           WHERE entry_type = 'spend' AND mandate_id IN (${placeholders}) AND at >= ?`
        )
        .get(...ids, since) as { total: number };
      return row.total;
    },
  };
}
