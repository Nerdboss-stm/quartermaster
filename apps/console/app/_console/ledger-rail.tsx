"use client";

import { ts, usd } from "./fmt";
import type { LedgerRow } from "./types";

/** Append-only, newest at the right. Full ids, never truncated. */
export default function LedgerRail({
  rows,
  runId,
  onExport,
}: {
  rows: LedgerRow[];
  runId: string | null;
  onExport: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-neutral-600">
          LEDGER
        </span>
        <button
          onClick={onExport}
          disabled={!runId}
          className="border border-neutral-700 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-neutral-400 hover:border-neutral-500 hover:text-neutral-200 disabled:opacity-30"
        >
          Export audit bundle
        </button>
      </div>
      <div className="mt-2 flex min-h-0 flex-1 flex-row-reverse items-stretch gap-2 overflow-x-auto overflow-y-hidden">
        {rows.length === 0 ? (
          <div className="font-mono text-[11px] text-neutral-700">
            EMPTY. EVERY CENT LANDS HERE.
          </div>
        ) : (
          [...rows].reverse().map((r) => (
            <div
              key={r.id}
              className={`flex w-[340px] shrink-0 flex-col border px-2 py-1 ${
                r.entry_type === "amendment"
                  ? "border-neutral-800"
                  : r.autonomous === 1
                    ? "border-amber-400/60"
                    : "border-neutral-700"
              }`}
            >
              <div className="flex items-baseline justify-between font-mono text-[11px]">
                <span className="text-neutral-500">
                  {ts(r.at)}{" "}
                  <span className="uppercase text-neutral-400">{r.entry_type}</span>
                </span>
                <span className="tabular-nums text-neutral-200">
                  {usd(r.amount_cents)}
                </span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1 font-mono text-[9px]">
                <span className="border border-neutral-600 px-1 tracking-widest text-neutral-400">
                  {r.mode.toUpperCase()}
                </span>
                {r.autonomous === 1 ? (
                  <span className="border border-amber-400 px-1 tracking-widest text-amber-400">
                    NO HUMAN IN LOOP
                  </span>
                ) : null}
                {r.envelope_id ? (
                  <span className="text-neutral-500">env {r.envelope_id}</span>
                ) : null}
              </div>
              <div className="mt-0.5 break-all font-mono text-[9px] leading-3 text-neutral-600">
                {r.mandate_id}
                {r.prava_txn_id ? ` · ${r.prava_txn_id}` : ""}
                {r.merchant_ref ? ` · ${r.merchant_ref}` : ""}
              </div>
              <div className="break-all font-mono text-[9px] leading-3 text-neutral-700">
                {JSON.parse(r.clause_paths).join(" ")}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
