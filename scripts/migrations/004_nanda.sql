-- 004_nanda: maps NANDA Town PaymentRefs onto our runs and ledger rows,
-- so verify_payment(ref) is an exact lookup rather than a scan.

CREATE TABLE nanda_payments (
  ref            TEXT PRIMARY KEY,
  run_id         TEXT NOT NULL,
  quote_id       TEXT NOT NULL,
  payer          TEXT NOT NULL,
  payee          TEXT NOT NULL,
  amount_cents   INTEGER NOT NULL,
  currency       TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('confirmed', 'failed')),
  envelope_id    TEXT,
  prava_txn_id   TEXT,
  merchant_ref   TEXT,
  error_code     TEXT,
  error_message  TEXT,
  at             TEXT NOT NULL
);

CREATE INDEX idx_nanda_payments_run ON nanda_payments (run_id);
