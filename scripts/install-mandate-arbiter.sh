#!/usr/bin/env bash
# install-mandate-arbiter.sh
# Run from the QuarterMaster repo ROOT:  bash install-mandate-arbiter.sh
# Recreates packages/mandate-arbiter exactly as authored Jul 29, 2026.
set -euo pipefail

if [ ! -f "pnpm-workspace.yaml" ]; then
  echo "ERROR: run this from the repo root (pnpm-workspace.yaml not found)."
  exit 1
fi

mkdir -p packages/mandate-arbiter/src

cat > packages/mandate-arbiter/package.json <<'EOF'
{
  "name": "mandate-arbiter",
  "version": "0.1.0",
  "description": "Deterministic mandate evaluation for spending agents. Fails closed.",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "files": ["src", "README.md", "LICENSE"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "node --test"
  },
  "license": "MIT"
}
EOF

cat > packages/mandate-arbiter/tsconfig.json <<'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "declaration": true,
    "outDir": "dist",
    "skipLibCheck": true
  },
  "include": ["src"]
}
EOF

cat > packages/mandate-arbiter/LICENSE <<'EOF'
MIT License

Copyright (c) 2026 Saran Teja Mallela

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
EOF

cat > packages/mandate-arbiter/src/types.ts <<'EOF'
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
EOF

cat > packages/mandate-arbiter/src/clauses.ts <<'EOF'
import type {
  AttributeClause,
  Cents,
  EvalContext,
  LeafClause,
  Mandate,
  Proposal,
} from "./types.js";

export interface LeafOutcome {
  ok: boolean;
  detail: string;
}

const usd = (c: Cents) => `$${(c / 100).toFixed(2)}`;

/**
 * Evaluate a single leaf clause. Deterministic. Fails closed on any
 * missing input, type mismatch, or ledger failure.
 */
export async function evaluateLeaf(
  clause: LeafClause,
  mandate: Mandate,
  proposal: Proposal,
  ctx: EvalContext
): Promise<LeafOutcome> {
  switch (clause.kind) {
    case "amount_cap": {
      const ok = proposal.amountCents <= clause.maxCents;
      return {
        ok,
        detail: ok
          ? `amount ${usd(proposal.amountCents)} within cap ${usd(clause.maxCents)}`
          : `amount ${usd(proposal.amountCents)} exceeds cap ${usd(clause.maxCents)}`,
      };
    }

    case "cumulative_cap": {
      if (!ctx.ledger) {
        return {
          ok: false,
          detail: "no ledger available: failing closed on cumulative cap",
        };
      }
      let prior: Cents;
      try {
        prior = await ctx.ledger.cumulativeSpendCents(
          mandate.id,
          clause.windowMs
        );
      } catch {
        return {
          ok: false,
          detail: "ledger read failed: failing closed on cumulative cap",
        };
      }
      const projected = prior + proposal.amountCents;
      const ok = projected <= clause.maxCents;
      const win = clause.windowMs
        ? ` in ${Math.round(clause.windowMs / 3_600_000)}h window`
        : "";
      return {
        ok,
        detail: ok
          ? `spent ${usd(prior)} + ${usd(proposal.amountCents)} = ${usd(projected)} within ${usd(clause.maxCents)}${win}`
          : `spent ${usd(prior)} + ${usd(proposal.amountCents)} = ${usd(projected)} exceeds ${usd(clause.maxCents)}${win}`,
      };
    }

    case "counterparty_allowlist": {
      const candidates = [proposal.counterpartyId, proposal.merchantId].filter(
        (x): x is string => typeof x === "string"
      );
      const hit = candidates.find((c) => clause.ids.includes(c));
      return hit
        ? { ok: true, detail: `counterparty ${hit} on allowlist` }
        : {
            ok: false,
            detail: `counterparty ${candidates.join(" / ") || "(none)"} not on allowlist`,
          };
    }

    case "valid_window": {
      const now = (ctx.now ?? new Date()).getTime();
      if (clause.notBefore && now < Date.parse(clause.notBefore)) {
        return { ok: false, detail: `before window opens (${clause.notBefore})` };
      }
      if (clause.notAfter && now > Date.parse(clause.notAfter)) {
        return { ok: false, detail: `after window closed (${clause.notAfter})` };
      }
      return { ok: true, detail: "within validity window" };
    }

    case "attribute":
      return evaluateAttribute(clause, proposal);
  }
}

