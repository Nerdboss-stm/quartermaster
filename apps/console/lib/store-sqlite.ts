import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Params, Store } from "./store";

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

/** Local/demo driver. Synchronous under the async interface. */
export function createSqliteStore(): Store {
  const dbPath =
    process.env.QM_DB_PATH ??
    path.join(findRepoRoot(process.cwd()), "db", "quartermaster.db");

  let handle: Database.Database | null = null;
  const conn = (): Database.Database => {
    if (!handle) {
      if (!existsSync(dbPath)) {
        throw new Error(`${dbPath} missing: run \`pnpm db:migrate\` first`);
      }
      handle = new Database(dbPath);
      handle.pragma("journal_mode = WAL");
    }
    return handle;
  };

  const args = (params?: Params): unknown[] => (params ? [...params] : []);

  return {
    driver: "sqlite",
    async all<T>(sql: string, params?: Params): Promise<T[]> {
      return conn().prepare(sql).all(...args(params)) as T[];
    },
    async get<T>(sql: string, params?: Params): Promise<T | undefined> {
      return conn().prepare(sql).get(...args(params)) as T | undefined;
    },
    async run(sql: string, params?: Params) {
      const info = conn().prepare(sql).run(...args(params));
      return { changes: info.changes };
    },
    async tx(statements) {
      const database = conn();
      database.transaction(() => {
        for (const statement of statements) {
          database.prepare(statement.sql).run(...args(statement.params));
        }
      })();
    },
  };
}
