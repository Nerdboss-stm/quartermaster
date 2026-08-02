/**
 * Storage seam.
 *
 * Everything that touches the ledger goes through here. The interface is
 * async because Postgres is async; the SQLite driver is synchronous and
 * simply resolves immediately. That lets the same code run on a local
 * file during a demo and on hosted Postgres in production.
 *
 * SQL is written with `?` placeholders (SQLite style). The Postgres
 * driver rewrites them to $1..$n.
 */

export type Params = readonly unknown[];

export interface Store {
  all<T>(sql: string, params?: Params): Promise<T[]>;
  get<T>(sql: string, params?: Params): Promise<T | undefined>;
  run(sql: string, params?: Params): Promise<{ changes: number }>;
  /** Statements run atomically; the callback must not touch other stores. */
  tx(statements: { sql: string; params?: Params }[]): Promise<void>;
  readonly driver: "sqlite" | "postgres";
}

let store: Store | null = null;

export function setStore(next: Store): void {
  store = next;
}

export function storeDriver(): "sqlite" | "postgres" {
  return db().driver;
}

export function db(): Store {
  if (!store) {
    throw new Error(
      "store not initialised: import lib/store-init before using the database"
    );
  }
  return store;
}

export const all = <T>(sql: string, params?: Params): Promise<T[]> =>
  db().all<T>(sql, params);
export const get = <T>(sql: string, params?: Params): Promise<T | undefined> =>
  db().get<T>(sql, params);
export const run = (sql: string, params?: Params): Promise<{ changes: number }> =>
  db().run(sql, params);
export const tx = (
  statements: { sql: string; params?: Params }[]
): Promise<void> => db().tx(statements);
