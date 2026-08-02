export interface Escalation {
  runId: string;
  mandateId: string;
  quoteId: string;
  failingDetail: string;
  options: ["APPROVE", "DECLINE", "RAISE CAP TO $X"];
}

export interface ParsedReply {
  action: "approve" | "decline" | "raise_cap";
  newCapCents?: number;
}

export interface EscalationReply {
  runId: string;
  raw: string;
  parsed: ParsedReply;
}

export interface Escalator {
  sendEscalation(e: Escalation): Promise<void>;
  /** Receipts and corrections ride the same channel as escalations. */
  sendText(text: string): Promise<void>;
}
