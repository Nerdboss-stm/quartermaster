import { randomBytes } from "node:crypto";
import { sqlAll, sqlGet, sqlRun } from "./db";

export type NeedState =
  | "pending"
  | "running"
  | "escalated"
  | "settled"
  | "refused"
  | "declined"
  | "failed"
  | "expired";

export interface NeedRow {
  id: string;
  owner_id: string;
  vram_gb: number;
  duration_h: number;
  deadline: string;
  max_price_cents: number;
  phone: string | null;
  state: NeedState;
  run_id: string | null;
  claimed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NeedInput {
  vramGb: number;
  durationH: number;
  deadline: string;
  maxPriceCents: number;
  phone?: string | null;
}

export async function createNeed(
  ownerId: string,
  input: NeedInput
): Promise<NeedRow> {
  const now = new Date().toISOString();
  const id = `need_${randomBytes(6).toString("hex")}`;
  await sqlRun(
    `INSERT INTO needs (id, owner_id, vram_gb, duration_h, deadline, max_price_cents,
       phone, state, run_id, claimed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, ?, ?)`,
    [
      id,
      ownerId,
      input.vramGb,
      input.durationH,
      input.deadline,
      input.maxPriceCents,
      input.phone ?? null,
      now,
      now,
    ]
  );
  return (await getNeed(id))!;
}

export async function getNeed(id: string): Promise<NeedRow | null> {
  return (await sqlGet<NeedRow>("SELECT * FROM needs WHERE id = ?", [id])) ?? null;
}

export async function needsForOwner(ownerId: string): Promise<NeedRow[]> {
  return sqlAll<NeedRow>(
    "SELECT * FROM needs WHERE owner_id = ? ORDER BY created_at DESC",
    [ownerId]
  );
}

export async function needForRun(runId: string): Promise<NeedRow | null> {
  return (
    (await sqlGet<NeedRow>("SELECT * FROM needs WHERE run_id = ?", [runId])) ??
    null
  );
}

export async function setNeedState(
  id: string,
  state: NeedState,
  runId?: string
): Promise<void> {
  await sqlRun(
    `UPDATE needs SET state = ?, updated_at = ?${runId ? ", run_id = ?" : ""} WHERE id = ?`,
    runId
      ? [state, new Date().toISOString(), runId, id]
      : [state, new Date().toISOString(), id]
  );
}

/**
 * Take exclusive ownership of a need before doing anything that spends
 * money. The UPDATE only matches a row still in 'pending', so if two
 * triggers fire at once — a cron tick and a new listing, say — exactly one
 * of them gets a truthy result and the other walks away. This single
 * statement is the whole concurrency story, and it behaves identically on
 * SQLite and Postgres.
 */
export async function claimNeed(id: string): Promise<boolean> {
  const result = await sqlRun(
    "UPDATE needs SET state = 'running', claimed_at = ?, updated_at = ? WHERE id = ? AND state = 'pending'",
    [new Date().toISOString(), new Date().toISOString(), id]
  );
  return result.changes === 1;
}

/** Put an unmatched need back so a later trigger can try again. */
export async function releaseNeed(id: string): Promise<void> {
  await sqlRun(
    "UPDATE needs SET state = 'pending', claimed_at = NULL, updated_at = ? WHERE id = ? AND state = 'running'",
    [new Date().toISOString(), id]
  );
}
