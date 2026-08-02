import type {
  CascadeRow,
  ConsoleState,
  Decision,
  QuoteView,
  TraceEnvelope,
} from "./types";

const CLAUSE_LABEL: Record<string, string> = {
  implicit_expiry: "MANDATE VALIDITY",
  implicit_currency: "CURRENCY MATCH",
  counterparty_allowlist: "COUNTERPARTY ALLOWLIST",
  attribute: "ATTRIBUTE",
  amount_cap: "PER-CHARGE CAP",
  cumulative_cap: "CUMULATIVE CAP",
  valid_window: "VALID WINDOW",
};

function label(kind: string): string {
  return CLAUSE_LABEL[kind] ?? kind.replace(/_/g, " ").toUpperCase();
}

/**
 * One reducer for both live SSE and stored replay: identical inputs produce
 * identical screens, which is what makes ?replay= trustworthy evidence.
 */
export function apply(state: ConsoleState, env: TraceEnvelope): ConsoleState {
  const b = env.body as Record<string, any>;
  const at = env.at;
  const next: ConsoleState = { ...state, lastGapMs: env.gapMs ?? null };

  switch (b.type as string) {
    case "system_error":
      next.jobLog = [
        ...state.jobLog,
        { at, line: String(b.line), source: String(b.source ?? "agent_a") },
      ];
      return next;

    case "need_declared":
      next.need = b.need as Record<string, unknown>;
      return next;

    case "registry_query":
      next.registry = (b.matches ?? []) as ConsoleState["registry"];
      return next;

    case "quote_requested":
      next.narration = [
        ...state.narration,
        { at, text: `requesting firm quote from ${b.offerId}` },
      ];
      return next;

    case "quote_received":
      next.quote = b.quote as QuoteView;
      return next;

    case "requote_requested":
      next.requoteAsk = { targetCents: Number(b.targetCents), at };
      return next;

    case "requote_response": {
      const q = b.quote as QuoteView;
      next.quote = q;
      next.requoteAnswer = {
        amountCents: q.amountCents,
        held: b.held === true,
        note: q.note ?? (b.note as string | undefined),
        at,
      };
      return next;
    }

    case "eval_start":
      // A fresh evaluation (including the post-amendment re-run) clears
      // the cascade: the screen never mixes two verdicts.
      next.cascade = [];
      next.verdict = null;
      next.evalMandateId = String(b.mandateId);
      return next;

    case "clause_start":
      next.cascade = [
        ...state.cascade,
        {
          key: `${b.path}:${env.id}`,
          kind: "clause",
          path: String(b.path),
          label: label(String(b.kind)),
          detail: "",
          ok: null,
          elapsedMs: null,
          onFail: null,
          determining: false,
        },
      ];
      return next;

    case "clause_result": {
      const rows = [...state.cascade];
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i].path === b.path && rows[i].ok === null) {
          rows[i] = {
            ...rows[i],
            detail: String(b.detail),
            ok: b.ok === true,
            elapsedMs: Number(b.elapsedMs ?? 0),
            onFail: (b.onFail as string) ?? null,
          };
          break;
        }
      }
      next.cascade = rows;
      return next;
    }

    case "verdict": {
      const paths = (b.determinedByPaths ?? []) as string[];
      next.verdict = {
        decision: b.decision as Decision,
        at,
        determinedByPaths: paths,
      };
      next.cascade = state.cascade.map((r) =>
        paths.includes(r.path) ? { ...r, determining: true } : r
      );
      return next;
    }

    case "verdict_full": {
      // Carries onFail for rows the trace stream did not label.
      const results = (b.verdict?.results ?? []) as {
        path: string;
        onFail: string;
      }[];
      next.cascade = state.cascade.map((r) => {
        const hit = results.find((x) => x.path === r.path);
        return hit && !r.onFail ? { ...r, onFail: hit.onFail } : r;
      });
      return next;
    }

    case "route_selected":
      next.cascade = [
        ...state.cascade,
        {
          key: `route:${env.id}`,
          kind: "route",
          path: `ROUTE -> ENVELOPE ${b.envelope}`,
          label: "ROUTING",
          detail: String(b.reason),
          ok: true,
          elapsedMs: null,
          onFail: null,
          determining: false,
        },
      ];
      return next;

    case "route_refused":
      next.cascade = [
        ...state.cascade,
        {
          key: `route:${env.id}`,
          kind: "route",
          path: "ROUTE REFUSED",
          label: "ROUTING",
          detail: String(b.reason),
          ok: false,
          elapsedMs: null,
          onFail: "refuse",
          determining: true,
        },
      ];
      next.verdict = {
        decision: "REFUSE",
        at,
        determinedByPaths: ["ROUTE REFUSED"],
      };
      return next;

    case "escalation_requested":
      next.imessage = {
        ...state.imessage,
        sent: {
          text: String(b.text ?? `blocked: ${b.failingDetail}`),
          at,
          channel: String(b.channel ?? "linq"),
        },
      };
      return next;

    case "escalation_reply":
      next.imessage = {
        ...state.imessage,
        reply: {
          raw: String(b.raw),
          at,
          action: (b.parsed?.action as string) ?? null,
          source: String(b.source ?? "linq"),
        },
      };
      return next;

    case "mandate_amended":
      next.amendment = {
        oldId: String(b.oldId),
        newId: String(b.newId),
        newCapCents: Number(b.newCapCents),
        clausePath: String(b.clausePath),
      };
      return next;

    case "charge_created":
      next.charge = {
        transactionId: String(b.transactionId),
        pravaMandateId: String(b.pravaMandateId),
        tokenLast4: String(b.tokenLast4),
        environment: String(b.environment),
      };
      next.environment = String(b.environment);
      return next;

    case "order_paid":
      next.order = {
        orderRef: String(b.orderRef),
        environment: String(b.environment),
      };
      return next;

    case "provisioning":
      next.provisioning = [...state.provisioning, { at, line: String(b.line) }];
      return next;

    case "charge_reported":
      next.report = {
        status: String(b.status),
        visaConfirmation: String(b.visaConfirmation),
        mandateStatus: (b.mandateStatus as string) ?? null,
      };
      return next;

    case "settlement_complete":
      next.settlements = [
        ...state.settlements,
        {
          envelope: String(b.envelope),
          amountCents: Number(b.amountCents),
          merchantRef: String(b.merchantRef),
          autonomous: b.autonomous === true,
          environment: String(b.environment),
        },
      ];
      next.environment = String(b.environment);
      return next;

    case "agent_final":
      next.narration = [...state.narration, { at, text: String(b.text) }];
      return next;

    case "charge_failed":
    case "charge_error":
    case "order_failed":
    case "order_invalid":
      next.narration = [
        ...state.narration,
        {
          at,
          text: `SETTLEMENT HALTED: ${b.errorCode ?? ""} ${b.errorMessage ?? b.error ?? ""}`.trim(),
        },
      ];
      return next;

    case "owner_declined":
      next.narration = [
        ...state.narration,
        { at, text: "owner DECLINED. The money never moves." },
      ];
      return next;

    default:
      return next;
  }
}

/** Sound cue for an event, or null. Kept beside the reducer so the
 *  audio track and the visual track can never drift apart. */
export function cueFor(env: TraceEnvelope): string | null {
  const b = env.body as Record<string, any>;
  switch (b.type as string) {
    case "clause_result":
      return b.ok === true ? "click" : "thud";
    case "route_selected":
      return "tick";
    case "route_refused":
      return "thud";
    case "settlement_complete":
      return b.autonomous === true ? "toneAutonomous" : "tone";
    default:
      return null;
  }
}

export function replayReduce(events: TraceEnvelope[], base: ConsoleState): ConsoleState {
  return events.reduce(apply, base);
}
