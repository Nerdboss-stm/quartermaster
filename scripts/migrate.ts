import Database from "better-sqlite3";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const dbDir = path.join(root, "db");
const migrationsDir = path.join(root, "scripts", "migrations");

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

const files = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort();

let appliedNow = 0;
for (const file of files) {
  if (applied.has(file)) continue;
  const sql = readFileSync(path.join(migrationsDir, file), "utf8");
  db.transaction(() => {
    db.exec(sql);
    db.prepare("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)").run(
      file,
      new Date().toISOString()
    );
  })();
  appliedNow += 1;
  console.log(`applied ${file}`);
}

console.log(
  `migrations: ${files.length} on disk, ${applied.size} previously applied, ${appliedNow} applied now`
);
db.close();
