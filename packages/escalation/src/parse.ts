import type { Escalation, ParsedReply } from "./types";

// Strict regex only. NO LLM anywhere in the reply path (hard law 1).
const APPROVE_RE = /^\s*approve\s*[.!]?\s*$/i;
const DECLINE_RE = /^\s*decline\s*[.!]?\s*$/i;
const RAISE_RE = /^\s*raise\s+cap\s+to\s+\$?\s*(\d+(?:\.\d{1,2})?)\s*[.!]?\s*$/i;

export function parseReply(raw: string): ParsedReply | null {
  if (APPROVE_RE.test(raw)) return { action: "approve" };
  if (DECLINE_RE.test(raw)) return { action: "decline" };
  const m = RAISE_RE.exec(raw);
  if (m) {
    const cents = Math.round(Number.parseFloat(m[1]) * 100);
    if (!Number.isSafeInteger(cents) || cents <= 0) return null;
    return { action: "raise_cap", newCapCents: cents };
  }
  return null;
}

export const CORRECTION_MESSAGE =
  "Unrecognized reply. Reply with exactly one of:\n" +
  "APPROVE\n" +
  "DECLINE\n" +
  "RAISE CAP TO $X   (e.g. RAISE CAP TO $47)";

export function escalationText(e: Escalation): string {
  return (
    `QUARTERMASTER: blocked a purchase. ${e.failingDetail}. ` +
    `Reply APPROVE, DECLINE, or RAISE CAP TO $X.`
  );
}
