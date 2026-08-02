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
import { db, insertTraceEvent, setRunState } from "./db";

export function escalationChannel(): "linq" | "console" {
  const wanted = process.env.ESCALATION_CHANNEL === "console" ? "console" : "linq";
  if (wanted === "linq") {
    if (
      !process.env.LINQ_API_KEY ||
      !process.env.LINQ_FROM_NUMBER ||
      !process.env.LINQ_TO_NUMBER
    ) {
      console.warn(
        "escalation: linq channel selected but LINQ_API_KEY/LINQ_FROM_NUMBER/LINQ_TO_NUMBER incomplete; falling back to console"
      );
      return "console";
    }
  }
  return wanted;
}

export function buildEscalator(runId: string | null): Escalator {
  if (escalationChannel() === "linq") {
    return new LinqEscalator({
      apiKey: process.env.LINQ_API_KEY!,
      fromNumber: process.env.LINQ_FROM_NUMBER!,
      toNumber: process.env.LINQ_TO_NUMBER!,
    });
  }
  return new ConsoleEscalator((kind, payload) => {
    if (runId) insertTraceEvent(runId, { type: `console_${kind}`, payload });
    else console.log(`escalation console sink: ${kind}`, payload);
  });
}

export async function raiseEscalation(
  runId: string,
  verdict: Verdict,
  quoteId: string
): Promise<void> {
  const failingDetail = verdict.determinedBy[0]?.detail ?? "policy refusal";
  const e: Escalation = {
    runId,
    mandateId: verdict.mandateId,
    quoteId,
    failingDetail,
    options: ["APPROVE", "DECLINE", "RAISE CAP TO $X"],
  };
  db()
    .prepare(
      `INSERT INTO escalations (run_id, mandate_id, quote_id, failing_detail, options, status, at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?)`
    )
    .run(
      runId,
      e.mandateId,
      quoteId,
      failingDetail,
      JSON.stringify(e.options),
      new Date().toISOString()
    );
  const channel = escalationChannel();
  insertTraceEvent(runId, {
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
  await buildEscalator(runId).sendEscalation(e);
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

export function latestPendingEscalation(): PendingEscalation | null {
  return (
    (db()
      .prepare(
        "SELECT id, run_id, mandate_id, quote_id, failing_detail, options, at FROM escalations WHERE status = 'pending' ORDER BY id DESC LIMIT 1"
      )
      .get() as PendingEscalation | undefined) ?? null
  );
}

/** Store a raw reply. Strict regex parse only. Unparsed rows keep the
 *  escalation pending and earn the correction message. */
export function recordReply(
  runId: string,
  raw: string,
  source: "linq" | "console"
): { parsed: ParsedReply | null; correction?: string } {
  const parsed = parseReply(raw);
  db()
    .prepare(
      `INSERT INTO escalation_replies (run_id, raw, action, new_cap_cents, source, at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      runId,
      raw,
      parsed?.action ?? null,
      parsed?.newCapCents ?? null,
      source,
      new Date().toISOString()
    );
  insertTraceEvent(runId, {
    type: "escalation_reply",
    raw,
    parsed: parsed ?? null,
    source,
  });
  if (!parsed) return { parsed: null, correction: CORRECTION_MESSAGE };
  db()
    .prepare(
      "UPDATE escalations SET status = 'answered' WHERE run_id = ? AND status = 'pending'"
    )
    .run(runId);
  return { parsed };
}

/** Poll for a parsed reply. Timeout fails closed. */
export async function awaitReply(
  runId: string,
  timeoutMs = 15 * 60_000
): Promise<ParsedReply> {
  const deadline = Date.now() + timeoutMs;
  const stmt = db().prepare(
    "SELECT action, new_cap_cents FROM escalation_replies WHERE run_id = ? AND action IS NOT NULL ORDER BY id LIMIT 1"
  );
  while (Date.now() < deadline) {
    const row = stmt.get(runId) as
      | { action: ParsedReply["action"]; new_cap_cents: number | null }
      | undefined;
    if (row) {
      return {
        action: row.action,
        ...(row.new_cap_cents != null ? { newCapCents: row.new_cap_cents } : {}),
      };
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  setRunState(runId, "escalation_timeout");
  insertTraceEvent(runId, { type: "escalation_timeout", timeoutMs });
  throw new Error(`escalation reply timeout after ${timeoutMs}ms: failing closed`);
}
