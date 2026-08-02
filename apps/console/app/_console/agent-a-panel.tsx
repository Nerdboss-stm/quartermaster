"use client";

import ApprovalStrip from "../approval-strip";
import { ts, usd } from "./fmt";
import type { ConsoleState } from "./types";

/** Buyer side: the job that broke, the need, the agent's narration, the
 *  negotiation ask, and the REAL iMessage transcript as the webhook lands. */
export default function AgentAPanel({
  state,
  dimmed,
}: {
  state: ConsoleState;
  dimmed: boolean;
}) {
  return (
    <div
      className={`flex min-h-0 flex-1 flex-col gap-3 overflow-auto pt-3 transition-opacity duration-500 ${dimmed ? "opacity-40" : ""}`}
    >
      {state.jobLog.length > 0 ? (
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-600">
            job log
          </div>
          {state.jobLog.map((l, i) => (
            <div key={i} className="mt-1 font-mono text-[11px] leading-4 text-red-500">
              <span className="text-neutral-600">{ts(l.at)} {l.source} </span>
              {l.line}
            </div>
          ))}
        </div>
      ) : (
        <div className="font-mono text-[11px] text-neutral-700">JOB RUNNING…</div>
      )}

      {state.need ? (
        <div className="font-mono text-[11px] text-neutral-400">
          <span className="text-neutral-600">NEED </span>
          {String(state.need.vramGb)}GB VRAM · {String(state.need.durationH)}h ·
          budget {usd(Number(state.need.maxPriceCents))}
        </div>
      ) : null}

      {state.registry.length > 0 ? (
        <div className="font-mono text-[11px] text-neutral-400">
          <span className="text-neutral-600">REGISTRY </span>
          {state.registry.map(
            (m) =>
              `${m.offerId} (${m.agentId}) est ${usd(m.estimateCents)}${m.withinBudget ? "" : " OVER BUDGET"}`
          ).join(" · ")}
        </div>
      ) : null}

      {state.requoteAsk ? (
        <div className="border-l-2 border-neutral-700 pl-2 font-mono text-[11px] text-neutral-300">
          <span className="text-neutral-600">{ts(state.requoteAsk.at)} </span>
          asks agent_b for better: target {usd(state.requoteAsk.targetCents)}
        </div>
      ) : null}

      {state.narration.map((n, i) => (
        <div key={i} className="font-mono text-[11px] leading-4 text-neutral-500">
          <span className="text-neutral-700">{ts(n.at)} </span>
          {n.text}
        </div>
      ))}

      {state.imessage.sent ? (
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-600">
            iMessage · {state.imessage.sent.channel}
          </div>
          <div className="mt-1 max-w-[85%] border border-neutral-700 px-2 py-1 font-mono text-[11px] leading-4 text-neutral-300">
            {state.imessage.sent.text}
            <div className="mt-0.5 text-[9px] text-neutral-600">
              {ts(state.imessage.sent.at)} → owner
            </div>
          </div>
          {state.imessage.reply ? (
            <div className="ml-auto mt-1 max-w-[85%] border border-amber-400 px-2 py-1 text-right font-mono text-[11px] leading-4 text-amber-400">
              {state.imessage.reply.raw}
              <div className="mt-0.5 text-[9px] text-neutral-600">
                {ts(state.imessage.reply.at)} · owner · via{" "}
                {state.imessage.reply.source}
              </div>
            </div>
          ) : (
            <div className="mt-1 font-mono text-[10px] text-neutral-600">
              awaiting owner reply…
            </div>
          )}
        </div>
      ) : null}

      <ApprovalStrip />
    </div>
  );
}
