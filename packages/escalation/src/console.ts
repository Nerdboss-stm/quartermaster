import type { Escalation, Escalator } from "./types";

/**
 * Console channel: the escalation row itself is the delivery (the Agent A
 * panel polls it), so this adapter only hands payloads to a host-provided
 * sink (trace events, stdout). Fallback + guest-run surface.
 */
export class ConsoleEscalator implements Escalator {
  constructor(
    private readonly sink: (kind: "escalation" | "text", payload: unknown) => void
  ) {}

  async sendEscalation(e: Escalation): Promise<void> {
    this.sink("escalation", e);
  }

  async sendText(text: string): Promise<void> {
    this.sink("text", text);
  }
}
