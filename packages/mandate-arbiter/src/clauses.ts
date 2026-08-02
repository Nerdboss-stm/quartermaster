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