function evaluateAttribute(
  clause: AttributeClause,
  proposal: Proposal
): LeafOutcome {
  const present = Object.prototype.hasOwnProperty.call(
    proposal.attributes,
    clause.key
  );
  const actual = present ? proposal.attributes[clause.key] : undefined;

  if (clause.op === "exists") {
    return present
      ? { ok: true, detail: `attribute "${clause.key}" present` }
      : { ok: false, detail: `attribute "${clause.key}" missing` };
  }

  if (!present) {
    // Fail closed: an absent fact never satisfies a requirement.
    return {
      ok: false,
      detail: `attribute "${clause.key}" missing: failing closed`,
    };
  }

  const show = (v: unknown) => JSON.stringify(v);

  switch (clause.op) {
    case "eq": {
      const ok = actual === clause.value;
      return {
        ok,
        detail: `${clause.key} = ${show(actual)} ${ok ? "equals" : "does not equal"} ${show(clause.value)}`,
      };
    }
    case "neq": {
      const ok = actual !== clause.value;
      return {
        ok,
        detail: `${clause.key} = ${show(actual)} ${ok ? "differs from" : "equals"} ${show(clause.value)}`,
      };
    }
    case "lte":
    case "gte": {
      if (typeof actual !== "number" || typeof clause.value !== "number") {
        return {
          ok: false,
          detail: `${clause.key}: non-numeric comparison: failing closed`,
        };
      }
      const ok =
        clause.op === "lte" ? actual <= clause.value : actual >= clause.value;
      const sym = clause.op === "lte" ? "<=" : ">=";
      return {
        ok,
        detail: `${clause.key} = ${actual} ${ok ? "satisfies" : "violates"} ${sym} ${clause.value}`,
      };
    }
    case "in": {
      if (!Array.isArray(clause.value)) {
        return {
          ok: false,
          detail: `${clause.key}: "in" clause without array: failing closed`,
        };
      }
      const ok = (clause.value as Array<string | number>).includes(
        actual as string | number
      );
      return {
        ok,
        detail: `${clause.key} = ${show(actual)} ${ok ? "in" : "not in"} ${show(clause.value)}`,
      };
    }
  }
}
EOF

cat > packages/mandate-arbiter/src/arbiter.ts <<'EOF'
import { evaluateLeaf } from "./clauses.js";
import type {
  Clause,
  ClauseResult,
  Decision,
  EvalContext,
  Mandate,
  Proposal,
  Verdict,
} from "./types.js";

/**
 * Evaluate a proposal against a mandate.
 *
 * Properties:
 * - Deterministic: same inputs, same ledger state, same verdict.
 * - Sequential: clauses evaluate in order, emitting trace events with
 *   real elapsed timings. The UI replays the trace; it never invents pace.
 * - Fail closed: implicit currency and expiry checks run first; missing
 *   facts, missing ledgers, and thrown reads all fail the clause.
 * - Short-circuit: all_of stops at its first failing child. The cascade
 *   halts on the failing clause, which is the point.
 *
 * Decision aggregation:
 * - Root satisfied                                  -> EXECUTE
 * - Root failed, every determining leaf escalatable -> NEEDS_HUMAN
 * - Root failed, any determining leaf hard          -> REFUSE
 *
 * A determining leaf is a failing leaf that caused its enclosing group
 * to fail: the short-circuiting child of an all_of, or every failing
 * alternative of an exhausted any_of.
 */
