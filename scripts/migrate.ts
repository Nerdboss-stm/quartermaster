import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Migration runner for both engines.
 *
 * Migrations are written in portable SQL. The one construct that differs
 * between SQLite and Postgres is the autoincrementing primary key, so it
 * is written as {{AUTO_ID}} and substituted here.
 *
 * Postgres when DATABASE_URL is set (or QM_DB_DRIVER=postgres), SQLite
 * otherwise. Applied migrations are tracked by filename, so editing a
 * file that has already run does not re-run it.
 */

const root = path.resolve(__dirname, "..");
const migrationsDir = path.join(root, "scripts", "migrations");

const AUTO_ID = {
  sqlite: "INTEGER PRIMARY KEY AUTOINCREMENT",
  postgres: "BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY",
} as const;

type Driver = keyof typeof AUTO_ID;

function pickDriver(): Driver {
  const forced = process.env.QM_DB_DRIVER;
  if (forced === "postgres" || forced === "sqlite") return forced;
  return process.env.DATABASE_URL ? "postgres" : "sqlite";
}

function migrationFiles(): string[] {
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
}

function render(file: string, driver: Driver): string {
  const sql = readFileSync(path.join(migrationsDir, file), "utf8");
  return sql.replaceAll("{{AUTO_ID}}", AUTO_ID[driver]);
}

async function migrateSqlite(): Promise<void> {
  const { default: Database } = await import("better-sqlite3");
  const dbDir = path.join(root, "db");
  mkdirSync(dbDir, { recursive: true });

  const db = new Database(path.join(dbDir, "quartermaster.db"));
  db.pragma("journal_mode = WAL");
  db.exec(
    "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)"
  );

  const applied = new Set(
    (db.prepare("SELECT name FROM _migrations").all() as { name: string }[]).map(
      (row) => row.name
    )
  );

  const files = migrationFiles();
  let appliedNow = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    db.transaction(() => {
      db.exec(render(file, "sqlite"));
      db.prepare("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)").run(
        file,
        new Date().toISOString()
      );
    })();
    appliedNow += 1;
    console.log(`applied ${file}`);
  }
  report("sqlite", files.length, applied.size, appliedNow);
  db.close();
}

async function migratePostgres(): Promise<void> {
  const { Client } = await import("pg");
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL required for the postgres driver");
  }
  const client = new Client({
    connectionString,
    ssl: connectionString.includes("localhost")
      ? undefined
      : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query(
      "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)"
    );
    const existing = await client.query<{ name: string }>(
      "SELECT name FROM _migrations"
    );
    const applied = new Set(existing.rows.map((row) => row.name));

    const files = migrationFiles();
    let appliedNow = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      // Each migration is one transaction: a half-applied schema is worse
      // than none.
      await client.query("BEGIN");
      try {
        await client.query(render(file, "postgres"));
        await client.query(
          "INSERT INTO _migrations (name, applied_at) VALUES ($1, $2)",
          [file, new Date().toISOString()]
        );
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`migration ${file} failed: ${String(err)}`);
      }
      appliedNow += 1;
      console.log(`applied ${file}`);
    }
    report("postgres", files.length, applied.size, appliedNow);
  } finally {
    await client.end();
  }
}

function report(
  driver: Driver,
  onDisk: number,
  previously: number,
  now: number
): void {
  console.log(
    `migrations [${driver}]: ${onDisk} on disk, ${previously} previously applied, ${now} applied now`
  );
}

async function main(): Promise<void> {
  const driver = pickDriver();
  if (driver === "postgres") await migratePostgres();
  else await migrateSqlite();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
