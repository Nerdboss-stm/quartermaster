"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { play } from "./sound";

export interface Step {
  id: string;
  beat: string;
  label: string;
  /** Resolves when the pipeline step (and any human touch) completes. */
  action: () => Promise<void>;
}

type StepState = "idle" | "running" | "done" | "failed";

/**
 * Keys arm beats; Space runs the armed one; R resets the take (view
 * only, the append-only record is untouched). The three human touches
 * are pipeline waits, not keypresses: the passkeys and the reply happen
 * on the owner's devices and the step resolves when they land.
 */
export default function Controller({
  steps,
  muted,
  onToggleMute,
  onReset,
  replayId,
  armed = true,
}: {
  steps: Step[];
  muted: boolean;
  onToggleMute: () => void;
  onReset: () => void;
  replayId: string | null;
  /** Whether this browser holds the operator token. */
  armed?: boolean;
}) {
  const [armedIndex, setArmed] = useState(0);
  const [states, setStates] = useState<Record<string, StepState>>({});
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const runStep = useCallback(
    async (index: number) => {
      const step = steps[index];
      if (!step || busy.current) return;
      busy.current = true;
      setError(null);
      setStates((s) => ({ ...s, [step.id]: "running" }));
      try {
        await step.action();
        setStates((s) => ({ ...s, [step.id]: "done" }));
        setArmed((a) => Math.min(a + 1, steps.length - 1));
      } catch (err) {
        setStates((s) => ({ ...s, [step.id]: "failed" }));
        setError(err instanceof Error ? err.message : String(err));
        play("thud");
      } finally {
        busy.current = false;
      }
    },
    [steps]
  );

  useEffect(() => {
    if (replayId) return; // replay is hands-off
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === "Space") {
        e.preventDefault();
        void runStep(armedIndex);
      } else if (e.key === "ArrowRight") {
        setArmed((a) => Math.min(a + 1, steps.length - 1));
      } else if (e.key === "ArrowLeft") {
        setArmed((a) => Math.max(a - 1, 0));
      } else if (e.key === "r" || e.key === "R") {
        setStates({});
        setArmed(0);
        setError(null);
        onReset();
      } else if (e.key === "m" || e.key === "M") {
        onToggleMute();
      } else if (/^[1-9]$/.test(e.key)) {
        const idx = Number(e.key) - 1;
        if (idx < steps.length) setArmed(idx);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [armedIndex, onReset, onToggleMute, replayId, runStep, steps.length]);

  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-neutral-800 pt-1 font-mono text-[9px]">
      {replayId ? (
        <span className="border border-neutral-600 px-1 tracking-widest text-neutral-300">
          REPLAY {replayId}
        </span>
      ) : (
        <>
          {steps.map((s, i) => {
            const st = states[s.id] ?? "idle";
            return (
              <span
                key={s.id}
                className={`border px-1 py-0.5 tracking-wider ${
                  i === armedIndex
                    ? "border-neutral-300 text-neutral-200"
                    : st === "done"
                      ? "border-neutral-800 text-emerald-400"
                      : st === "failed"
                        ? "border-red-500 text-red-500"
                        : st === "running"
                          ? "border-amber-400 text-amber-400"
                          : "border-neutral-800 text-neutral-600"
                }`}
                title={s.label}
              >
                {s.beat}
                {st === "running" ? "…" : ""}
              </span>
            );
          })}
          <span className="ml-1 text-neutral-600">
            {steps[armedIndex]?.label} · SPACE run · ←→ arm · R reset · M mute
          </span>
          {armed ? null : (
            <span className="border border-amber-400 px-1 uppercase tracking-widest text-amber-400">
              read only · no operator token
            </span>
          )}
        </>
      )}
      {error ? <span className="text-red-500">{error}</span> : null}
      <button
        onClick={onToggleMute}
        className="ml-auto border border-neutral-700 px-1.5 py-0.5 uppercase tracking-widest text-neutral-500 hover:text-neutral-300"
      >
        {muted ? "unmute" : "mute"}
      </button>
    </div>
  );
}
