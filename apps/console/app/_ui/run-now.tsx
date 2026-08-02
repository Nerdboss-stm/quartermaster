"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** For when the owner does not feel like waiting for a trigger. */
export default function RunNow({ needId }: { needId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/needs/${needId}/run`, { method: "POST" });
      const json = (await res.json()) as {
        claimed?: boolean;
        detail?: string;
        outcome?: { state: string; detail?: string };
      };
      setNote(
        json.claimed === false
          ? (json.detail ?? "already running")
          : (json.outcome?.state ?? "done")
      );
      router.refresh();
    } catch {
      setNote("could not reach the server");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="flex items-center justify-end gap-2">
      {note ? (
        <span className="font-mono text-[10px] text-neutral-500">{note}</span>
      ) : null}
      <button
        onClick={run}
        disabled={busy}
        className="border border-neutral-700 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.2em] text-neutral-400 hover:border-neutral-500 hover:text-neutral-200 disabled:opacity-40"
      >
        {busy ? "…" : "Try now"}
      </button>
    </span>
  );
}
