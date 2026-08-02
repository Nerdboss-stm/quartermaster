import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import path from "node:path";

function findRepoRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 10; i++) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`repo root (pnpm-workspace.yaml) not found above ${start}`);
}

const dbPath =
  process.env.QM_DB_PATH ??
  path.join(findRepoRoot(process.cwd()), "db", "quartermaster.db");

let handle: Database.Database | null = null;

export function db(): Database.Database {
  if (!handle) {
    if (!existsSync(dbPath)) {
      throw new Error(`${dbPath} missing: run \`pnpm db:migrate\` first`);
    }
    handle = new Database(dbPath);
    handle.pragma("journal_mode = WAL");
  }
  return handle;
}

export interface TraceRow {
  id: number;
  run_id: string;
  body: string;
  at: string;
}

export function insertTraceEvent(runId: string, body: unknown): void {
  db()
    .prepare("INSERT INTO trace_events (run_id, body, at) VALUES (?, ?, ?)")
    .run(runId, JSON.stringify(body), new Date().toISOString());
}

export function traceEventsSince(runId: string, afterId: number): TraceRow[] {
  return db()
    .prepare(
      "SELECT id, run_id, body, at FROM trace_events WHERE run_id = ? AND id > ? ORDER BY id"
    )
    .all(runId, afterId) as TraceRow[];
}

export function createRun(id: string): void {
  db()
    .prepare("INSERT INTO runs (id, state, created_at) VALUES (?, 'running', ?)")
    .run(id, new Date().toISOString());
}

export function setRunState(id: string, state: string): void {
  db().prepare("UPDATE runs SET state = ? WHERE id = ?").run(state, id);
}

export function latestRunId(): string | null {
  const row = db()
    .prepare("SELECT id FROM runs ORDER BY created_at DESC, id DESC LIMIT 1")
    .get() as { id: string } | undefined;
  return row?.id ?? null;
}

export function upsertOffer(id: string, agentId: string, body: unknown): void {
  db()
    .prepare(
      `INSERT INTO offers (id, agent_id, body, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET agent_id = excluded.agent_id, body = excluded.body`
    )
    .run(id, agentId, JSON.stringify(body), new Date().toISOString());
}

export function allOffers(): { id: string; agent_id: string; body: string }[] {
  return db()
    .prepare("SELECT id, agent_id, body FROM offers")
    .all() as { id: string; agent_id: string; body: string }[];
}
