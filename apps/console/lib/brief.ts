import { sqlAll, sqlGet } from "./db";

export interface BriefItem {
  kind: "bought" | "waiting" | "refused" | "sold";
  amountCents: number | null;
  counterparty: string | null;
  autonomous: boolean;
  at: string;
  runId: string | null;
}

export interface Brief {
  since: string;
  items: BriefItem[];
  spentCents: number;
  /** True when at least one purchase completed with nobody in the loop. */
  slept: boolean;
}

/**
 * What happened while you were not looking.
 *
 * The whole promise of this product is that you close the laptop. So the
 * first thing on the dashboard should be the answer to the only question
 * you actually have when you open it again. Everything here is read back
 * out of the ledger and the escalations table — no summary is stored, and
 * nothing is inferred that the rows do not say.
 */
export async function morningBrief(
  ownerId: string,
  windowHours = 24
): Promise<Brief> {
  const since = new Date(Date.now() - windowHours * 3_600_000).toISOString();

  const [spends, waiting, sales] = await Promise.all([
    sqlAll<{
      amount_cents: number;
      autonomous: number;
      at: string;
      run_id: string;
      counterparty_id: string | null;
    }>(
      `SELECT amount_cents, autonomous, at, run_id, counterparty_id FROM ledger
       WHERE owner_id = ? AND entry_type = 'spend' AND at >= ?
       ORDER BY at DESC`,
      [ownerId, since]
    ),
    sqlAll<{ run_id: string; failing_detail: string; at: string }>(
      `SELECT run_id, failing_detail, at FROM escalations
       WHERE owner_id = ? AND status = 'pending' ORDER BY at DESC`,
      [ownerId]
    ),
    sqlAll<{ amount_cents: number; at: string; run_id: string }>(
      `SELECT amount_cents, at, run_id FROM ledger
       WHERE supplier_owner_id = ? AND entry_type = 'spend' AND at >= ?
       ORDER BY at DESC`,
      [ownerId, since]
    ),
  ]);

  // Sellers are people too: resolve a name rather than showing sup_usr_xxx.
  const names = new Map<string, string>();
  for (const s of spends) {
    const id = s.counterparty_id;
    if (!id || names.has(id)) continue;
    if (id.startsWith("sup_")) {
      const row = await sqlGet<{ display_name: string }>(
        "SELECT display_name FROM users WHERE id = ?",
        [id.slice(4)]
      );
      names.set(id, row?.display_name ?? id);
    } else {
      names.set(id, id);
    }
  }

  const items: BriefItem[] = [
    ...spends.map((s) => ({
      kind: "bought" as const,
      amountCents: s.amount_cents,
      counterparty: s.counterparty_id ? (names.get(s.counterparty_id) ?? null) : null,
      autonomous: s.autonomous === 1,
      at: s.at,
      runId: s.run_id,
    })),
    ...waiting.map((w) => ({
      kind: "waiting" as const,
      amountCents: null,
      counterparty: w.failing_detail,
      autonomous: false,
      at: w.at,
      runId: w.run_id,
    })),
    ...sales.map((s) => ({
      kind: "sold" as const,
      amountCents: s.amount_cents,
      counterparty: null,
      autonomous: false,
      at: s.at,
      runId: s.run_id,
    })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));

  return {
    since,
    items,
    spentCents: spends.reduce((sum, s) => sum + s.amount_cents, 0),
    slept: spends.some((s) => s.autonomous === 1),
  };
}
