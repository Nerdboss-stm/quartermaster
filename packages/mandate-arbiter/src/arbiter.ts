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
