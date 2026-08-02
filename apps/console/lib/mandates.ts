import type { LedgerReader, Mandate } from "mandate-arbiter";
import { sqlAll, sqlGet } from "./db";

/** Exactly one active mandate, or the answer is NO (fail closed). */
export async function loadActiveMandate(): Promise<Mandate> {
  const rows = await sqlAll<{ id: string; body: string }>(
    "SELECT id, body FROM mandates WHERE status = 'active'"
  );
  if (rows.length !== 1) {
    throw new Error(
      `expected exactly 1 active mandate, found ${rows.length}: failing closed`
    );
  }
  return JSON.parse(rows[0].body) as Mandate;
}

/** Follows supersedes links so amendments never reset cumulative spend. */
export async function mandateChainIds(mandateId: string): Promise<string[]> {
  const ids: string[] = [];
  let cur: string | null = mandateId;
  while (cur && !ids.includes(cur)) {
    ids.push(cur);
    const row: { supersedes: string | null } | undefined = await sqlGet(
      "SELECT supersedes FROM mandates WHERE id = ?",
      [cur]
    );
    cur = row?.supersedes ?? null;
  }
  return ids;
}

/** Sums 'spend' ledger rows across the mandate's supersede chain. */
export function ledgerReader(): LedgerReader {
  return {
    async cumulativeSpendCents(mandateId, windowMs) {
      const ids = await mandateChainIds(mandateId);
      const placeholders = ids.map(() => "?").join(", ");
      const since = windowMs
        ? new Date(Date.now() - windowMs).toISOString()
        : "";
      const row = await sqlGet<{ total: number }>(
        `SELECT COALESCE(SUM(amount_cents), 0) AS total FROM ledger
         WHERE entry_type = 'spend' AND mandate_id IN (${placeholders}) AND at >= ?`,
        [...ids, since]
      );
      return Number(row?.total ?? 0);
    },
  };
}