export async function evaluate(
  mandate: Mandate,
  proposal: Proposal,
  ctx: EvalContext = {}
): Promise<Verdict> {
  const now = ctx.now ?? new Date();
  const results: ClauseResult[] = [];
  const emit = ctx.onEvent ?? (() => {});
  const iso = () => new Date().toISOString();

  emit({
    type: "eval_start",
    mandateId: mandate.id,
    proposalId: proposal.id,
    at: iso(),
  });

  // ---- Implicit checks: never skippable, never escalatable. ----
  const implicit: ClauseResult[] = [];

  const expiryOk =
    now.getTime() >= Date.parse(mandate.issuedAt) &&
    now.getTime() < Date.parse(mandate.expiresAt);
  implicit.push({
    path: "root.@expiry",
    kind: "implicit_expiry",
    ok: expiryOk,
    detail: expiryOk
      ? `mandate valid until ${mandate.expiresAt}`
      : `mandate outside validity (issued ${mandate.issuedAt}, expires ${mandate.expiresAt})`,
    onFail: "refuse",
    elapsedMs: 0,
  });

  const currencyOk = proposal.currency === mandate.currency;
  implicit.push({
    path: "root.@currency",
    kind: "implicit_currency",
    ok: currencyOk,
    detail: currencyOk
      ? `currency ${proposal.currency} matches mandate`
      : `currency ${proposal.currency} does not match mandate ${mandate.currency}: failing closed`,
    onFail: "refuse",
    elapsedMs: 0,
  });

  for (const r of implicit) {
    emit({ type: "clause_start", path: r.path, kind: r.kind, at: iso() });
    results.push(r);
    emit({
      type: "clause_result",
      path: r.path,
      kind: r.kind,
      ok: r.ok,
      detail: r.detail,
      elapsedMs: r.elapsedMs,
      at: iso(),
    });
  }

  const implicitFailures = implicit.filter((r) => !r.ok);
  let determinedBy: ClauseResult[] = [];
  let rootOk = false;

  if (implicitFailures.length > 0) {
    determinedBy = implicitFailures;
  } else {
    const walk = await walkClause(
      mandate.root,
      "root",
      mandate,
      proposal,
      { ...ctx, now },
      results,
      emit,
      iso
    );
    rootOk = walk.ok;
    determinedBy = walk.ok ? [] : walk.determinedBy;
  }

  let decision: Decision;
  if (rootOk && implicitFailures.length === 0) {
    decision = "EXECUTE";
  } else if (
    determinedBy.length > 0 &&
    determinedBy.every((r) => r.onFail === "escalate")
  ) {
    decision = "NEEDS_HUMAN";
  } else {
    decision = "REFUSE";
  }

  emit({
    type: "verdict",
    decision,
    determinedByPaths: determinedBy.map((r) => r.path),
    at: iso(),
  });

  return {
    decision,
    mandateId: mandate.id,
    proposalId: proposal.id,
    results,
    determinedBy,
    evaluatedAt: now.toISOString(),
  };
}

interface WalkOutcome {
  ok: boolean;
  determinedBy: ClauseResult[];
}

