import { Pool } from "pg";
import type { Params, Store } from "./store";

/**
 * Hosted driver (Vercel + Neon or any DATABASE_URL). The pool is kept on
 * globalThis because serverless invocations reuse the module scope and we
 * do not want a new pool per request.
 */
const globalForPool = globalThis as unknown as { qmPool?: Pool };

/** SQLite-style `?` placeholders to Postgres `$1..$n`, skipping literals. */
export function toPositional(sql: string): string {
  let index = 0;
  let out = "";
  let quote: string | null = null;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (quote) {
      out += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      out += ch;
      continue;
    }
    out += ch === "?" ? `$${++index}` : ch;
  }
  return out;
}

export function createPostgresStore(): Store {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL not set: cannot use the postgres store");
  }
  const pool =
    globalForPool.qmPool ??
    new Pool({
      connectionString,
      max: 5,
      ssl: connectionString.includes("localhost")
        ? undefined
        : { rejectUnauthorized: false },
    });
  globalForPool.qmPool = pool;

  const args = (params?: Params): unknown[] => (params ? [...params] : []);

  return {
    driver: "postgres",
    async all<T>(sql: string, params?: Params): Promise<T[]> {
      const result = await pool.query(toPositional(sql), args(params));
      return result.rows as T[];
    },
    async get<T>(sql: string, params?: Params): Promise<T | undefined> {
      const result = await pool.query(toPositional(sql), args(params));
      return result.rows[0] as T | undefined;
    },
    async run(sql: string, params?: Params) {
      const result = await pool.query(toPositional(sql), args(params));
      return { changes: result.rowCount ?? 0 };
    },
    async tx(statements) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (const statement of statements) {
          await client.query(toPositional(statement.sql), args(statement.params));
        }
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    },
  };
}
