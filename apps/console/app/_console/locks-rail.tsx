"use client";

import { usd } from "./fmt";
import type { ConsoleState } from "./types";

export interface PortfolioData {
  environment: string;
  envelopes: {
    label: string;
    prava_mandate_id: string;
    per_charge_cap_cents: number;
    renews_at: string;
    cycle: string;
    spent_cents: number;
  }[];
  portfolio: { spent_cents: number; cap_cents: number };
  policy: { cumulative_cents: number; cap_cents: number | null } | null;
}

function Meter({ spent, cap }: { spent: number; cap: number }) {
  const pct = cap > 0 ? Math.min(100, (spent / cap) * 100) : 0;
  return (
    <div className="mt-1 h-[3px] w-full bg-neutral-800">
      <div className="h-full bg-neutral-400" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** The two locks, always on screen. LOCK 1 is policy (every charge);
 *  LOCK 2 is the passkey-approved envelope portfolio (once per envelope). */
export default function LocksRail({
  state,
  portfolio,
}: {
  state: ConsoleState;
  portfolio: PortfolioData | null;
}) {
  const v = state.verdict;
  return (
    <div className="grid shrink-0 grid-cols-2 gap-4 border-b border-neutral-800 pb-2 pt-3">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-neutral-600">
          Lock 1 · Policy — every charge
        </div>
        <div className="mt-1 flex items-baseline justify-between font-mono text-[11px]">
          <span
            className={
              v === null
                ? "text-neutral-600"
                : v.decision === "EXECUTE"
                  ? "text-emerald-400"
                  : v.decision === "NEEDS_HUMAN"
                    ? "text-amber-400"
                    : "text-red-500"
            }
          >
            {v ? (v.decision === "NEEDS_HUMAN" ? "NEEDS HUMAN" : v.decision) : "NO VERDICT"}
          </span>
          {portfolio?.policy ? (
            <span className="tabular-nums text-neutral-400">
              {usd(portfolio.policy.cumulative_cents)}
              {portfolio.policy.cap_cents !== null
                ? ` OF ${usd(portfolio.policy.cap_cents)}`
                : ""}
            </span>
          ) : null}
        </div>
        {portfolio?.policy?.cap_cents ? (
          <Meter
            spent={portfolio.policy.cumulative_cents}
            cap={portfolio.policy.cap_cents}
          />
        ) : null}
        {state.amendment ? (
          <div className="mt-1 font-mono text-[10px] text-neutral-500">
            {state.amendment.oldId} → {state.amendment.newId} · amount_cap{" "}
            {usd(state.amendment.newCapCents)}
          </div>
        ) : null}
      </div>

      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-neutral-600">
          Lock 2 · Envelopes — passkey, once each
        </div>
        {portfolio && portfolio.envelopes.length > 0 ? (
          <>
            {portfolio.envelopes.map((e) => (
              <div
                key={e.label}
                className="mt-1 flex items-baseline justify-between font-mono text-[11px]"
              >
                <span className="text-neutral-400">
                  {e.label}{" "}
                  <span
                    className={
                      e.cycle === "OPEN" ? "text-emerald-400" : "text-neutral-600"
                    }
                  >
                    {e.cycle}
                  </span>
                </span>
                <span className="tabular-nums text-neutral-500">
                  {usd(e.per_charge_cap_cents)}/chg · renews{" "}
                  {e.renews_at.slice(5, 10)}
                </span>
              </div>
            ))}
            <div className="mt-1 flex items-baseline justify-between font-mono text-[11px]">
              <span className="text-neutral-600">PORTFOLIO</span>
              <span className="tabular-nums text-neutral-300">
                {usd(portfolio.portfolio.spent_cents)} OF{" "}
                {usd(portfolio.portfolio.cap_cents)}
              </span>
            </div>
            <Meter
              spent={portfolio.portfolio.spent_cents}
              cap={portfolio.portfolio.cap_cents}
            />
          </>
        ) : (
          <div className="mt-1 font-mono text-[11px] text-neutral-700">
            NO ENVELOPES THIS CYCLE
          </div>
        )}
      </div>
    </div>
  );
}