async function walkClause(
  clause: Clause,
  path: string,
  mandate: Mandate,
  proposal: Proposal,
  ctx: EvalContext,
  results: ClauseResult[],
  emit: NonNullable<EvalContext["onEvent"]>,
  iso: () => string
): Promise<WalkOutcome> {
  if (clause.kind === "all_of") {
    for (let i = 0; i < clause.clauses.length; i++) {
      const child = await walkClause(
        clause.clauses[i],
        `${path}.all_of[${i}]`,
        mandate,
        proposal,
        ctx,
        results,
        emit,
        iso
      );
      if (!child.ok) {
        // Short-circuit: the cascade halts here.
        return { ok: false, determinedBy: child.determinedBy };
      }
    }
    return { ok: true, determinedBy: [] };
  }

  if (clause.kind === "any_of") {
    const failures: ClauseResult[] = [];
    for (let i = 0; i < clause.clauses.length; i++) {
      const child = await walkClause(
        clause.clauses[i],
        `${path}.any_of[${i}]`,
        mandate,
        proposal,
        ctx,
        results,
        emit,
        iso
      );
      if (child.ok) return { ok: true, determinedBy: [] };
      failures.push(...child.determinedBy);
    }
    // Exhausted: every failing alternative co-determines the outcome.
    return { ok: false, determinedBy: failures };
  }

  // Leaf.
  emit({ type: "clause_start", path, kind: clause.kind, at: iso() });
  const t0 = Date.now();
  const outcome = await evaluateLeaf(clause, mandate, proposal, ctx);
  const elapsedMs = Date.now() - t0;
  const result: ClauseResult = {
    path,
    kind: clause.kind,
    ok: outcome.ok,
    detail: outcome.detail,
    onFail: clause.onFail ?? "refuse",
    elapsedMs,
  };
  results.push(result);
  emit({
    type: "clause_result",
    path,
    kind: clause.kind,
    ok: result.ok,
    detail: result.detail,
    elapsedMs,
    at: iso(),
  });
  return { ok: result.ok, determinedBy: result.ok ? [] : [result] };
}
EOF

cat > packages/mandate-arbiter/src/index.ts <<'EOF'
export { evaluate } from "./arbiter.js";
export { evaluateLeaf } from "./clauses.js";
export type {
  AmountCapClause,
  AttributeClause,
  AttributeOp,
  AllOfClause,
  AnyOfClause,
  Cents,
  Clause,
  ClauseResult,
  CounterpartyAllowlistClause,
  CumulativeCapClause,
  Decision,
  EvalContext,
  FailMode,
  LeafClause,
  LedgerReader,
  Mandate,
  Proposal,
  TraceEvent,
  ValidWindowClause,
  Verdict,
} from "./types.js";
EOF

cat > packages/mandate-arbiter/README.md <<'EOF'
# mandate-arbiter

Deterministic evaluation of spending proposals against signed mandates.
No LLM in the decision path. Fails closed.

A **mandate** is structured authority from a principal (a human) to an
agent: which counterparties, how much per transaction, how much
cumulatively, over what window, under what conditions. The **arbiter**
walks the clause tree against a concrete **proposal** and returns one of
three verdicts:

| Verdict | Meaning |
|---|---|
| `EXECUTE` | Every clause satisfied. The agent may proceed. |
| `REFUSE` | A hard clause failed. The agent may not proceed and may not ask. |
| `NEEDS_HUMAN` | Only escalatable clauses failed. The agent may not proceed, but may ask its principal. |

Escalation is a property the principal grants per clause (`onFail:
"escalate"`), not a behavior the agent chooses. An agent that wants more
authority has exactly one move: ask for a new mandate.

## Semantics

- **Deterministic.** Same inputs, same ledger state, same verdict.
- **Fail closed.** Missing attributes, missing ledger, thrown ledger
  reads, currency mismatch, expired mandate: all fail.
- **Sequential with real timing.** Clauses evaluate in order and emit
  `TraceEvent`s with measured elapsed times. Render the trace by
  replaying it; do not invent pace.
- **Short-circuit.** `all_of` halts at its first failing child.
  `any_of` is exhausted before it fails, and every failing alternative
  co-determines the outcome.
- **Aggregation.** The verdict is `NEEDS_HUMAN` only when *every*
  determining leaf is escalatable. One hard failure anywhere refuses.

## Provenance

Generic, domain-agnostic library authored July 29, 2026, before the
Prava x OpenAI Agentic Commerce Hackathon build window, and disclosed
in that event's submission per its rules. The arbiter design descends
from Greenlight, the author's prior-authorization agent: constraint
tree, deterministic verdicts, fail-closed defaults.
EOF

echo ""
echo "mandate-arbiter installed. Now run:"
echo "  pnpm install && pnpm -r build"
