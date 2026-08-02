-- 005_tenancy: users, per-owner scoping, supplier listings, needs queue,
-- API keys, and run sharing.
--
-- Every ADD COLUMN carries DEFAULT 'usr_demo', which backfills existing
-- rows in both engines as part of this migration. The demo owner inherits
-- the entire pre-tenancy history, so the recorded runs, the audit bundles
-- and `pnpm demo:full` keep working untouched.

CREATE TABLE users (
  id                TEXT PRIMARY KEY,
  email             TEXT NOT NULL UNIQUE,
  -- Empty string means "no password login" (seeded personas).
  password_hash     TEXT NOT NULL,
  display_name      TEXT NOT NULL,
  -- E.164. Escalations go here, and inbound iMessage replies are mapped
  -- back to the user by matching the sender against it.
  phone             TEXT,
  prava_customer_id TEXT NOT NULL,
  created_at        TEXT NOT NULL
);

CREATE INDEX idx_users_phone ON users (phone);

INSERT INTO users (id, email, password_hash, display_name, phone, prava_customer_id, created_at)
VALUES ('usr_demo', 'demo@quartermaster.app', '', 'QuarterMaster Demo', NULL, 'user_saran', '2026-08-02T00:00:00.000Z');

ALTER TABLE mandates       ADD COLUMN owner_id TEXT NOT NULL DEFAULT 'usr_demo';
ALTER TABLE envelopes      ADD COLUMN owner_id TEXT NOT NULL DEFAULT 'usr_demo';
ALTER TABLE runs           ADD COLUMN owner_id TEXT NOT NULL DEFAULT 'usr_demo';
ALTER TABLE escalations    ADD COLUMN owner_id TEXT NOT NULL DEFAULT 'usr_demo';
ALTER TABLE ledger         ADD COLUMN owner_id TEXT NOT NULL DEFAULT 'usr_demo';
ALTER TABLE nanda_payments ADD COLUMN owner_id TEXT NOT NULL DEFAULT 'usr_demo';

-- NULL owner means an external merchant (Agent B on its own host).
ALTER TABLE offers ADD COLUMN owner_id TEXT;

-- A shared run is publicly readable at /r/<id>: the evidence judges open.
ALTER TABLE runs ADD COLUMN shared  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE runs ADD COLUMN need_id TEXT;

-- Who was paid, and (when they are a platform supplier) which account
-- earned it, so a supplier can see their own sales.
ALTER TABLE ledger ADD COLUMN counterparty_id   TEXT;
ALTER TABLE ledger ADD COLUMN supplier_owner_id TEXT;

CREATE INDEX idx_mandates_owner_status ON mandates (owner_id, status);
CREATE INDEX idx_envelopes_owner       ON envelopes (owner_id, created_at);
CREATE INDEX idx_runs_owner            ON runs (owner_id, created_at);
CREATE INDEX idx_escalations_owner     ON escalations (owner_id, status, at);
CREATE INDEX idx_ledger_owner          ON ledger (owner_id, at);
CREATE INDEX idx_ledger_supplier       ON ledger (supplier_owner_id, at);

-- Capacity published by a platform supplier. floor_cents_per_hour is the
-- price they will not go below; it is never advertised, only enforced
-- during a requote.
CREATE TABLE listings (
  id                   TEXT PRIMARY KEY,
  owner_id             TEXT NOT NULL,
  gpu                  TEXT NOT NULL,
  vram_gb              INTEGER NOT NULL,
  rate_cents_per_hour  INTEGER NOT NULL,
  floor_cents_per_hour INTEGER NOT NULL,
  max_duration_h       INTEGER NOT NULL,
  available            INTEGER NOT NULL DEFAULT 1 CHECK (available IN (0, 1)),
  created_at           TEXT NOT NULL
);

CREATE INDEX idx_listings_owner ON listings (owner_id);

-- Agent B holds open quotes in memory; a serverless supplier cannot, so
-- platform quotes live here. `requoted` enforces one reprice per quote.
CREATE TABLE supplier_quotes (
  id         TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL,
  body       TEXT NOT NULL,
  requoted   INTEGER NOT NULL DEFAULT 0 CHECK (requoted IN (0, 1)),
  created_at TEXT NOT NULL
);

-- A buyer's standing requirement. The state machine is what lets someone
-- post a need and go to sleep: the matcher claims it, and every terminal
-- state is recorded rather than retried.
CREATE TABLE needs (
  id              TEXT PRIMARY KEY,
  owner_id        TEXT NOT NULL,
  vram_gb         INTEGER NOT NULL,
  duration_h      REAL NOT NULL,
  deadline        TEXT NOT NULL,
  max_price_cents INTEGER NOT NULL,
  phone           TEXT,
  state           TEXT NOT NULL CHECK (state IN
    ('pending', 'running', 'escalated', 'settled', 'refused', 'declined', 'failed', 'expired')),
  run_id          TEXT,
  claimed_at      TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE INDEX idx_needs_state ON needs (state, created_at);
CREATE INDEX idx_needs_owner ON needs (owner_id, created_at);

-- Per-tenant NANDA access. A request with no key falls back to the demo
-- owner, so the published plugin and its tests keep working unchanged.
CREATE TABLE api_keys (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL,
  key_hash   TEXT NOT NULL UNIQUE,
  label      TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_api_keys_owner ON api_keys (owner_id);
