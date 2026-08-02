"use client";

import { gapLabel } from "./fmt";
import type { ConsoleState } from "./types";

/**
 * The cascade. Clause rows in evaluation order, top down. Color appears
 * only on resolution; on a refusal every passing row drops to low
 * contrast and the failing row is the only colored element on screen.
 */
export default function MandatePanel({ state }: { state: ConsoleState }) {
  const v = state.verdict;
  const halted = v !== null && v.decision !== "EXECUTE";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden pt-3">
      {state.evalMandateId ? (
        <div className="font-mono text-[10px] tracking-wider text-neutral-600">
          EVALUATING AGAINST {state.evalMandateId}
        </div>
      ) : null}

      <div className="mt-1 min-h-0 flex-1 overflow-auto">
        {state.cascade.length === 0 ? (
          <div className="font-mono text-[11px] text-neutral-700">
            AWAITING EVALUATION
          </div>
        ) : (
          state.cascade.map((row) => {
            const failed = row.ok === false;
            const passed = row.ok === true;
            const color = failed
              ? row.onFail === "escalate"
                ? "text-amber-400"
                : "text-red-500"
              : passed && !halted
                ? row.kind === "route"
                  ? "text-emerald-400"
                  : "text-neutral-300"
                : "text-neutral-600";
            return (
              <div
                key={row.key}
                className={`border-l-2 py-1 pl-3 ${
                  failed && row.determining
                    ? row.onFail === "escalate"
                      ? "border-amber-400"
                      : "border-red-500"
                    : "border-neutral-800"
                } ${halted && !failed ? "opacity-50" : ""}`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span
                    className={`font-mono text-[11px] tracking-wide ${
                      failed ? color : halted ? "text-neutral-600" : "text-neutral-500"
                    }`}
                  >
                    {row.path}
                  </span>
                  <span className="font-mono text-[10px] tabular-nums text-neutral-600">
                    {row.ok === null
                      ? "…"
                      : `${row.elapsedMs !== null ? `${row.elapsedMs}ms` : ""} ${
                          row.ok ? "PASS" : row.onFail === "escalate" ? "FAIL·ESCALATE" : "FAIL"
                        }`}
                  </span>
                </div>
                <div className={`font-mono text-[12px] leading-5 ${color}`}>
                  {row.detail || row.label}
                </div>
              </div>
            );
          })
        )}
        {state.lastGapMs !== null && state.lastGapMs > 5000 ? (
          <div className="py-1 pl-3 font-mono text-[10px] text-neutral-700">
            — {gapLabel(state.lastGapMs)} elapsed —
          </div>
        ) : null}
      </div>

      {v ? (
        <div
          className={`mt-2 border px-3 py-2 ${
            v.decision === "EXECUTE"
              ? "border-emerald-400 text-emerald-400"
              : v.decision === "NEEDS_HUMAN"
                ? "border-amber-400 text-amber-400"
                : "border-red-500 text-red-500"
          }`}
        >
          <div className="font-mono text-xl font-bold uppercase tracking-[0.3em]">
            {v.decision === "NEEDS_HUMAN" ? "NEEDS HUMAN" : v.decision}
          </div>
          {v.decision !== "EXECUTE" ? (
            <div className="mt-1 font-mono text-[11px] leading-4">
              {state.cascade
                .filter((r) => r.determining)
                .map((r) => r.detail)
                .join(" · ")}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
