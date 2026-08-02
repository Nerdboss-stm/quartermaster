/**
 * The machine trace, said out loud.
 *
 * The console shows the raw event stream because an operator wants it raw.
 * A person who has just told an agent to spend their money wants sentences.
 * Same events, same order, same timestamps — only the wording differs, and
 * nothing here invents a fact the event did not carry.
 *
 * Events with no line are deliberately silent: the feed should read like a
 * short story, not a log.
 */

export type Tone = "neutral" | "good" | "warn" | "bad" | "quiet";

export interface Narration {
  line: string;
  tone: Tone;
  /** Monospace detail shown under the line: amounts, ids, clause text. */
  detail?: string;
  /** The one event that deserves to stop the eye. */
  emphatic?: boolean;
}

type Body = Record<string, any>;

const usd = (cents: unknown) =>
  typeof cents === "number" ? `$${(cents / 100).toFixed(2)}` : "";

export function narrate(body: Body): Narration | null {
  switch (body.type as string) {
    case "need_declared":
      return {
        line: "Your agent picked up the request.",
        tone: "quiet",
        detail: `${body.need?.vramGb}GB · ${body.need?.durationH}h · up to ${usd(body.need?.maxPriceCents)}`,
      };

    case "registry_query": {
      const n = Array.isArray(body.matches) ? body.matches.length : 0;
      if (n === 0) {
        return {
          line: "Nobody is selling what you need right now.",
          tone: "warn",
          detail: "your agent keeps watching",
        };
      }
      const cheapest = body.matches[0];
      return {
        line: `Searched the market — ${n} seller${n === 1 ? "" : "s"} can do this.`,
        tone: "neutral",
        detail: `cheapest looks like ${usd(cheapest?.estimateCents)} from ${cheapest?.agentId}`,
      };
    }

    case "quote_requested":
      return { line: "Asked for a firm price.", tone: "quiet" };

    case "quote_received": {
      const amount = body.quote?.amountCents;
      return {
        line: `Quoted ${usd(amount)}.`,
        tone: "neutral",
        detail: body.quote?.pricingRule,
      };
    }

    case "quote_error":
      return {
        line: "That seller did not answer.",
        tone: "warn",
        detail: `status ${body.status}`,
      };

    case "requote_requested":
      return {
        line: "Too expensive — pushed back once.",
        tone: "neutral",
        detail: `asked for ${usd(body.targetCents)}`,
      };

    case "requote_response":
      return body.held
        ? {
            line: "The seller held their price.",
            tone: "warn",
            detail: body.note,
          }
        : {
            line: `They came down to ${usd(body.quote?.amountCents)}.`,
            tone: "good",
            detail: body.note,
          };

    case "requote_blocked":
      return {
        line: "No second haggle — one per request.",
        tone: "quiet",
        detail: body.reason,
      };

    case "eval_start":
      return {
        line: "Checking it against your policy, clause by clause.",
        tone: "quiet",
        detail: body.mandateId,
      };

    case "clause_result":
      return {
        line: body.ok ? "Passed" : "Failed",
        tone: body.ok ? "good" : "bad",
        detail: body.detail,
      };

    case "verdict":
      if (body.decision === "EXECUTE") {
        return { line: "Your policy allows this.", tone: "good", emphatic: true };
      }
      if (body.decision === "NEEDS_HUMAN") {
        return {
          line: "Outside your policy. Your agent stopped and is asking you.",
          tone: "warn",
          emphatic: true,
        };
      }
      return {
        line: "Refused. Nothing was bought and nobody was asked.",
        tone: "bad",
        emphatic: true,
      };

    case "escalation_requested":
      return {
        line: "Sent to you for a decision.",
        tone: "warn",
        detail: body.channel ? `via ${body.channel}` : undefined,
      };

    case "escalation_reply":
      return {
        line: "You answered.",
        tone: "neutral",
        detail: body.raw ? `“${String(body.raw).trim()}”` : undefined,
      };

    case "mandate_amended":
      return {
        line: `New policy signed — cap now ${usd(body.newCapCents)}.`,
        tone: "neutral",
        detail: `${body.oldId} superseded by ${body.newId}`,
      };

    case "owner_declined":
      return { line: "You declined. Nothing was bought.", tone: "bad" };

    case "route_selected":
      return {
        line: `Funding it from Envelope ${body.envelope}.`,
        tone: "neutral",
        detail: body.reason,
      };

    case "route_refused":
      return {
        line: "No envelope can fund this right now.",
        tone: "bad",
        detail: body.reason,
        emphatic: true,
      };

    case "charge_created":
      return {
        line: "The card network issued a one-time credential.",
        tone: "neutral",
        detail: `token ends ${body.tokenLast4} · ${usd(body.amountCents)} · ${body.environment}`,
      };

    case "charge_failed":
    case "charge_error":
      return {
        line: "The charge did not go through. Nothing was taken.",
        tone: "bad",
        detail: body.errorMessage ?? body.error,
      };

    case "charge_reported":
      return {
        line: "Reported back to the network.",
        tone: "quiet",
        detail: body.visaConfirmation
          ? `Visa confirmation ${body.visaConfirmation}`
          : body.status,
      };

    case "order_paid":
      return {
        line: "The seller took the payment.",
        tone: "good",
        detail: `order ${body.orderRef} · ${body.environment}`,
      };

    case "order_recorded":
      return {
        line: `${body.seller} sold this.`,
        tone: "good",
        detail: body.line,
      };

    case "order_failed":
    case "order_invalid":
      return { line: "The seller could not complete the order.", tone: "bad" };

    case "provisioning":
      return { line: body.line, tone: "quiet" };

    case "settlement_complete":
      return {
        line: body.autonomous
          ? `Bought for ${usd(body.amountCents)}, with nobody in the loop.`
          : `Bought for ${usd(body.amountCents)}.`,
        tone: "good",
        emphatic: true,
        detail: `Envelope ${body.envelope} · ${body.environment}`,
      };

    case "receipt_sent":
      return { line: "Receipt sent to you.", tone: "quiet", detail: body.text };

    case "run_error":
    case "match_failed":
      return {
        line: "Something went wrong. Nothing was charged.",
        tone: "bad",
        detail: body.error,
      };

    // Deliberately silent: internal bookkeeping, or already said better by
    // a neighbouring event.
    case "system_error":
    case "clause_start":
    case "verdict_full":
    case "agent_final":
    case "receipt_send_failed":
    case "escalation_send_failed":
      return null;

    default:
      return null;
  }
}
