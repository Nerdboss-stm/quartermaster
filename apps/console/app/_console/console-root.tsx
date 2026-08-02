"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AgentAPanel from "./agent-a-panel";
import AgentBPanel from "./agent-b-panel";
import Controller, { type Step } from "./controller";
import LedgerRail from "./ledger-rail";
import LocksRail, { type PortfolioData } from "./locks-rail";
import MandatePanel from "./mandate-panel";
import { apply, cueFor } from "./reducer";
import { isMuted, play, setMuted, type Cue } from "./sound";
import {
  initialState,
  type ConsoleState,
  type LedgerRow,
  type TraceEnvelope,
} from "./types";

/** Replay compresses dead air beyond this, with an on-screen elapsed
 *  marker: recorded pace, honestly annotated, never invented. */
const REPLAY_GAP_CAP_MS = 4000;

async function demo(action: string, extra: Record<string, unknown> = {}) {
  const res = await fetch("/api/demo", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, ...extra }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `${action} failed`);
  return data;
}

export default function ConsoleRoot({ replayId }: { replayId: string | null }) {
  const [state, setState] = useState<ConsoleState>(initialState);
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [muted, setMutedState] = useState(false);
  const [runId, setRunId] = useState<string | null>(replayId);
  const seenIds = useRef(new Set<number>());
  const replayTimers = useRef<number[]>([]);

  const feed = useCallback((env: TraceEnvelope) => {
    if (seenIds.current.has(env.id)) return;
    seenIds.current.add(env.id);
    setState((s) => apply(s, env));
    const cue = cueFor(env);
    if (cue) play(cue as Cue);
  }, []);

  const refreshSide = useCallback(async () => {
    try {
      const [p, l] = await Promise.all([
        fetch("/api/portfolio", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/ledger", { cache: "no-store" }).then((r) => r.json()),
      ]);
      if (p && !p.error) setPortfolio(p as PortfolioData);
      if (l?.rows) setLedger(l.rows as LedgerRow[]);
    } catch {
      // console up before first migration
    }
  }, []);

  const resetView = useCallback(() => {
    seenIds.current = new Set();
    for (const t of replayTimers.current) window.clearTimeout(t);
    replayTimers.current = [];
    setState(initialState);
  }, []);

  // Live: follow the newest run over SSE. Replay: schedule the stored
  // trace at recorded timing. Same reducer either way.
  useEffect(() => {
    if (replayId) {
      let cancelled = false;
      void (async () => {
        const res = await fetch(`/api/runs/${replayId}/trace`, { cache: "no-store" });
        const data = (await res.json()) as { events?: TraceEnvelope[] };
        if (cancelled || !data.events || data.events.length === 0) return;
        const t0 = Date.parse(data.events[0].at);
        let offset = 0;
        let prev = t0;
        for (const evt of data.events) {
          const t = Date.parse(evt.at);
          const gap = t - prev;
          const capped = Math.min(gap, REPLAY_GAP_CAP_MS);
          offset += capped;
          prev = t;
          const withGap: TraceEnvelope =
            gap > REPLAY_GAP_CAP_MS ? { ...evt, gapMs: gap } : evt;
          replayTimers.current.push(
            window.setTimeout(() => feed(withGap), offset)
          );
        }
      })();
      return () => {
        cancelled = true;
        for (const t of replayTimers.current) window.clearTimeout(t);
      };
    }

    let source: EventSource | null = null;
    let active = true;
    let current: string | null = null;
    const follow = async () => {
      try {
        const res = await fetch("/api/runs/latest", { cache: "no-store" });
        const data = (await res.json()) as { id: string | null };
        if (!active || !data.id || data.id === current) return;
        current = data.id;
        setRunId(data.id);
        resetView();
        source?.close();
        source = new EventSource(`/api/runs/${data.id}/events`);
        source.onmessage = (msg) => feed(JSON.parse(msg.data) as TraceEnvelope);
      } catch {
        // not migrated yet
      }
    };
    void follow();
    const interval = setInterval(follow, 2000);
    return () => {
      active = false;
      clearInterval(interval);
      source?.close();
    };
  }, [feed, replayId, resetView]);

  useEffect(() => {
    void refreshSide();
    const interval = setInterval(refreshSide, 3000);
    return () => clearInterval(interval);
  }, [refreshSide]);

  const toggleMute = useCallback(() => {
    setMuted(!isMuted());
    setMutedState(isMuted());
  }, []);

  const steps: Step[] = [
    {
      id: "envA",
      beat: "1A",
      label: "BEAT 1 · ENVELOPE A PASSKEY",
      action: async () => {
        const { approvalUrl } = await demo("envelopeSession", { label: "A" });
        window.open(approvalUrl, "_blank", "noopener");
        await demo("envelopeAwait", { label: "A" });
        play("chime");
        await refreshSide();
      },
    },
    {
      id: "envB",
      beat: "1B",
      label: "BEAT 1 · ENVELOPE B PASSKEY",
      action: async () => {
        const { approvalUrl } = await demo("envelopeSession", { label: "B" });
        window.open(approvalUrl, "_blank", "noopener");
        await demo("envelopeAwait", { label: "B" });
        play("chime");
        await refreshSide();
      },
    },
    {
      id: "run",
      beat: "2-7",
      label: "BEATS 2-7 · WALL → QUOTE → REFUSE → ESCALATE",
      action: async () => {
        await demo("run");
      },
    },
    {
      id: "reply",
      beat: "8a",
      label: "BEAT 8 · AWAIT OWNER iMESSAGE REPLY",
      action: async () => {
        for (let i = 0; i < 300; i++) {
          const { reply } = await demo("replyStatus");
          if (reply) return;
          await new Promise((r) => setTimeout(r, 2000));
        }
        throw new Error("no reply within 10 minutes");
      },
    },
    {
      id: "amend",
      beat: "8b",
      label: "BEAT 8 · AMEND + RE-EVALUATE",
      action: async () => {
        await demo("amend");
      },
    },
    {
      id: "settle",
      beat: "9",
      label: "BEAT 9-10 · SETTLE ON ENVELOPE A",
      action: async () => {
        await demo("settle");
        await refreshSide();
      },
    },
    {
      id: "second",
      beat: "11",
      label: "BEAT 11 · SECOND NEED, ZERO TOUCHES",
      action: async () => {
        await demo("second");
        await refreshSide();
      },
    },
    {
      id: "bundle",
      beat: "12",
      label: "BEAT 12 · EXPORT AUDIT BUNDLE",
      action: async () => {
        if (runId) window.location.href = `/api/runs/${runId}/bundle.json`;
      },
    },
  ];

  const v = state.verdict;
  const refused = v !== null && v.decision !== "EXECUTE";
  const ground = refused
    ? v.decision === "REFUSE"
      ? "#120606"
      : "#131006"
    : "#0a0a0a";

  return (
    <main
      className="grid h-dvh grid-cols-[1fr_1.2fr_1fr] grid-rows-[minmax(0,1fr)_190px] overflow-hidden transition-colors duration-700"
      style={{ backgroundColor: ground }}
    >
      <section className="flex min-h-0 flex-col border-r border-neutral-800 px-4 py-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-neutral-600">
          AGENT A · BUYER
        </span>
        <AgentAPanel state={state} dimmed={refused} />
      </section>

      <section className="flex min-h-0 flex-col border-r border-neutral-800 px-4 py-3">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-neutral-600">
            MANDATE
          </span>
          <span className="border border-neutral-600 px-1 font-mono text-[9px] tracking-widest text-neutral-400">
            {state.environment}
          </span>
        </div>
        <LocksRail state={state} portfolio={portfolio} />
        <MandatePanel state={state} />
      </section>

      <section className="flex min-h-0 flex-col px-4 py-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-neutral-600">
          AGENT B · MERCHANT
        </span>
        <AgentBPanel state={state} dimmed={refused} />
      </section>

      <section className="col-span-3 flex min-h-0 flex-col border-t border-neutral-800 px-4 py-2">
        <LedgerRail
          rows={ledger}
          runId={runId}
          onExport={() => {
            if (runId) window.location.href = `/api/runs/${runId}/bundle.json`;
          }}
        />
        <Controller
          steps={steps}
          muted={muted}
          onToggleMute={toggleMute}
          onReset={resetView}
          replayId={replayId}
        />
      </section>
    </main>
  );
}
