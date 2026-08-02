import { setStore } from "./store";
import { createSqliteStore } from "./store-sqlite";

/**
 * Chooses the driver once per process. Postgres when DATABASE_URL is set
 * (Vercel), SQLite otherwise (local demo). QM_DB_DRIVER forces either.
 *
 * The Postgres module is imported lazily so a local run never needs `pg`
 * resolved, and a hosted run never loads better-sqlite3's native binding.
 */
let initialised = false;

export async function initStore(): Promise<void> {
  if (initialised) return;
  const forced = process.env.QM_DB_DRIVER;
  const usePostgres =
    forced === "postgres" || (!forced && !!process.env.DATABASE_URL);

  if (usePostgres) {
    const { createPostgresStore } = await import("./store-postgres");
    setStore(createPostgresStore());
  } else {
    setStore(createSqliteStore());
  }
  initialised = true;
}
