# Vercel migration — status

Branch `vercel-postgres`. **`main` is untouched and still runs the demo.**

## Why this exists
Vercel functions have an ephemeral, read-only filesystem, so the local
`better-sqlite3` file store cannot deploy. Postgres has no synchronous
client, so every database call had to become async.

## Done
- `lib/store.ts` — async storage interface (`all/get/run/tx`), `?` placeholders.
- `lib/store-sqlite.ts` — local driver, unchanged behaviour, resolves immediately.
- `lib/store-postgres.ts` — `pg` pool, `?` → `$n` rewriting, real transactions,
  pool cached on `globalThis` so serverless reuse doesn't leak connections.
- `lib/store-init.ts` — picks the driver: Postgres when `DATABASE_URL` is set,
  SQLite otherwise; `QM_DB_DRIVER` forces either. Postgres imported lazily so a
  local run never resolves `pg` and a hosted run never loads the native binding.
- `lib/db.ts` rewritten onto the seam; converted: quotes, mandates, envelopes,
  portfolio, router, amendments (transaction now `sqlTx`), registry,
  evaluate-quote, demo-flow, agent-a, plus most route handlers.

## Remaining (about 16 type errors, all mechanical)
1. Files still importing the removed `db` symbol: `settlement.ts`, `bundle.ts`,
   `escalation-flow.ts`, `nanda.ts` (3 raw `db()` blocks left), and routes
   `api/demo`, `api/ledger`, `api/webhooks/linq`. Swap to `sqlAll/sqlGet/sqlRun`.
2. Sync functions that now need `async`: `buildBundle` (bundle.ts:64),
   `latestPendingEscalation` and `recordReply` (escalation-flow.ts:40,128),
   `countChargeAttempts` (settlement.ts:35).
3. `api/runs/[id]/trace/route.ts:12` — `await` the `traceEventsSince` call
   before `.map`.
4. `mandates.ts:23` — annotate `cur` to break the inferred-any cycle.

## Then, before deploying
- Port the four migrations to Postgres dialect: `INTEGER PRIMARY KEY
  AUTOINCREMENT` → `GENERATED ALWAYS AS IDENTITY` (or `BIGSERIAL`), and confirm
  `INSERT OR REPLACE` is gone (nanda.ts now uses `ON CONFLICT`).
- `scripts/migrate.ts` needs a Postgres path too; it is still SQLite-only.
- SSE (`api/runs/[id]/events`) polls the database every 300ms. That is fine on a
  long-lived Node process, wasteful on serverless. Move to Postgres
  LISTEN/NOTIFY or client polling before this is a real product.
- Env vars into Vercel: `DATABASE_URL`, Prava, OpenAI, Linq. The Linq webhook
  then uses the dashboard signing secret, not the CLI session secret.
- Agent B stays on Fly. A merchant on a genuinely separate host is the story.
- Multi-visitor: the console assumes one global demo run, and the demo
  controller can spend real sandbox money. Scope runs and gate those controls
  before sharing the URL.

## Verify after finishing
```
pnpm --filter @quartermaster/console build
pnpm demo:core                 # SQLite path unchanged
QM_DB_DRIVER=postgres DATABASE_URL=... pnpm db:migrate
```
