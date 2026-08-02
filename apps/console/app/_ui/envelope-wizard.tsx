"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Stage = "idle" | "opening" | "waiting" | "approved" | "error";

const PRESETS = [2000, 6000, 12000];

/**
 * Approving spending power.
 *
 * The passkey happens on the owner's device, in Prava's window — nothing
 * here can stand in for it. While they are over there, this polls for the
 * mandate to appear, so the tab they left behind catches up by itself.
 */
export default function EnvelopeWizard() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("idle");
  const [capDollars, setCapDollars] = useState("60.00");
  const [approvalUrl, setApprovalUrl] = useState<string | null>(null);
  const [label, setLabel] = useState("A");
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  const start = async () => {
    setStage("opening");
    setError(null);
    try {
      const res = await fetch("/api/envelopes/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          capCents: Math.round(Number(capDollars) * 100),
        }),
      });
      const json = (await res.json()) as {
        approvalUrl?: string;
        label?: string;
        error?: string;
      };
      if (!res.ok || !json.approvalUrl) {
        setError(json.error ?? "could not start approval");
        setStage("error");
        return;
      }
      setApprovalUrl(json.approvalUrl);
      setLabel(json.label ?? "A");
      setStage("waiting");
      window.open(json.approvalUrl, "_blank", "noopener");

      timer.current = setInterval(async () => {
        const poll = await fetch("/api/envelopes/await", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ label: json.label ?? "A" }),
        });
        const result = (await poll.json()) as { approved?: boolean };
        if (result.approved) {
          if (timer.current) clearInterval(timer.current);
          setStage("approved");
          router.refresh();
        }
      }, 3000);
    } catch {
      setError("could not reach the server");
      setStage("error");
    }
  };

  if (stage === "approved") {
    return (
      <div className="max-w-lg">
        <p className="font-sans text-lg text-emerald-400">
          Envelope {label} is live.
        </p>
        <p className="mt-2 font-sans text-[13px] leading-relaxed text-neutral-400">
          Your agent can now buy inside it without asking again. One charge
          per week, never above the cap, and only from this marketplace —
          that is the card network holding the line, not a promise in our
          code.
        </p>
        <button
          onClick={() => {
            setStage("idle");
            setApprovalUrl(null);
          }}
          className="mt-4 border border-neutral-700 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-300 hover:border-neutral-500"
        >
          Add another
        </button>
      </div>
    );
  }

  if (stage === "waiting") {
    return (
      <div className="max-w-lg">
        <p className="font-sans text-lg text-amber-400">
          Waiting for your passkey…
        </p>
        <p className="mt-2 font-sans text-[13px] leading-relaxed text-neutral-400">
          Approve envelope {label} in the window that just opened. This page
          notices by itself — you do not have to come back to it.
        </p>
        {approvalUrl ? (
          <a
            href={approvalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-block border border-neutral-700 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-300 hover:border-neutral-500"
          >
            Reopen approval
          </a>
        ) : null}
        <p className="mt-4 font-sans text-[12px] text-neutral-600">
          Approval windows expire after about fifteen minutes.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-lg">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">
            Cap per charge
          </span>
          <span className="flex items-center gap-1.5">
            <span className="font-mono text-[13px] text-neutral-500">$</span>
            <input
              type="number"
              min={1}
              step={1}
              value={capDollars}
              onChange={(e) => setCapDollars(e.target.value)}
              className="w-28 border border-neutral-800 bg-transparent px-2 py-2 font-mono text-[13px] tabular-nums text-neutral-100 outline-none focus:border-neutral-500"
            />
          </span>
        </label>
        {PRESETS.map((cents) => (
          <button
            key={cents}
            type="button"
            onClick={() => setCapDollars((cents / 100).toFixed(2))}
            className="border border-neutral-800 px-2.5 py-1.5 font-mono text-[11px] tabular-nums text-neutral-400 hover:border-neutral-600 hover:text-neutral-200"
          >
            ${(cents / 100).toFixed(0)}
          </button>
        ))}
      </div>

      {error ? (
        <p className="mt-3 border-l-2 border-red-500 pl-2 font-mono text-[11px] text-red-400">
          {error}
        </p>
      ) : null}

      <button
        onClick={start}
        disabled={stage === "opening"}
        className="mt-5 border border-neutral-500 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-100 hover:border-neutral-300 hover:bg-neutral-900 disabled:opacity-40"
      >
        {stage === "opening" ? "Opening…" : "Approve with passkey"}
      </button>

      <p className="mt-4 font-sans text-[12px] leading-relaxed text-neutral-600">
        You approve this once. Afterwards your agent draws from it without
        asking — but never more than the cap, never more than once a week,
        and never anywhere else.
      </p>
    </div>
  );
}
