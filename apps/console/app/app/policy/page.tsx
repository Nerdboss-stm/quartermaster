import type { Mandate } from "mandate-arbiter";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { sqlAll } from "@/lib/db";
import { type PolicySummary, summarizePolicy } from "@/lib/policy";
import PageHeader from "../../_ui/page-header";
import PolicyEditor from "../../_ui/policy-editor";
import { Badge, Card, Empty, Mono, Stamp } from "../../_ui/primitives";

export const dynamic = "force-dynamic";

interface MandateRow {
  id: string;
  body: string;
  status: string;
  supersedes: string | null;
  created_at: string;
}

export default async function PolicyPage() {
  const user = await requireUser();

  const [rows, amendmentRows, replyRows] = await Promise.all([
    sqlAll<MandateRow>(
      `SELECT id, body, status, supersedes, created_at FROM mandates
       WHERE owner_id = ? ORDER BY created_at ASC`,
      [user.id]
    ),
    sqlAll<{ mandate_id: string; run_id: string }>(
      `SELECT mandate_id, run_id FROM ledger
       WHERE owner_id = ? AND entry_type = 'amendment'`,
      [user.id]
    ),
    sqlAll<{ run_id: string; raw: string }>(
      `SELECT run_id, raw FROM escalation_replies
       WHERE run_id IN (SELECT id FROM runs WHERE owner_id = ?) ORDER BY id ASC`,
      [user.id]
    ),
  ]);

  if (rows.length === 0) {
    return (
      <>
        <PageHeader title="Policy" />
        <div className="p-6">
          <Empty
            title="No policy on this account."
            hint="Every account is issued one at signup. If you are seeing this, nothing can be spent at all — which is the safe direction to fail."
          />
        </div>
      </>
    );
  }

  const versions = rows.map((row) => {
    const mandate = JSON.parse(row.body) as Mandate;
    return {
      row,
      mandate,
      summary: summarizePolicy(mandate.root),
    };
  });
  const activeIndex = Math.max(
    versions.findIndex((v) => v.row.status === "active"),
    0
  );
  const active = versions[activeIndex];

  // Why each amendment happened: the ledger ties a mandate to the run that
  // amended it, and that run's reply is the sentence the owner actually sent.
  const runByMandate = new Map(
    amendmentRows.map((a) => [a.mandate_id, a.run_id])
  );
  const replyByRun = new Map(replyRows.map((r) => [r.run_id, r.raw]));

  return (
    <>
      <PageHeader
        title="Policy"
        lede="The rules your agent is bound by, checked line by line before any charge. Changing them issues a new signed policy — the old one is never edited, only superseded."
      />

      <div className="grid gap-4 p-6 lg:grid-cols-2">
        <Card
          title="Active policy"
          action={<Badge tone="good">v{activeIndex + 1}</Badge>}
        >
          <dl className="flex flex-col divide-y divide-neutral-900">
            <Line
              term="Most per purchase"
              value={money(active.summary.perChargeCapCents)}
              note="Above this, your agent stops and asks you."
            />
            <Line
              term="Most in total"
              value={money(active.summary.cumulativeCapCents)}
              note="Counted across every version of this policy, so raising a cap never resets what has been spent."
            />
            <Line
              term="Smallest GPU"
              value={
                active.summary.minVramGb === null
                  ? "any"
                  : `${active.summary.minVramGb} GB`
              }
              note="Anything smaller is refused outright — no asking."
            />
            <Line
              term="Longest booking"
              value={
                active.summary.maxDurationH === null
                  ? "any"
                  : `${active.summary.maxDurationH} h`
              }
            />
            <Line
              term="Sellers"
              value={
                active.summary.counterpartyIds === null
                  ? "anyone in this market"
                  : `${active.summary.counterpartyIds.length} allowed`
              }
            />
          </dl>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-neutral-900 pt-3">
            <Mono className="text-[10px] text-neutral-600">
              {active.mandate.id}
            </Mono>
            <Mono className="text-[10px] text-neutral-700">
              expires {new Date(active.mandate.expiresAt).toLocaleDateString()}
            </Mono>
          </div>
        </Card>

        <Card title="Change the rules">
          <PolicyEditor current={active.summary} />
        </Card>

        <Card title="History" className="lg:col-span-2">
          <ol className="flex flex-col divide-y divide-neutral-900">
            {[...versions].reverse().map((v, i) => {
              const version = versions.length - i;
              const previous = versions[versions.length - i - 2];
              const runId = runByMandate.get(v.row.id);
              const reply = runId ? replyByRun.get(runId) : undefined;
              return (
                <li key={v.row.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <Mono className="text-[12px] text-neutral-300">
                      v{version}
                    </Mono>
                    <Badge tone={v.row.status === "active" ? "good" : "neutral"}>
                      {v.row.status}
                    </Badge>
                    <Stamp at={v.row.created_at} />
                    <Mono className="text-[10px] text-neutral-600">
                      {v.row.id}
                    </Mono>
                  </div>

                  <p className="mt-1.5 font-sans text-[13px] text-neutral-400">
                    {previous
                      ? describeChange(previous.summary, v.summary)
                      : "Issued at signup."}
                  </p>

                  {reply ? (
                    <p className="mt-1 font-sans text-[12px] text-neutral-600">
                      You replied{" "}
                      <span className="font-mono text-neutral-400">
                        “{reply.trim()}”
                      </span>
                      {runId ? (
                        <>
                          {" on "}
                          <Link
                            href={`/app/runs/${runId}`}
                            className="font-mono underline underline-offset-4 hover:text-neutral-400"
                          >
                            {runId}
                          </Link>
                        </>
                      ) : null}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </Card>
      </div>
    </>
  );
}

function money(cents: number | null): string {
  return cents === null ? "none" : `$${(cents / 100).toFixed(2)}`;
}

/** What actually moved between two signed versions, in plain words. */
function describeChange(before: PolicySummary, after: PolicySummary): string {
  const parts: string[] = [];
  if (before.perChargeCapCents !== after.perChargeCapCents) {
    parts.push(
      `most per purchase ${money(before.perChargeCapCents)} → ${money(after.perChargeCapCents)}`
    );
  }
  if (before.cumulativeCapCents !== after.cumulativeCapCents) {
    parts.push(
      `most in total ${money(before.cumulativeCapCents)} → ${money(after.cumulativeCapCents)}`
    );
  }
  if (before.minVramGb !== after.minVramGb) {
    parts.push(`smallest GPU ${before.minVramGb}GB → ${after.minVramGb}GB`);
  }
  if (before.maxDurationH !== after.maxDurationH) {
    parts.push(
      `longest booking ${before.maxDurationH}h → ${after.maxDurationH}h`
    );
  }
  return parts.length > 0 ? parts.join(", ") : "Re-signed with no change.";
}

function Line({
  term,
  value,
  note,
}: {
  term: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="py-2.5">
      <div className="flex items-baseline justify-between gap-4">
        <dt className="font-sans text-[13px] text-neutral-400">{term}</dt>
        <dd className="font-mono text-[14px] tabular-nums text-neutral-100">
          {value}
        </dd>
      </div>
      {note ? (
        <p className="mt-0.5 max-w-md font-sans text-[11px] leading-relaxed text-neutral-600">
          {note}
        </p>
      ) : null}
    </div>
  );
}
