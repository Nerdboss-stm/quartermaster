import { Agent, run, tool } from "@openai/agents";
import type { Verdict } from "mandate-arbiter";
import { z } from "zod";
import { createRun, insertTraceEvent, setRunState } from "./db";
import { raiseEscalation } from "./escalation-flow";
import { evaluateQuote } from "./evaluate-quote";
import { findQuote, type Quote } from "./quotes";
import { queryOffers, type Need } from "./registry";

// The run's Need is canonical and lives here, not in model output. Tools
// take ids only, and every amount is read back from stored quotes: the
// LLM narrates and sequences, it never sets a number (hard law 1).
interface RunCtx {
  runId: string;
  need: Need;
  negotiated: boolean;
  verdict: Verdict | null;
}

function trace(ctx: RunCtx, body: Record<string, unknown>): void {
  insertTraceEvent(ctx.runId, body);
}

function buildTools(ctx: RunCtx) {
  const queryRegistry = tool({
    name: "query_registry",
    description:
      "Search the registry for offers matching this run's declared need.",
    parameters: z.object({}),
    async execute() {
      const matches = queryOffers(ctx.need);
      trace(ctx, {
        type: "registry_query",
        need: ctx.need,
        matches: matches.map((m) => ({
          offerId: m.offer.id,
          agentId: m.offer.agentId,
          estimateCents: m.estimateCents,
          withinBudget: m.withinBudget,
        })),
      });
      return JSON.stringify(
        matches.map((m) => ({
          offerId: m.offer.id,
          agentId: m.offer.agentId,
          estimateCents: m.estimateCents,
          withinBudget: m.withinBudget,
          skus: m.offer.skus,
        }))
      );
    },
  });

  const requestQuote = tool({
    name: "request_quote",
    description:
      "Request a firm quote from an offer for this run's declared need.",
    parameters: z.object({ offerId: z.string() }),
    async execute({ offerId }) {
      const match = queryOffers(ctx.need).find((m) => m.offer.id === offerId);
      if (!match) return JSON.stringify({ error: "unknown or non-matching offer" });

      trace(ctx, {
        type: "quote_requested",
        offerId,
        url: match.offer.quoteUrl,
        need: ctx.need,
      });
      const res = await fetch(match.offer.quoteUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(ctx.need),
      });
      if (!res.ok) {
        trace(ctx, { type: "quote_error", offerId, status: res.status });
        return JSON.stringify({ error: `quote failed with ${res.status}` });
      }
      const quote = (await res.json()) as Quote;
      trace(ctx, { type: "quote_received", offerId, quote });
      return JSON.stringify({
        quoteId: quote.id,
        amountCents: quote.amountCents,
        currency: quote.currency,
        attributes: quote.attributes,
        pricingRule: quote.pricingRule,
        budgetCents: ctx.need.maxPriceCents,
        overBudget: quote.amountCents > ctx.need.maxPriceCents,
      });
    },
  });

  const negotiate = tool({
    name: "negotiate",
    description:
      "Ask the seller to reprice a quote. Allowed at most once per run; the target price comes from the run budget.",
    parameters: z.object({ offerId: z.string(), quoteId: z.string() }),
    async execute({ offerId, quoteId }) {
      if (ctx.negotiated) {
        trace(ctx, { type: "requote_blocked", reason: "already negotiated once this run" });
        return JSON.stringify({ error: "negotiation already used this run" });
      }
      const match = queryOffers(ctx.need).find((m) => m.offer.id === offerId);
      const quote = findQuote(ctx.runId, quoteId);
      if (!match || !quote) return JSON.stringify({ error: "unknown offer or quote" });

      ctx.negotiated = true;
      const targetCents = ctx.need.maxPriceCents;
      trace(ctx, { type: "requote_requested", offerId, quoteId, targetCents });
      const res = await fetch(match.offer.requoteUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ quoteId, targetCents }),
      });
      if (!res.ok) {
        trace(ctx, { type: "requote_error", offerId, quoteId, status: res.status });
        return JSON.stringify({ error: `requote failed with ${res.status}` });
      }
      const updated = (await res.json()) as Quote;
      trace(ctx, {
        type: "requote_response",
        offerId,
        quote: updated,
        held: updated.held === true,
        note: updated.note,
      });
      return JSON.stringify({
        quoteId: updated.id,
        amountCents: updated.amountCents,
        held: updated.held === true,
        note: updated.note,
      });
    },
  });

  const evaluateAgainstMandate = tool({
    name: "evaluate_against_mandate",
    description:
      "Deterministically evaluate a quote against the active policy mandate. The arbiter alone decides; its verdict is final.",
    parameters: z.object({ quoteId: z.string() }),
    async execute({ quoteId }) {
      let verdict: Verdict;
      try {
        verdict = await evaluateQuote(ctx.runId, quoteId);
      } catch (err) {
        trace(ctx, { type: "evaluate_error", reason: String(err) });
        return JSON.stringify({ error: "cannot evaluate; failing closed" });
      }
      ctx.verdict = verdict;
      return JSON.stringify({
        decision: verdict.decision,
        determinedBy: verdict.determinedBy.map((d) => ({
          path: d.path,
          detail: d.detail,
          onFail: d.onFail,
        })),
      });
    },
  });

  const escalate = tool({
    name: "escalate",
    description:
      "Record an escalation request to the owner after a NEEDS_HUMAN verdict. Delivery is a separate system.",
    parameters: z.object({}),
    async execute() {
      const v = ctx.verdict;
      if (!v || v.decision !== "NEEDS_HUMAN") {
        return JSON.stringify({
          error: "escalation is only valid after a NEEDS_HUMAN verdict",
        });
      }
      try {
        await raiseEscalation(ctx.runId, v, v.proposalId);
      } catch (err) {
        trace(ctx, { type: "escalation_send_failed", error: String(err) });
        return JSON.stringify({ error: "escalation delivery failed" });
      }
      return JSON.stringify({ recorded: true });
    },
  });

  return [queryRegistry, requestQuote, negotiate, evaluateAgainstMandate, escalate];
}

