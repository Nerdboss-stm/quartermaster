"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Current {
  perChargeCapCents: number | null;
  cumulativeCapCents: number | null;
  minVramGb: number | null;
  maxDurationH: number | null;
}

/**
 * Changing the rules your agent buys under.
 *
 * Nothing here edits the mandate you already signed — saving issues a new
 * one that supersedes it, which is why the history below only ever grows.
 */
export default function PolicyEditor({ current }: { current: Current }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [form, setForm] = useState({
    perCharge: dollars(current.perChargeCapCents),
    cumulative: dollars(current.cumulativeCapCents),
    minVram: current.minVramGb === null ? "" : String(current.minVramGb),
    maxDuration:
      current.maxDurationH === null ? "" : String(current.maxDurationH),
  });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const res = await fetch("/api/policy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(form.perCharge
            ? { perChargeCapCents: Math.round(Number(form.perCharge) * 100) }
            : {}),
          ...(form.cumulative
            ? { cumulativeCapCents: Math.round(Number(form.cumulative) * 100) }
            : {}),
          ...(form.minVram ? { minVramGb: Number(form.minVram) } : {}),
          ...(form.maxDuration
            ? { maxDurationH: Number(form.maxDuration) }
            : {}),
        }),
      });
      const json = (await res.json()) as { error?: string; newId?: string };
      if (!res.ok) {
        setError(json.error ?? "could not change the policy");
        return;
      }
      setSaved(json.newId ?? null);
      router.refresh();
    } catch {
      setError("could not reach the server");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex max-w-lg flex-col gap-5">
      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Most per purchase"
          prefix="$"
          value={form.perCharge}
          onChange={(v) => setForm((f) => ({ ...f, perCharge: v }))}
          step="0.01"
        />
        <Field
          label="Most in total"
          prefix="$"
          value={form.cumulative}
          onChange={(v) => setForm((f) => ({ ...f, cumulative: v }))}
          step="0.01"
        />
        <Field
          label="Smallest GPU"
          suffix="GB"
          value={form.minVram}
          onChange={(v) => setForm((f) => ({ ...f, minVram: v }))}
          step="1"
        />
        <Field
          label="Longest booking"
          suffix="hours"
          value={form.maxDuration}
          onChange={(v) => setForm((f) => ({ ...f, maxDuration: v }))}
          step="0.5"
        />
      </div>

      {error ? (
        <p className="border-l-2 border-red-500 pl-2 font-mono text-[11px] text-red-400">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="border-l-2 border-emerald-600 pl-2 font-sans text-[12px] text-emerald-400">
          Signed. Your agent is now bound by{" "}
          <span className="font-mono">{saved}</span> — the old one is kept,
          superseded, and still counts towards your total.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="self-start border border-neutral-500 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-100 hover:border-neutral-300 hover:bg-neutral-900 disabled:opacity-40"
      >
        {busy ? "Signing…" : "Sign new policy"}
      </button>

      <p className="font-sans text-[12px] leading-relaxed text-neutral-600">
        This changes the rules, not the money. Loosening a rule here does not
        give your agent a cent more to spend — that still takes your passkey
        on{" "}
        <a
          href="/app/portfolio"
          className="underline underline-offset-4 hover:text-neutral-400"
        >
          spending power
        </a>
        .
      </p>
    </form>
  );
}

function dollars(cents: number | null): string {
  return cents === null ? "" : (cents / 100).toFixed(2);
}

function Field({
  label,
  prefix,
  suffix,
  value,
  onChange,
  step,
}: {
  label: string;
  prefix?: string;
  suffix?: string;
  value: string;
  onChange: (v: string) => void;
  step: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">
        {label}
      </span>
      <span className="flex items-center gap-1.5">
        {prefix ? (
          <span className="font-mono text-[13px] text-neutral-500">
            {prefix}
          </span>
        ) : null}
        <input
          type="number"
          min={0}
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full border border-neutral-800 bg-transparent px-2 py-2 font-mono text-[13px] tabular-nums text-neutral-100 outline-none focus:border-neutral-500"
        />
        {suffix ? (
          <span className="shrink-0 font-mono text-[11px] text-neutral-600">
            {suffix}
          </span>
        ) : null}
      </span>
    </label>
  );
}
