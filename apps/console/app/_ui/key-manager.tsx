"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Issuing machine access.
 *
 * The plaintext key exists in one response and is never stored — only its
 * hash is. So it is shown once, loudly, and the copy says so before the
 * user navigates away from it.
 */
export default function KeyManager() {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: label.trim() || "agent" }),
      });
      const json = (await res.json()) as { key?: string; error?: string };
      if (!res.ok || !json.key) {
        setError(json.error ?? "could not issue a key");
        return;
      }
      setIssued(json.key);
      setLabel("");
      router.refresh();
    } catch {
      setError("could not reach the server");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-lg">
      <form onSubmit={create} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">
            What is it for
          </span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="my NANDA agent"
            className="w-64 border border-neutral-800 bg-transparent px-2 py-2 font-mono text-[13px] text-neutral-100 outline-none placeholder:text-neutral-700 focus:border-neutral-500"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="border border-neutral-500 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-100 hover:border-neutral-300 hover:bg-neutral-900 disabled:opacity-40"
        >
          {busy ? "Issuing…" : "Issue key"}
        </button>
      </form>

      {error ? (
        <p className="mt-3 border-l-2 border-red-500 pl-2 font-mono text-[11px] text-red-400">
          {error}
        </p>
      ) : null}

      {issued ? (
        <div className="mt-4 border border-amber-500 p-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-amber-400">
            Copy this now — it is not stored
          </p>
          <p className="mt-2 break-all font-mono text-[12px] text-neutral-100">
            {issued}
          </p>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(issued);
              setCopied(true);
            }}
            className="mt-3 border border-neutral-700 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-300 hover:border-neutral-500"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
