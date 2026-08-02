"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import LiveRun from "./live-run";

interface Outcome {
  state: string;
  runId?: string;
  detail?: string;
  /** Whether the owner was actually reached. Never assume they were. */
  delivery?: string | null;
}

/** States a need stops moving in. */
const TERMINAL = [
  "settled",
  "escalated",
  "refused",
  "declined",
  "failed",
  "expired",
];

const PRESETS = [
  { label: "Fine-tune overnight", vramGb: 80, durationH: 4, budget: "40.00" },
  { label: "Quick eval", vramGb: 40, durationH: 2, budget: "20.00" },
];

/**
 * The form the whole product exists for: say what you need and the most
 * you will pay, then stop thinking about it.
 */
export default function NeedForm({ hasPhone }: { hasPhone: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needId, setNeedId] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [form, setForm] = useState({
    vramGb: "80",
    durationH: "4",
    budget: "40.00",
    hours: "12",
  });

  const set = (k: keyof typeof form) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setOutcome(null);
    try {
      const res = await fetch("/api/needs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          vramGb: Number(form.vramGb),
          durationH: Number(form.durationH),
          maxPriceCents: Math.round(Number(form.budget) * 100),
          deadline: new Date(
            Date.now() + Number(form.hours) * 3_600_000
          ).toISOString(),
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        need?: { id: string };
      };
      if (!res.ok || !json.need) {
        setError(json.error ?? "could not post that request");
        setBusy(false);
        return;
      }
      // The need is recorded. Start the work but do not wait on it — the
      // watching happens below, live, while it runs.
      setNeedId(json.need.id);
      void fetch(`/api/needs/${json.need.id}/run`, { method: "POST" }).catch(
        () => {}
      );
      router.refresh();
    } catch {
      setError("could not reach the server");
      setBusy(false);
    }
  };

  if (needId) {
    return (
      <Watching
        needId={needId}
        runId={runId}
        onRunId={setRunId}
        outcome={outcome}
        onOutcome={setOutcome}
        hasPhone={hasPhone}
      />
    );
  }

  return (
    <form onSubmit={submit} className="flex max-w-lg flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() =>
              setForm((f) => ({
                ...f,
                vramGb: String(p.vramGb),
                durationH: String(p.durationH),
                budget: p.budget,
              }))
            }
            className="border border-neutral-800 px-2.5 py-1 font-sans text-[12px] text-neutral-400 hover:border-neutral-600 hover:text-neutral-200"
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="GPU memory" suffix="GB">
          <input
            type="number"
            min={1}
            required
            value={form.vramGb}
            onChange={(e) => set("vramGb")(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="For how long" suffix="hours">
          <input
            type="number"
            min={0.5}
            step={0.5}
            required
            value={form.durationH}
            onChange={(e) => set("durationH")(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Most you will pay" prefix="$">
          <input
            type="number"
            min={0.01}
            step={0.01}
            required
            value={form.budget}
            onChange={(e) => set("budget")(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Give up after" suffix="hours">
          <input
            type="number"
            min={1}
            required
            value={form.hours}
            onChange={(e) => set("hours")(e.target.value)}
            className={inputClass}
          />
        </Field>
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
        {busy ? "Sending…" : "Send my agent"}
      </button>

      <p className="font-sans text-[12px] leading-relaxed text-neutral-600">
        Your agent will look for supply now and keep watching if there is
        none. It can only spend inside your policy;{" "}
        {hasPhone
          ? "anything above it texts you first."
          : "anything above it waits for you in Approvals."}
      </p>
    </form>
  );
}

const inputClass =
  "w-full border border-neutral-800 bg-transparent px-2 py-2 font-mono text-[13px] tabular-nums text-neutral-100 outline-none focus:border-neutral-500";

function Field({
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
          <span className="font-mono text-[11px] text-neutral-600">{suffix}</span>
        ) : null}
      </span>
    </label>
  );
}

/**
 * The waiting room, which is not a waiting room.
 *
 * The old version blocked on one request and showed a spinner for however
 * long the agent took. Everything interesting — the search, the quote, the
 * haggle, the refusal — happened where nobody could see it. Now the request
 * returns immediately and this watches the run unfold.
 */
function Watching({
  needId,
  runId,
  onRunId,
  outcome,
  onOutcome,
  hasPhone,
}: {
  needId: string;
  runId: string | null;
  onRunId: (id: string) => void;
  outcome: Outcome | null;
  onOutcome: (o: Outcome) => void;
  hasPhone: boolean;
}) {
  const settled = useRef(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let alive = true;

    const poll = async () => {
      try {
        const res = await fetch(`/api/needs/${needId}`);
        if (res.ok) {
          const json = (await res.json()) as {
            state: string;
            runId: string | null;
            delivery: string | null;
          };
          if (json.runId) onRunId(json.runId);
          if (TERMINAL.includes(json.state) && !settled.current) {
            settled.current = true;
            onOutcome({
              state: json.state,
              runId: json.runId ?? undefined,
              delivery: json.delivery,
            });
          }
        }
      } catch {
        // keep polling; a dropped request is not a verdict
      }
      if (alive && !settled.current) timer = setTimeout(poll, 1000);
    };

    void poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [needId, onRunId, onOutcome]);

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      {outcome ? (
        <Result outcome={outcome} hasPhone={hasPhone} />
      ) : (
        <div>
          <p className="font-sans text-lg text-neutral-200">
            Your agent is working.
          </p>
          <p className="mt-1 font-sans text-[13px] text-neutral-500">
            You can close this — it finishes without you. Or watch.
          </p>
        </div>
      )}

      {runId ? (
        <LiveRun runId={runId} done={outcome !== null} />
      ) : (
        <div className="border border-neutral-900 bg-black p-4">
          <p className="font-mono text-[11px] text-neutral-600">
            starting your agent…
          </p>
        </div>
      )}
    </div>
  );
}

function Result({
  outcome,
  hasPhone,
}: {
  outcome: Outcome;
  hasPhone: boolean;
}) {
  const copy: Record<string, { title: string; body: string; tone: string }> = {
    settled: {
      title: "Bought.",
      body: "Your agent found supply, checked it against your policy, and paid. The receipt is in your ledger.",
      tone: "text-emerald-400",
    },
    escalated: {
      title: "It needs you.",
      body:
        outcome.delivery === "sent"
          ? "The price was outside your policy, so your agent stopped and texted you. Reply and it finishes on its own."
          : outcome.delivery === "failed"
            ? "The price was outside your policy, so your agent stopped. We could not deliver the text to your number, so answer it in Approvals — nothing is lost."
            : "The price was outside your policy, so your agent stopped. Answer it in Approvals and it finishes on its own.",
      tone: "text-amber-400",
    },
    pending: {
      title: "Waiting for supply.",
      body: "Nobody is selling what you need yet. Your agent keeps watching and will buy the moment someone lists it — you can close this tab.",
      tone: "text-neutral-300",
    },
    refused: {
      title: "Refused.",
      body: "Your policy does not allow this purchase at all, so nothing was bought and nobody was asked.",
      tone: "text-red-400",
    },
    failed: {
      title: "Could not complete it.",
      body: "Nothing was charged. The run has the full trace.",
      tone: "text-red-400",
    },
  };
  const c = copy[outcome.state] ?? copy.pending;

  return (
    <div className="max-w-lg">
      <p className={`font-sans text-lg ${c.tone}`}>{c.title}</p>
      <p className="mt-2 font-sans text-[13px] leading-relaxed text-neutral-400">
        {c.body}
      </p>
      {outcome.detail ? (
        <p className="mt-3 border-l-2 border-neutral-800 pl-3 font-mono text-[11px] text-neutral-500">
          {outcome.detail}
        </p>
      ) : null}
      <div className="mt-5 flex flex-wrap gap-2">
        {outcome.state === "escalated" ? (
          <a
            href="/app/escalations"
            className="border border-amber-500 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-amber-400 hover:bg-neutral-900"
          >
            Answer it
          </a>
        ) : null}
        {outcome.runId ? (
          <a
            href={`/app/runs/${outcome.runId}`}
            className="border border-neutral-600 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-200 hover:border-neutral-400"
          >
            Full trace
          </a>
        ) : null}
        <a
          href="/app"
          className="border border-neutral-800 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500 hover:text-neutral-300"
        >
          Back to overview
        </a>
      </div>
    </div>
  );
}
