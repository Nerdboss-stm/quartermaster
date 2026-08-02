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

## Also done — migrations run on both engines
`scripts/migrate.ts` now picks its engine the same way the app does
(`DATABASE_URL`, or `QM_DB_DRIVER` to force). Migrations stay portable: the
only dialect-specific construct, the autoincrement key, is written as
`{{AUTO_ID}}` and substituted (`INTEGER PRIMARY KEY AUTOINCREMENT` for
SQLite, `BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY` for Postgres).
Each Postgres migration runs in its own transaction and rolls back on
failure. Verified: the existing local database is untouched (4 of 4 already
applied), and a fresh database builds every table with a working
autoincrement id.

The registry also self-heals now (`ensureOffersSeeded`). Agent B registers
at boot, but a console that starts later — or a new serverless instance on
a fresh database — would have had an empty registry until the merchant
restarted. It now pulls the merchant's self-description on demand.
Verified by wiping the offers table and watching a query repopulate it.

## Remaining before a deploy
1. **SSE polls the database every 300ms** (`api/runs/[id]/events`). Fine on a
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
pnpm demo:core                                        # SQLite path
DATABASE_URL=postgres://... pnpm db:migrate           # Postgres schema
```

## Vercel environment variables
Set these in the Vercel project, NOT in the local `.env`:

| Variable | Value |
|---|---|
| `DATABASE_URL` | from the Neon/Postgres integration |
| `CONSOLE_URL` | `https://quartermaster-theta.vercel.app` |
| `AGENT_B_URL` | `https://quartermaster-agent-b.fly.dev` |
| `PRAVA_BASE_URL`, `PRAVA_SECRET_KEY` | sandbox values |
| `PRAVA_CUSTOMER_ID`, `PRAVA_USER_EMAIL` | as local |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | as local |
| `LINQ_API_KEY`, `LINQ_FROM_NUMBER`, `LINQ_TO_NUMBER`, `LINQ_DEMO_CHAT_ID` | as local |
| `LINQ_WEBHOOK_SECRET` | the **dashboard** subscription secret, not the CLI session one |
| `ESCALATION_CHANNEL` | `linq` |
| `SETTLEMENT_MODE` | `sandbox` |

Local `.env` keeps `CONSOLE_URL=http://localhost:3000`. If it pointed at
Vercel, Agent B would register its offer with the deployed console and the
local demo registry would be empty.

After deploying, repoint the Linq webhook subscription at
`https://quartermaster-theta.vercel.app/api/webhooks/linq` so owner replies
reach the deployed console.
