import { escalationText } from "./parse";
import type { Escalation, Escalator } from "./types";

const LINQ_BASE = "https://api.linqapp.com/api/partner/v3";

export interface LinqConfig {
  apiKey: string;
  fromNumber: string;
  toNumber: string;
}

export class LinqEscalator implements Escalator {
  constructor(private readonly cfg: LinqConfig) {}

  private async send(text: string): Promise<void> {
    const res = await fetch(`${LINQ_BASE}/chats`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.cfg.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: this.cfg.fromNumber,
        to: [this.cfg.toNumber],
        message: { parts: [{ type: "text", value: text }] },
      }),
    });
    if (!res.ok) {
      throw new Error(`linq send failed: ${res.status}`);
    }
  }

  sendEscalation(e: Escalation): Promise<void> {
    return this.send(escalationText(e));
  }

  sendText(text: string): Promise<void> {
    return this.send(text);
  }
}