const INSTRUCTIONS = `You are Agent A, an autonomous buyer of GPU compute for an
overnight training job. You narrate briefly and call tools. You never move
money, never invent or restate numbers the tools did not return, and never
override the arbiter.

Protocol, strictly in order:
1. query_registry.
2. request_quote on the best matching offer (lowest estimate).
3. Only if the quote result says overBudget: true, call negotiate exactly once.
4. evaluate_against_mandate with the final quoteId.
5. If the decision is NEEDS_HUMAN: call escalate, then stop and summarize in
   one sentence. If REFUSE: stop and summarize the refusal. If EXECUTE: stop;
   settlement is handled by a separate system.
Keep prose to one short sentence per step. The arbiter's verdict is final.`;

export interface BuyerRunResult {
  runId: string;
  verdict: Verdict | null;
  finalOutput: string;
}

export async function runBuyerAgent(need: Need): Promise<BuyerRunResult> {
  const model = process.env.OPENAI_MODEL;
  if (!model) throw new Error("OPENAI_MODEL is not set");

  const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  createRun(runId);
  const ctx: RunCtx = { runId, need, negotiated: false, verdict: null };

  insertTraceEvent(runId, {
    type: "system_error",
    source: "agent_a/job llm-finetune-7b",
    line: "RuntimeError: CUDA out of memory. Tried to allocate 8.42 GiB (GPU 0; 39.39 GiB total capacity; 37.11 GiB already allocated; 212.00 MiB free). Checkpoint stalled at step 41200/52000.",
  });
  insertTraceEvent(runId, { type: "need_declared", need });

  const agent = new Agent({
    name: "agent-a-buyer",
    model,
    instructions: INSTRUCTIONS,
    // gpt-5.x reasoning models reject the temperature parameter.
    modelSettings: { toolChoice: "auto" },
    tools: buildTools(ctx),
  });

  try {
    const result = await run(
      agent,
      `GPU capacity incident. Procure compute per protocol. Need: ${JSON.stringify(need)}`,
      { maxTurns: 12 }
    );
    const finalOutput =
      typeof result.finalOutput === "string"
        ? result.finalOutput
        : JSON.stringify(result.finalOutput ?? "");
    insertTraceEvent(runId, { type: "agent_final", text: finalOutput });
    if (!ctx.verdict) setRunState(runId, "failed");
    return { runId, verdict: ctx.verdict, finalOutput };
  } catch (err) {
    insertTraceEvent(runId, { type: "run_error", error: String(err) });
    setRunState(runId, "failed");
    throw err;
  }
}
