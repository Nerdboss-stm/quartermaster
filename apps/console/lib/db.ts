import { initStore } from "./store-init";
import { all, get, run, tx, type Params } from "./store";

/**
 * Database helpers. Every function initialises the driver first, so a
 * route handler can call any of these without wiring setup itself.
 *
 * Async throughout: Postgres has no synchronous client, and the demo's
 * SQLite driver resolves immediately, so both hosts share this code.
 */

export async function sqlAll<T>(sql: string, params?: Params): Promise<T[]> {
  await initStore();
  return all<T>(sql, params);
}

export async function sqlGet<T>(
  sql: string,
  params?: Params
): Promise<T | undefined> {
  await initStore();
  return get<T>(sql, params);
}

export async function sqlRun(
  sql: string,
  params?: Params
): Promise<{ changes: number }> {
  await initStore();
  return run(sql, params);
}

export async function sqlTx(
  statements: { sql: string; params?: Params }[]
): Promise<void> {
  await initStore();
  return tx(statements);
}

export interface TraceRow {
  id: number;
  run_id: string;
  body: string;
  at: string;
}

export async function insertTraceEvent(
  runId: string,
  body: unknown
): Promise<void> {
  await sqlRun("INSERT INTO trace_events (run_id, body, at) VALUES (?, ?, ?)", [
    runId,
    JSON.stringify(body),
    new Date().toISOString(),
  ]);
}

export async function traceEventsSince(
  runId: string,
  afterId: number
): Promise<TraceRow[]> {
  return sqlAll<TraceRow>(
    "SELECT id, run_id, body, at FROM trace_events WHERE run_id = ? AND id > ? ORDER BY id",
    [runId, afterId]
  );
}

export async function createRun(id: string, ownerId: string): Promise<void> {
  await sqlRun(
    "INSERT INTO runs (id, state, created_at, owner_id) VALUES (?, 'running', ?, ?)",
    [id, new Date().toISOString(), ownerId]
  );
}

/**
 * Who a run belongs to. Every money path derives the owner from here
 * rather than taking it as a parameter, which keeps the engine signatures
 * unchanged and makes it impossible to settle one account's charge
 * against another's envelopes. Fails closed on an unknown run.
 */
export async function runOwner(runId: string): Promise<string> {
  const row = await sqlGet<{ owner_id: string }>(
    "SELECT owner_id FROM runs WHERE id = ?",
    [runId]
  );
  if (!row) throw new Error(`unknown run ${runId}: failing closed`);
  return row.owner_id;
}

export async function setRunState(id: string, state: string): Promise<void> {
  await sqlRun("UPDATE runs SET state = ? WHERE id = ?", [state, id]);
}

export async function latestRunId(ownerId: string): Promise<string | null> {
  const row = await sqlGet<{ id: string }>(
    "SELECT id FROM runs WHERE owner_id = ? ORDER BY created_at DESC, id DESC LIMIT 1",
    [ownerId]
  );
  return row?.id ?? null;
}

export async function upsertOffer(
  id: string,
  agentId: string,
  body: unknown,
  ownerId: string | null = null
): Promise<void> {
  await sqlRun(
    `INSERT INTO offers (id, agent_id, body, created_at, owner_id) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET agent_id = excluded.agent_id,
       body = excluded.body, owner_id = excluded.owner_id`,
    [id, agentId, JSON.stringify(body), new Date().toISOString(), ownerId]
  );
}

export async function allOffers(): Promise<
  { id: string; agent_id: string; body: string }[]
> {
  return sqlAll("SELECT id, agent_id, body FROM offers");
}
