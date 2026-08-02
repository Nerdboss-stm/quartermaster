# Vercel migration — status

Branch `vercel-postgres`. **`main` still runs the demo and is untouched.**

## Why this exists
Vercel functions have an ephemeral, read-only filesystem, so the local
`better-sqlite3` file store cannot deploy. Postgres has no synchronous
client, so every database call had to become async.

## Done — the code layer is complete
- `lib/store.ts` — async storage interface (`all/get/run/tx`), `?` placeholders.
- `lib/store-sqlite.ts` — local driver, unchanged behaviour, resolves immediately.
- `lib/store-postgres.ts` — `pg` pool, `?` → `$n` rewriting that skips string
  literals, real transactions, pool cached on `globalThis` so serverless reuse
  does not leak connections.
- `lib/store-init.ts` — Postgres when `DATABASE_URL` is set, SQLite otherwise;
  `QM_DB_DRIVER` forces either. Postgres is imported lazily, so a local run
  never resolves `pg` and a hosted run never loads the native SQLite binding.
- Every call site converted (~37 across 10 lib modules and 12 routes).
  Dialect-specific SQL removed: `INSERT OR REPLACE` and `INSERT OR IGNORE`
  are now `ON CONFLICT ... DO UPDATE / DO NOTHING`, which both engines accept.

### Verified
- `tsc --noEmit`: clean. `next build`: clean.
- SQLite path unchanged: `/api/portfolio`, `/api/ledger`, `/api/runs/latest`
  all return correct data after the refactor.
- NANDA suite green against the refactored console (14 passed, 1 skipped),
  including a live quote → arbiter refusal → database write.
- `toPositional` unit-checked, including `?` inside string literals.
- `ON CONFLICT DO NOTHING` / `DO UPDATE` confirmed on SQLite.

## Remaining before a deploy
1. **Migrations are still SQLite-only.** `scripts/migrate.ts` uses
   better-sqlite3 directly, and the four migration files use
   `INTEGER PRIMARY KEY AUTOINCREMENT`, which Postgres rejects. Port to
   `GENERATED ALWAYS AS IDENTITY` (or `BIGSERIAL`) and give the runner a
   Postgres path. Nothing else blocks a first deploy.
2. **SSE polls the database every 300ms** (`api/runs/[id]/events`). Fine on a
   long-lived Node process, wasteful and costly on serverless. Move to
   Postgres LISTEN/NOTIFY or client-side polling of a cursor endpoint.
3. **Env vars into Vercel**: `DATABASE_URL`, Prava, OpenAI, Linq. The Linq
   webhook then uses the dashboard signing secret, not the CLI session secret.
4. **Agent B stays on Fly.** A merchant on a genuinely separate host is the
   story, not an accident of hosting.
5. **Product hardening**: the console assumes one global demo run, and the
   demo controller can spend real sandbox money. Scope runs per visitor and
   gate those controls before sharing the URL publicly.

## Verify after any further change
```
pnpm --filter @quartermaster/console build
pnpm demo:core                                   # SQLite path
QM_DB_DRIVER=postgres DATABASE_URL=... pnpm db:migrate   # after item 1
```
