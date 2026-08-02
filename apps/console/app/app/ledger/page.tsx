import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { sqlAll } from "@/lib/db";
import PageHeader from "../../_ui/page-header";
import { Amount, Badge, Empty, Mono, Stamp } from "../../_ui/primitives";

export const dynamic = "force-dynamic";

interface Row {
  id: number;
  run_id: string;
  mandate_id: string;
  envelope_id: string | null;
  entry_type: "spend" | "amendment";
  autonomous: number;
  clause_paths: string;
  amount_cents: number;
  mode: string;
  prava_txn_id: string | null;
  merchant_ref: string | null;
  counterparty_id: string | null;
  at: string;
}

export default async function LedgerPage() {
  const user = await requireUser();
  const rows = await sqlAll<Row>(
    `SELECT id, run_id, mandate_id, envelope_id, entry_type, autonomous,
            clause_paths, amount_cents, mode, prava_txn_id, merchant_ref,
            counterparty_id, at
     FROM ledger WHERE owner_id = ? ORDER BY id DESC`,
    [user.id]
  );

  const spent = rows
    .filter((r) => r.entry_type === "spend")
    .reduce((sum, r) => sum + r.amount_cents, 0);

  return (
    <>
      <PageHeader
        title="Ledger"
        lede="Append-only. Every cent is attributed to the policy clauses that allowed it and the envelope it came from — nothing here can be edited, only added to."
      />

      <div className="p-6">
        {rows.length === 0 ? (
          <Empty
            title="Nothing has been spent."
            hint="When your agent buys something, the receipt lands here with the reasoning attached."
          />
        ) : (
          <>
            <p className="mb-4 font-mono text-[12px] text-neutral-500">
              Total spent <Amount cents={spent} className="text-neutral-200" />{" "}
              across {rows.filter((r) => r.entry_type === "spend").length}{" "}
              purchases
            </p>

            <div className="flex flex-col divide-y divide-neutral-900 border-y border-neutral-900">
              {rows.map((r) => (
                <article key={r.id} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <Stamp at={r.at} />
                      <Badge tone={r.entry_type === "spend" ? "good" : "neutral"}>
                        {r.entry_type}
                      </Badge>
                      <Badge>{r.mode}</Badge>
                      {r.autonomous === 1 ? (
                        <Badge tone="good">no human in loop</Badge>
                      ) : null}
                    </span>
                    <Amount
                      cents={r.amount_cents}
                      className="text-[15px] text-neutral-100"
                    />
                  </div>

                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                    <Link
                      href={`/app/runs/${r.run_id}`}
                      className="font-mono text-[10px] text-neutral-500 hover:text-neutral-300"
                    >
                      {r.run_id}
                    </Link>
                    <Mono className="text-[10px] text-neutral-600">
                      {r.mandate_id}
                    </Mono>
                    {r.envelope_id ? (
                      <Mono className="text-[10px] text-neutral-600">
                        {r.envelope_id}
                      </Mono>
                    ) : null}
                    {r.prava_txn_id ? (
                      <Mono className="text-[10px] text-neutral-600">
                        {r.prava_txn_id}
                      </Mono>
                    ) : null}
                    {r.merchant_ref ? (
                      <Mono className="text-[10px] text-neutral-600">
                        {r.merchant_ref}
                      </Mono>
                    ) : null}
                  </div>

                  <p className="mt-1 font-mono text-[10px] leading-relaxed text-neutral-700">
                    {(JSON.parse(r.clause_paths) as string[]).join("  ")}
                  </p>
                </article>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
