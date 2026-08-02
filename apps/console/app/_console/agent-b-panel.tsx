"use client";

import { ts, usd } from "./fmt";
import type { ConsoleState } from "./types";

/** Seller side: the quote with its printed rounding rule, the requote
 *  moment, order state, and the merchant's own provisioning stream. */
export default function AgentBPanel({
  state,
  dimmed,
}: {
  state: ConsoleState;
  dimmed: boolean;
}) {
  const q = state.quote;
  return (
    <div
      className={`flex min-h-0 flex-1 flex-col gap-3 overflow-auto pt-3 transition-opacity duration-500 ${dimmed ? "opacity-40" : ""}`}
    >
      {q ? (
        <div className="border border-neutral-800 px-3 py-2">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-600">
              quote {q.id}
            </span>
            <span className="font-mono text-lg tabular-nums text-neutral-200">
              {usd(q.amountCents)}
            </span>
          </div>
          <div className="mt-1 font-mono text-[11px] text-neutral-400">
            {String(q.attributes.gpu)} · {String(q.attributes.vram_gb)}GB ·{" "}
            {String(q.attributes.duration_h)}h
          </div>
          {q.pricingRule ? (
            <div className="mt-1 font-mono text-[10px] text-neutral-600">
              {q.pricingRule}
            </div>
          ) : null}
          {state.requoteAnswer ? (
            <div
              className={`mt-2 border-t border-neutral-800 pt-1 font-mono text-[11px] ${
                state.requoteAnswer.held ? "text-neutral-400" : "text-emerald-400"
              }`}
            >
              <span className="text-neutral-600">
                {ts(state.requoteAnswer.at)}{" "}
              </span>
              {state.requoteAnswer.held
                ? `HOLDS at ${usd(state.requoteAnswer.amountCents)}`
                : `drops to ${usd(state.requoteAnswer.amountCents)}`}
              {state.requoteAnswer.note ? (
                <span className="text-neutral-600"> · {state.requoteAnswer.note}</span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="font-mono text-[11px] text-neutral-700">NO QUOTE YET</div>
      )}

      {state.order ? (
        <div className="font-mono text-[11px] text-neutral-300">
          <span className="text-neutral-600">ORDER </span>
          {state.order.orderRef}{" "}
          <span className="text-emerald-400">PAID</span>{" "}
          <span className="border border-neutral-600 px-1 text-[9px] tracking-widest text-neutral-400">
            {state.order.environment}
          </span>
        </div>
      ) : null}

      {state.provisioning.length > 0 ? (
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-600">
            provisioning
          </div>
          {state.provisioning.map((p, i) => (
            <div key={i} className="mt-0.5 font-mono text-[11px] leading-4 text-neutral-400">
              <span className="text-neutral-700">{ts(p.at)} </span>
              {p.line}
            </div>
          ))}
        </div>
      ) : null}

      {state.charge ? (
        <div className="mt-auto border-t border-neutral-800 pt-2 font-mono text-[10px] leading-4 text-neutral-600">
          credential card ····{state.charge.tokenLast4} · txn{" "}
          <span className="text-neutral-500">{state.charge.transactionId}</span>
          {state.report ? (
            <>
              {" "}· reported {state.report.status} · visa{" "}
              <span
                className={
                  state.report.visaConfirmation === "SUCCESS"
                    ? "text-emerald-400"
                    : "text-red-500"
                }
              >
                {state.report.visaConfirmation}
              </span>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
