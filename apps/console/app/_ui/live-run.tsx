"use client";

import { useEffect, useRef, useState } from "react";
import { narrate, type Narration } from "@/lib/narrate";

interface Line extends Narration {
  id: number;
  at: string;
}

const TONE: Record<Narration["tone"], string> = {
  neutral: "text-neutral-200",
  good: "text-emerald-400",
  warn: "text-amber-400",
  bad: "text-red-400",
  quiet: "text-neutral-500",
};

const RULE: Record<Narration["tone"], string> = {
  neutral: "bg-neutral-700",
  good: "bg-emerald-500",
  warn: "bg-amber-400",
  bad: "bg-red-500",
  quiet: "bg-neutral-800",
};

/**
 * Watching your agent spend your money.
 *
 * Polls the same cursor endpoint the console uses and says each event in
 * plain language as it lands. Nothing is animated for effect: a line
 * appears when the thing it describes actually happened, at the millisecond
 * it happened.
 */
export default function LiveRun({
  runId,
  done,
}: {
  runId: string;
  done: boolean;
}) {
  const [lines, setLines] = useState<Line[]>([]);
  const cursor = useRef(0);
  const box = useRef<HTMLDivElement | null>(null);
  const stopped = useRef(false);

  useEffect(() => {
    stopped.current = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      try {
        const res = await fetch(`/api/runs/${runId}/trace?after=${cursor.current}`);
        if (res.ok) {
          const json = (await res.json()) as {
            events: { id: number; at: string; body: Record<string, unknown> }[];
          };
          const fresh: Line[] = [];
          for (const e of json.events) {
            cursor.current = Math.max(cursor.current, e.id);
            const said = narrate(e.body);
            if (said) fresh.push({ ...said, id: e.id, at: e.at });
          }
          // Two polls can overlap — React remounts effects in development,
          // and a slow request can land after a fast one. The event id is
          // the only thing that decides whether a line is already on screen.
          if (fresh.length > 0) {
            setLines((prev) => {
              const seen = new Set(prev.map((l) => l.id));
              const add = fresh.filter((l) => !seen.has(l.id));
              return add.length > 0 ? [...prev, ...add] : prev;
            });
          }
        }
      } catch {
        // A dropped poll is not an error worth showing; the next one catches up.
      }
      if (!stopped.current) timer = setTimeout(tick, 900);
    };

    void tick();
    return () => {
      stopped.current = true;
      clearTimeout(timer);
    };
  }, [runId]);

  // Stop polling once the caller says the run reached a terminal state, but
  // only after one last sweep so the closing lines are never cut off.
  useEffect(() => {
    if (!done) return;
    const last = setTimeout(() => {
      stopped.current = true;
    }, 2500);
    return () => clearTimeout(last);
  }, [done]);

  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight, behavior: "smooth" });
  }, [lines.length]);

  return (
    <div
      ref={box}
      className="max-h-[26rem] overflow-y-auto border border-neutral-900 bg-black p-4"
    >
      {lines.length === 0 ? (
        <p className="font-mono text-[11px] text-neutral-600">
          waiting for your agent…
        </p>
      ) : (
        <ol className="flex flex-col">
          {lines.map((l) => (
            <li key={l.id} className="flex gap-3 py-1.5">
              <span className={`mt-[7px] h-[3px] w-3 shrink-0 ${RULE[l.tone]}`} />
              <span className="min-w-0">
                <span
                  className={`font-sans ${l.emphatic ? "text-[15px]" : "text-[13px]"} ${TONE[l.tone]}`}
                >
                  {l.line}
                </span>
                {l.detail ? (
                  <span className="block font-mono text-[10px] leading-relaxed text-neutral-600">
                    {l.detail}
                  </span>
                ) : null}
              </span>
              <time
                dateTime={l.at}
                className="ml-auto shrink-0 font-mono text-[9px] tabular-nums text-neutral-700"
              >
                {stamp(l.at)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function stamp(at: string): string {
  const d = new Date(at);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}
