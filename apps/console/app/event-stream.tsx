"use client";

import { useEffect, useRef, useState } from "react";

interface Line {
  id: number;
  text: string;
}

export default function EventStream() {
  const [runId, setRunId] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const res = await fetch("/api/runs/latest", { cache: "no-store" });
        const data = (await res.json()) as { id: string | null };
        if (active && data.id) {
          setRunId((cur) => (cur === data.id ? cur : data.id));
        }
      } catch {
        // console up before first migration; keep waiting
      }
    };
    check();
    const interval = setInterval(check, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!runId) return;
    setLines([]);
    const source = new EventSource(`/api/runs/${runId}/events`);
    source.onmessage = (msg) => {
      const evt = JSON.parse(msg.data) as {
        id: number;
        at: string;
        body: unknown;
      };
      setLines((prev) => [
        ...prev,
        { id: evt.id, text: `${evt.at}  ${JSON.stringify(evt.body)}` },
      ]);
    };
    return () => source.close();
  }, [runId]);

  useEffect(() => {
    const el = boxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  return (
    <div
      ref={boxRef}
      className="mt-3 min-h-0 flex-1 overflow-auto font-mono text-[11px] leading-5 text-neutral-400"
    >
      {runId === null ? (
        <div className="text-neutral-700">NO RUN</div>
      ) : (
        lines.map((l) => (
          <div key={l.id} className="whitespace-pre-wrap break-all">
            {l.text}
          </div>
        ))
      )}
    </div>
  );
}
