"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Pending {
  runId: string;
  failingDetail: string;
  quoteId: string;
}

/**
 * The desk version of the text message. Same strict parser, same
 * continuation — replying here does exactly what replying by iMessage
 * does, so a demo never depends on a phone being in frame.
 */
export default function ApprovalPanel({ pending }: { pending: Pending }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [cap, setCap] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const reply = async (raw: string) => {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/escalations/reply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ raw }),
      });
      const json = (await res.json()) as {
        correction?: string | null;
        error?: string;
        continuation?: { status: string; detail: string };
      };
      if (json.error) {
        setNote(json.error);
      } else if (json.correction) {
        setNote(json.correction);
      } else if (json.continuation) {
        setResult(
          json.continuation.status === "settled"
            ? `Done — ${json.continuation.detail}`
            : `${json.continuation.status}: ${json.continuation.detail}`
        );
      }
      router.refresh();
    } catch {
      setNote("could not reach the server");
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <p className="font-sans text-[13px] text-emerald-400">{result}</p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="border-l-2 border-amber-500 pl-3 font-mono text-[12px] text-amber-300">
        {pending.failingDetail}
      </p>
      <p className="font-sans text-[13px] leading-relaxed text-neutral-400">
        Your agent stopped here because your policy said no. Approving raises
        the limit as a new signed policy — the old one is superseded, never
        edited.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          disabled={busy}
          onClick={() => reply("APPROVE")}
          className="border border-emerald-600 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-400 hover:bg-emerald-950 disabled:opacity-40"
        >
          Approve
        </button>
        <button
          disabled={busy}
          onClick={() => reply("DECLINE")}
          className="border border-neutral-700 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-400 hover:border-neutral-500 disabled:opacity-40"
        >
          Decline
        </button>
        <span className="flex items-center gap-1.5">
          <span className="font-mono text-[11px] text-neutral-600">
            or raise to $
          </span>
          <input
            value={cap}
            onChange={(e) => setCap(e.target.value)}
            placeholder="54"
            className="w-20 border border-neutral-800 bg-transparent px-2 py-1.5 font-mono text-[12px] tabular-nums text-neutral-100 outline-none focus:border-neutral-500"
          />
          <button
            disabled={busy || !cap}
            onClick={() => reply(`RAISE CAP TO $${cap}`)}
            className="border border-neutral-600 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-200 hover:border-neutral-400 disabled:opacity-40"
          >
            Raise
          </button>
        </span>
      </div>

      {busy ? (
        <p className="font-mono text-[11px] text-neutral-500">
          Amending policy, re-checking, and settling…
        </p>
      ) : null}
      {note ? (
        <p className="whitespace-pre-wrap font-mono text-[11px] text-neutral-500">
          {note}
        </p>
      ) : null}
    </div>
  );
}
