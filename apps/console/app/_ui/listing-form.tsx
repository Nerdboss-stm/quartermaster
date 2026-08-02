"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const PRESETS = [
  { gpu: "A100 80GB", vramGb: 80, rate: "11.75" },
  { gpu: "L40S 48GB", vramGb: 48, rate: "9.00" },
  { gpu: "RTX 4090 24GB", vramGb: 24, rate: "4.50" },
];

/** Publishing capacity into the same registry every other supplier uses. */
export default function ListingForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    gpu: "L40S 48GB",
    vramGb: "48",
    rate: "9.00",
    floor: "",
    maxDurationH: "8",
  });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/listings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          gpu: form.gpu,
          vramGb: Number(form.vramGb),
          rateCentsPerHour: Math.round(Number(form.rate) * 100),
          ...(form.floor
            ? { floorCentsPerHour: Math.round(Number(form.floor) * 100) }
            : {}),
          maxDurationH: Number(form.maxDurationH),
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "could not publish that listing");
        return;
      }
      router.push("/app/listings");
      router.refresh();
    } catch {
      setError("could not reach the server");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex max-w-lg flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.gpu}
            type="button"
            onClick={() =>
              setForm((f) => ({
                ...f,
                gpu: p.gpu,
                vramGb: String(p.vramGb),
                rate: p.rate,
              }))
            }
            className="border border-neutral-800 px-2.5 py-1 font-sans text-[12px] text-neutral-400 hover:border-neutral-600 hover:text-neutral-200"
          >
            {p.gpu}
          </button>
        ))}
      </div>

      <label className="flex flex-col gap-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">
          What are you renting out
        </span>
        <input
          required
          value={form.gpu}
          onChange={(e) => setForm((f) => ({ ...f, gpu: e.target.value }))}
          className={input}
        />
      </label>

      <div className="grid grid-cols-2 gap-4">
        <Labeled label="Memory" suffix="GB">
          <input
            type="number"
            required
            min={1}
            value={form.vramGb}
            onChange={(e) => setForm((f) => ({ ...f, vramGb: e.target.value }))}
            className={input}
          />
        </Labeled>
        <Labeled label="Longest booking" suffix="hours">
          <input
            type="number"
            required
            min={1}
            value={form.maxDurationH}
            onChange={(e) =>
              setForm((f) => ({ ...f, maxDurationH: e.target.value }))
            }
            className={input}
          />
        </Labeled>
        <Labeled label="Your rate" prefix="$" suffix="/hour">
          <input
            type="number"
            required
            min={0.01}
            step={0.01}
            value={form.rate}
            onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))}
            className={input}
          />
        </Labeled>
        <Labeled label="Won't go below" prefix="$" suffix="/hour">
          <input
            type="number"
            min={0.01}
            step={0.01}
            placeholder="10% off"
            value={form.floor}
            onChange={(e) => setForm((f) => ({ ...f, floor: e.target.value }))}
            className={input}
          />
        </Labeled>
      </div>

      {error ? (
        <p className="border-l-2 border-red-500 pl-2 font-mono text-[11px] text-red-400">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="self-start border border-neutral-500 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-100 hover:border-neutral-300 hover:bg-neutral-900 disabled:opacity-40"
      >
        {busy ? "Publishing…" : "Publish capacity"}
      </button>

      <p className="font-sans text-[12px] leading-relaxed text-neutral-600">
        Buying agents will find this immediately. If one asks for a better
        price you will give exactly one discount, and never below your floor —
        we hold that line for you. Your floor is never shown to buyers.
      </p>
    </form>
  );
}

const input =
  "w-full border border-neutral-800 bg-transparent px-2 py-2 font-mono text-[13px] tabular-nums text-neutral-100 outline-none focus:border-neutral-500";

function Labeled({
  label,
  prefix,
  suffix,
  children,
}: {
  label: string;
  prefix?: string;
  suffix?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">
        {label}
      </span>
      <span className="flex items-center gap-1.5">
        {prefix ? (
          <span className="font-mono text-[13px] text-neutral-500">{prefix}</span>
        ) : null}
        {children}
        {suffix ? (
          <span className="shrink-0 font-mono text-[11px] text-neutral-600">
            {suffix}
          </span>
        ) : null}
      </span>
    </label>
  );
}
