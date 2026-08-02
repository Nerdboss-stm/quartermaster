"use client";

import { useState } from "react";

/**
 * Turning a run into evidence anyone can open. Off by default: a run
 * contains what someone bought and what their policy allowed.
 */
export default function ShareToggle({
  runId,
  shared: initial,
}: {
  runId: string;
  shared: boolean;
}) {
  const [shared, setShared] = useState(initial);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/runs/${runId}/share`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ shared: !shared }),
      });
      if (res.ok) setShared(!shared);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(
      `${window.location.origin}/r/${runId}`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex shrink-0 items-center gap-2">
      {shared ? (
        <button
          onClick={copy}
          className="border border-neutral-700 px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-neutral-300 hover:border-neutral-500"
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      ) : null}
      <button
        onClick={toggle}
        disabled={busy}
        className={`border px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.2em] disabled:opacity-40 ${
          shared
            ? "border-emerald-600 text-emerald-400"
            : "border-neutral-700 text-neutral-500 hover:border-neutral-500"
        }`}
      >
        {shared ? "Public" : "Share"}
      </button>
      <a
        href={`/api/runs/${runId}/bundle.json`}
        className="border border-neutral-700 px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"
      >
        Audit bundle
      </a>
    </div>
  );
}
