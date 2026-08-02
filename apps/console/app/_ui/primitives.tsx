import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The shared vocabulary of the product surface.
 *
 * Design law, carried over from the console: numbers, ids and timestamps
 * are monospace and tabular; prose is Inter. Colour means state and
 * nothing else — emerald settled, amber waiting on a human, red refused.
 * Everything else is neutral, so the one coloured thing on a screen is
 * always the thing that matters.
 */

export function Card({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`border border-neutral-800 bg-neutral-950 ${className}`}>
      {title ? (
        <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-2.5">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.25em] text-neutral-500">
            {title}
          </h2>
          {action}
        </header>
      ) : null}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Amount({
  cents,
  className = "",
}: {
  cents: number;
  className?: string;
}) {
  return (
    <span className={`font-mono tabular-nums ${className}`}>
      ${(cents / 100).toFixed(2)}
    </span>
  );
}

export function Mono({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`font-mono tabular-nums ${className}`}>{children}</span>
  );
}

type Tone = "neutral" | "good" | "warn" | "bad";

const TONES: Record<Tone, string> = {
  neutral: "border-neutral-700 text-neutral-400",
  good: "border-emerald-600 text-emerald-400",
  warn: "border-amber-500 text-amber-400",
  bad: "border-red-500 text-red-400",
};

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  return (
    <span
      className={`border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function toneForState(state: string): Tone {
  if (["settled", "confirmed", "answered"].includes(state)) return "good";
  if (["escalated", "running", "pending"].includes(state)) return "warn";
  if (["refused", "failed", "declined", "expired"].includes(state)) return "bad";
  return "neutral";
}

/** A budget as a bar. The number is the truth; the bar is the feeling. */
export function Meter({
  label,
  spentCents,
  capCents,
  tone = "neutral",
}: {
  label: string;
  spentCents: number;
  capCents: number;
  tone?: Tone;
}) {
  const pct = capCents > 0 ? Math.min(100, (spentCents / capCents) * 100) : 0;
  const fill =
    tone === "bad"
      ? "bg-red-500"
      : tone === "warn"
        ? "bg-amber-400"
        : "bg-neutral-300";
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">
          {label}
        </span>
        <span className="font-mono text-[12px] tabular-nums text-neutral-200">
          ${(spentCents / 100).toFixed(2)}{" "}
          <span className="text-neutral-600">
            of ${(capCents / 100).toFixed(2)}
          </span>
        </span>
      </div>
      <div className="mt-1.5 h-[3px] w-full bg-neutral-900">
        <div className={`h-full ${fill}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Empty({
  title,
  hint,
  cta,
}: {
  title: string;
  hint?: string;
  cta?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col items-start gap-2 py-6">
      <p className="font-sans text-[13px] text-neutral-400">{title}</p>
      {hint ? (
        <p className="max-w-md font-sans text-[12px] leading-relaxed text-neutral-600">
          {hint}
        </p>
      ) : null}
      {cta ? (
        <Link
          href={cta.href}
          className="mt-1 border border-neutral-600 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-200 hover:border-neutral-400 hover:bg-neutral-900"
        >
          {cta.label}
        </Link>
      ) : null}
    </div>
  );
}

export function Stamp({ at }: { at: string }) {
  const d = new Date(at);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    <time
      dateTime={at}
      className="font-mono text-[10px] tabular-nums text-neutral-600"
    >
      {`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`}
    </time>
  );
}
