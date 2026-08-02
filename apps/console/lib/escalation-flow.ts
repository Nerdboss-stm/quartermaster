import {
  ConsoleEscalator,
  CORRECTION_MESSAGE,
  escalationText,
  LinqEscalator,
  parseReply,
  type Escalation,
  type Escalator,
  type ParsedReply,
} from "@quartermaster/escalation";
import type { Verdict } from "mandate-arbiter";
import { insertTraceEvent, runOwner, setRunState, sqlGet, sqlRun } from "./db";
import { getUser } from "./tenant";

export function escalationChannel(toNumber?: string): "linq" | "console" {
  const wanted = process.env.ESCALATION_CHANNEL === "console" ? "console" : "linq";
  if (wanted === "linq") {
    const to = toNumber ?? process.env.LINQ_TO_NUMBER;
    if (!process.env.LINQ_API_KEY || !process.env.LINQ_FROM_NUMBER || !to) {
      console.warn(
        "escalation: linq channel selected but LINQ_API_KEY/LINQ_FROM_NUMBER/LINQ_TO_NUMBER incomplete; falling back to console"
      );
      return "console";
    }
  }
  return wanted;
}

export function buildEscalator(
  runId: string | null,
  toNumber?: string
): Escalator {
  if (escalationChannel(toNumber) === "linq") {
    return new LinqEscalator({
      apiKey: process.env.LINQ_API_KEY!,
      fromNumber: process.env.LINQ_FROM_NUMBER!,
      toNumber: (toNumber ?? process.env.LINQ_TO_NUMBER)!,
    });
  }
  return new ConsoleEscalator((kind, payload) => {
    // The sink is synchronous by contract; the trace write is fire-and-forget.
    if (runId) void insertTraceEvent(runId, { type: `console_${kind}`, payload });
    else console.log(`escalation console sink: ${kind}`, payload);
  });
}

export async function raiseEscalation(
  runId: string,
  verdict: Verdict,
  quoteId: string
): Promise<void> {
  const ownerId = await runOwner(runId);
  const owner = await getUser(ownerId);
  const failingDetail = verdict.determinedBy[0]?.detail ?? "policy refusal";
  const e: Escalation = {
    runId,
    mandateId: verdict.mandateId,
    quoteId,
    failingDetail,
    options: ["APPROVE", "DECLINE", "RAISE CAP TO $X"],
  };
  await sqlRun(
    `INSERT INTO escalations (run_id, mandate_id, quote_id, failing_detail, options, status, at, owner_id)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
    [
      runId,
      e.mandateId,
      quoteId,
      failingDetail,
      JSON.stringify(e.options),
      new Date().toISOString(),
      ownerId,
    ]
  );
  const channel = escalationChannel(owner?.phone ?? undefined);
  await insertTraceEvent(runId, {
    type: "escalation_requested",
    channel,
    mandateId: e.mandateId,
    quoteId,
    failingDetail,
    options: e.options,
    // The literal outbound message, so the console transcript shows what
    // the owner actually received rather than a paraphrase.
    text: escalationText(e),
    toLast4: process.env.DEMO_PHONE_LAST4 ?? null,
  });
  await buildEscalator(runId, owner?.phone ?? undefined).sendEscalation(e);
}

export interface PendingEscalation {
  id: number;
  run_id: string;
  mandate_id: string;
  quote_id: string;
  failing_detail: string;
  options: string;
  at: string;
}

export async function latestPendingEscalation(
  ownerId: string
): Promise<PendingEscalation | null> {
  const row = await sqlGet<PendingEscalation>(
    "SELECT id, run_id, mandate_id, quote_id, failing_detail, options, at FROM escalations WHERE status = 'pending' AND owner_id = ? ORDER BY id DESC LIMIT 1",
    [ownerId]
  );
  return row ?? null;
}

/** Store a raw reply. Strict regex parse only. Unparsed rows keep the
 *  escalation pending and earn the correction message. */
export async function recordReply(
  escalation: PendingEscalation,
  raw: string,
  source: "linq" | "console"
): Promise<{ parsed: ParsedReply | null; claimed: boolean; correction?: string }> {
  const runId = escalation.run_id;
  const parsed = parseReply(raw);
  await sqlRun(
    `INSERT INTO escalation_replies (run_id, raw, action, new_cap_cents, source, at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      runId,
      raw,
      parsed?.action ?? null,
      parsed?.newCapCents ?? null,
      source,
      new Date().toISOString(),
    ]
  );
  await insertTraceEvent(runId, {
    type: "escalation_reply",
    raw,
    parsed: parsed ?? null,
    source,
  });

  // Anything we cannot parse leaves the escalation open and earns a
  // correction listing the three exact forms. No LLM interprets this.
  if (!parsed) {
    return { parsed: null, claimed: false, correction: CORRECTION_MESSAGE };
  }

  // Claim the escalation atomically. Only the caller that flips it from
  // pending may act on the answer, so a redelivered iMessage — or the same
  // person answering by text and in the inbox — settles exactly once.
  const result = await sqlRun(
    "UPDATE escalations SET status = 'answered' WHERE id = ? AND status = 'pending'",
    [escalation.id]
  );
  return { parsed, claimed: result.changes === 1 };
}

/** Poll for a parsed reply. Timeout fails closed. */
export async function awaitReply(
  runId: string,
  timeoutMs = 15 * 60_000
): Promise<ParsedReply> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const row = await sqlGet<{
      action: ParsedReply["action"];
      new_cap_cents: number | null;
    }>(
      "SELECT action, new_cap_cents FROM escalation_replies WHERE run_id = ? AND action IS NOT NULL ORDER BY id LIMIT 1",
      [runId]
    );
    if (row) {
      return {
        action: row.action,
        ...(row.new_cap_cents != null ? { newCapCents: row.new_cap_cents } : {}),
      };
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  await setRunState(runId, "escalation_timeout");
  await insertTraceEvent(runId, { type: "escalation_timeout", timeoutMs });
  throw new Error(`escalation reply timeout after ${timeoutMs}ms: failing closed`);
}
