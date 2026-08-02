import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { sqlAll } from "@/lib/db";
import { latestPendingEscalation } from "@/lib/escalation-flow";
import ApprovalPanel from "../../_ui/approval-panel";
import PageHeader from "../../_ui/page-header";
import { Badge, Card, Empty, Mono, Stamp } from "../../_ui/primitives";

export const dynamic = "force-dynamic";

export default async function EscalationsPage() {
  const user = await requireUser();

  const [pending, history] = await Promise.all([
    latestPendingEscalation(user.id),
    sqlAll<{
      id: number;
      run_id: string;
      failing_detail: string;
      status: string;
      delivery: string | null;
      at: string;
    }>(
      `SELECT id, run_id, failing_detail, status, delivery, at FROM escalations
       WHERE owner_id = ? ORDER BY id DESC LIMIT 20`,
      [user.id]
    ),
  ]);

  return (
    <>
      <PageHeader
        title="Approvals"
        lede={
          user.phone
            ? `These also reach you by text on ${user.phone}. Answering in either place does the same thing.`
            : "Add a phone number to your account and these will reach you by text instead."
        }
      />

      <div className="flex flex-col gap-4 p-6">
        {pending?.delivery === "failed" ? (
          <p className="border-l-2 border-amber-500 py-1 pl-3 font-sans text-[13px] leading-relaxed text-amber-400">
            We could not deliver the text to your number, so this is waiting
            here instead. Answering below does exactly what replying would
            have done.
          </p>
        ) : null}

        {pending ? (
          <Card title="Waiting on you">
            <ApprovalPanel
              pending={{
                runId: pending.run_id,
                quoteId: pending.quote_id,
                failingDetail: pending.failing_detail,
              }}
            />
          </Card>
        ) : (
          <Card title="Waiting on you">
            <Empty
              title="Nothing needs your call."
              hint="Your agent only interrupts you when a purchase falls outside the policy you signed."
            />
          </Card>
        )}

        <Card title="Earlier">
          {history.length === 0 ? (
            <Empty title="No approvals yet." />
          ) : (
            <ul className="flex flex-col divide-y divide-neutral-900">
              {history.map((h) => (
                <li
                  key={h.id}
                  className="flex items-center justify-between gap-4 py-2.5"
                >
                  <span className="min-w-0">
                    <p className="truncate font-sans text-[13px] text-neutral-300">
                      {h.failing_detail}
                    </p>
                    <Link
                      href={`/app/runs/${h.run_id}`}
                      className="font-mono text-[10px] text-neutral-600 hover:text-neutral-400"
                    >
                      {h.run_id}
                    </Link>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <Stamp at={h.at} />
                    <Badge tone={h.status === "answered" ? "good" : "warn"}>
                      {h.status}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
