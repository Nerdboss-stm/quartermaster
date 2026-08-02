-- 002_core: mandates, envelopes, registry, runs, trace, ledger.

CREATE TABLE mandates (
  id         TEXT PRIMARY KEY,
  body       TEXT NOT NULL,
  status     TEXT NOT NULL CHECK (status IN ('active', 'superseded')),
  supersedes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE envelopes (
  id                   TEXT PRIMARY KEY,
  label                TEXT NOT NULL,
  prava_mandate_id     TEXT NOT NULL,
  merchant_name        TEXT NOT NULL,
  per_charge_cap_cents INTEGER NOT NULL,
  renews_at            TEXT NOT NULL,
  created_at           TEXT NOT NULL
);

CREATE TABLE offers (
  id         TEXT PRIMARY KEY,
  agent_id   TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE runs (
  id         TEXT PRIMARY KEY,
  state      TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE trace_events (
  id     {{AUTO_ID}},
  run_id TEXT NOT NULL,
  body   TEXT NOT NULL,
  at     TEXT NOT NULL
);

CREATE INDEX idx_trace_events_run ON trace_events (run_id, id);

CREATE TABLE ledger (
  id               {{AUTO_ID}},
  run_id           TEXT NOT NULL,
  mandate_id       TEXT NOT NULL,
  envelope_id      TEXT,
  entry_type       TEXT NOT NULL CHECK (entry_type IN ('spend', 'amendment')),
  autonomous       INTEGER NOT NULL DEFAULT 0 CHECK (autonomous IN (0, 1)),
  clause_paths     TEXT NOT NULL,
  amount_cents     INTEGER NOT NULL,
  currency         TEXT NOT NULL,
  mode             TEXT NOT NULL CHECK (mode IN ('sandbox', 'production')),
  prava_session_id TEXT,
  prava_txn_id     TEXT,
  merchant_ref     TEXT,
  at               TEXT NOT NULL
);

CREATE INDEX idx_ledger_mandate ON ledger (mandate_id, entry_type, at);
