-- 003_escalation: escalation requests, replies, webhook dedupe.

CREATE TABLE escalations (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id         TEXT NOT NULL,
  mandate_id     TEXT NOT NULL,
  quote_id       TEXT NOT NULL,
  failing_detail TEXT NOT NULL,
  options        TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('pending', 'answered', 'expired')),
  at             TEXT NOT NULL
);

CREATE INDEX idx_escalations_status ON escalations (status, at);

CREATE TABLE escalation_replies (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id        TEXT NOT NULL,
  raw           TEXT NOT NULL,
  action        TEXT CHECK (action IN ('approve', 'decline', 'raise_cap')),
  new_cap_cents INTEGER,
  source        TEXT NOT NULL,
  at            TEXT NOT NULL
);

CREATE INDEX idx_escalation_replies_run ON escalation_replies (run_id, id);

CREATE TABLE webhook_events (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL
);
