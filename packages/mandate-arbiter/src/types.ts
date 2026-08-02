/**
 * mandate-arbiter
 *
 * Deterministic evaluation of spending proposals against signed mandates.
 * No LLM in the decision path. Fails closed.
 *
 * Generic, domain-agnostic library. Authored before the Prava x OpenAI
 * Agentic Commerce Hackathon build window; disclosed per event rules.
 * License: MIT
 */

/** Amounts are integer minor units (cents). Never floats. */
export type Cents = number;

export type Decision = "EXECUTE" | "REFUSE" | "NEEDS_HUMAN";

/**
 * What a failing leaf clause does to the final decision.
 * "refuse":   hard stop. The agent may not proceed and may not ask.
 * "escalate": the agent may not proceed, but may ask its principal.
 * Default is "refuse". Escalation is opt-in, per clause, by the principal.
 */
export type FailMode = "refuse" | "escalate";

/** A request to spend: one concrete offer the agent wants to accept. */
export interface Proposal {
  id: string;
  /** The party asking to be paid (e.g. the selling agent). */
  counterpartyId: string;
  /** Merchant identifier when distinct from the counterparty. */
  merchantId?: string;
  amountCents: Cents;
  /** ISO 4217, e.g. "USD". Must match the mandate currency. */
  currency: string;
  /** Structured facts about the offer: specs, terms, windows. */
  attributes: Record<string, string | number | boolean>;
  /** ISO 8601 */
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Clause tree                                                         */
/* ------------------------------------------------------------------ */

export interface AmountCapClause {
  kind: "amount_cap";
  maxCents: Cents;
  onFail?: FailMode;
}

export interface CumulativeCapClause {
  kind: "cumulative_cap";
  maxCents: Cents;
  /** Rolling window ending now. Omit for mandate lifetime. */
  windowMs?: number;
  onFail?: FailMode;
}

export interface CounterpartyAllowlistClause {
  kind: "counterparty_allowlist";
  /** Matches Proposal.counterpartyId or Proposal.merchantId. */
  ids: string[];
  onFail?: FailMode;
}

export type AttributeOp = "eq" | "neq" | "lte" | "gte" | "in" | "exists";

export interface AttributeClause {
  kind: "attribute";
  key: string;
  op: AttributeOp;
  /** Omit for op "exists". Array required for op "in". */
  value?: string | number | boolean | Array<string | number>;
  onFail?: FailMode;
}

export interface ValidWindowClause {
  kind: "valid_window";
  /** ISO 8601 bounds on when the proposal may be accepted. */
  notBefore?: string;
  notAfter?: string;
  onFail?: FailMode;
}

export interface AllOfClause {
  kind: "all_of";
  clauses: Clause[];
}

export interface AnyOfClause {
  kind: "any_of";
  clauses: Clause[];
}

export type LeafClause =
  | AmountCapClause
  | CumulativeCapClause
  | CounterpartyAllowlistClause
  | AttributeClause
  | ValidWindowClause;

export type Clause = LeafClause | AllOfClause | AnyOfClause;

/* ------------------------------------------------------------------ */
/* Mandate                                                             */
/* ------------------------------------------------------------------ */

/**
 * Signed structured authority from a principal (human) to an agent.
 * The agent cannot amend it: any amendment is a new mandate, newly signed.
 */
export interface Mandate {
  id: string;
  principalId: string;
  agentId: string;
  /** ISO 4217. Proposals in any other currency fail closed. */
  currency: string;
  root: Clause;
  /** ISO 8601 */
  issuedAt: string;
  /** ISO 8601. Expired mandates refuse everything. */
  expiresAt: string;
  /**
   * Detached signature over canonicalize(mandate-without-signature).
   * Canonical scheme pending confirmation from the payments provider.
   * Verification is the caller's responsibility until then.
   */
  signature?: string;
  publicKey?: string;
}

/* ------------------------------------------------------------------ */
/* Ledger                                                              */
/* ------------------------------------------------------------------ */

/**
 * Read side of an append-only spend ledger.
 * If a cumulative_cap clause is present and no ledger is provided,
 * or the ledger read throws, the clause FAILS CLOSED.
 */
export interface LedgerReader {
  cumulativeSpendCents(mandateId: string, windowMs?: number): Promise<Cents>;
}

/* ------------------------------------------------------------------ */
/* Results and trace                                                   */
/* ------------------------------------------------------------------ */

export interface ClauseResult {
  /** Tree address, e.g. "root.all_of[2].any_of[0]". */
  path: string;
  kind: Clause["kind"] | "implicit_expiry" | "implicit_currency";
  ok: boolean;
  /** Human-readable, renders directly in the audit console. */
  detail: string;
  onFail: FailMode;
  elapsedMs: number;
}

export interface Verdict {
  decision: Decision;
  mandateId: string;
  proposalId: string;
  /** Every clause evaluated, in evaluation order. */
  results: ClauseResult[];
  /** Failing leaves that determined a non-EXECUTE decision. */
  determinedBy: ClauseResult[];
  /** ISO 8601 */
  evaluatedAt: string;
}

/** Stream these over SSE; replay them in the UI at recorded timing. */
export type TraceEvent =
  | { type: "eval_start"; mandateId: string; proposalId: string; at: string }
  | { type: "clause_start"; path: string; kind: string; at: string }
  | {
      type: "clause_result";
      path: string;
      kind: string;
      ok: boolean;
      detail: string;
      elapsedMs: number;
      at: string;
    }
  | {
      type: "verdict";
      decision: Decision;
      determinedByPaths: string[];
      at: string;
    };

export interface EvalContext {
  now?: Date;
  ledger?: LedgerReader;
  onEvent?: (e: TraceEvent) => void;
}
