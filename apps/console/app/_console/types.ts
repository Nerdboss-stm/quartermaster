export type Decision = "EXECUTE" | "REFUSE" | "NEEDS_HUMAN";

export interface TraceEnvelope {
  id: number;
  at: string;
  body: Record<string, unknown>;
  /** Real wall-clock gap before this event when it exceeded the replay cap. */
  gapMs?: number;
}

export interface CascadeRow {
  key: string;
  kind: "clause" | "route";
  path: string;
  label: string;
  detail: string;
  ok: boolean | null;
  elapsedMs: number | null;
  onFail: string | null;
  determining: boolean;
}

export interface LedgerRow {
  id: number;
  run_id: string;
  mandate_id: string;
  envelope_id: string | null;
  entry_type: "spend" | "amendment";
  autonomous: 0 | 1;
  clause_paths: string;
  amount_cents: number;
  currency: string;
  mode: string;
  prava_session_id: string | null;
  prava_txn_id: string | null;
  merchant_ref: string | null;
  at: string;
}

export interface EnvelopeRow {
  id: string;
  label: string;
  prava_mandate_id: string;
  merchant_name: string;
  per_charge_cap_cents: number;
  renews_at: string;
  created_at: string;
}

export interface QuoteView {
  id: string;
  amountCents: number;
  currency: string;
  attributes: Record<string, string | number | boolean>;
  pricingRule?: string;
  held?: boolean;
  note?: string;
}

export interface ConsoleState {
  runId: string | null;
  jobLog: { at: string; line: string; source: string }[];
  narration: { at: string; text: string }[];
  need: Record<string, unknown> | null;
  registry: { offerId: string; agentId: string; estimateCents: number; withinBudget: boolean }[];
  quote: QuoteView | null;
  requoteAsk: { targetCents: number; at: string } | null;
  requoteAnswer: { amountCents: number; held: boolean; note?: string; at: string } | null;
  order: { orderRef: string; environment: string } | null;
  provisioning: { at: string; line: string }[];
  imessage: {
    sent: { text: string; at: string; channel: string } | null;
    reply: { raw: string; at: string; action: string | null; source: string } | null;
  };
  cascade: CascadeRow[];
  evalMandateId: string | null;
  verdict: { decision: Decision; at: string; determinedByPaths: string[] } | null;
  amendment: {
    oldId: string;
    newId: string;
    newCapCents: number;
    clausePath: string;
  } | null;
  charge: {
    transactionId: string;
    pravaMandateId: string;
    tokenLast4: string;
    environment: string;
  } | null;
  report: { status: string; visaConfirmation: string; mandateStatus: string | null } | null;
  settlements: {
    envelope: string;
    amountCents: number;
    merchantRef: string;
    autonomous: boolean;
    environment: string;
  }[];
  ledger: LedgerRow[];
  envelopes: EnvelopeRow[];
  policyCapCents: number;
  environment: string;
  lastGapMs: number | null;
}

export const initialState: ConsoleState = {
  runId: null,
  jobLog: [],
  narration: [],
  need: null,
  registry: [],
  quote: null,
  requoteAsk: null,
  requoteAnswer: null,
  order: null,
  provisioning: [],
  imessage: { sent: null, reply: null },
  cascade: [],
  evalMandateId: null,
  verdict: null,
  amendment: null,
  charge: null,
  report: null,
  settlements: [],
  ledger: [],
  envelopes: [],
  policyCapCents: 12000,
  environment: "SANDBOX",
  lastGapMs: null,
};
