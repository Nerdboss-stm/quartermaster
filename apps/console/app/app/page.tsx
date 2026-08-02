import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { morningBrief } from "@/lib/brief";
import { sqlAll } from "@/lib/db";
import { listingsForOwner, salesForOwner } from "@/lib/listings";
import { needsForOwner } from "@/lib/needs";
import { portfolioMeter } from "@/lib/portfolio";
import {
  Amount,
  Badge,
  Card,
  Empty,
  Meter,
  Mono,
  Stamp,
  toneForState,
} from "../_ui/primitives";
import GettingStarted from "../_ui/getting-started";
import MorningBrief from "../_ui/morning-brief";
import PageHeader from "../_ui/page-header";
import { agentNumber, sandboxCardFor } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const user = await requireUser();

  const [meter, needs, listings, sales, runs, brief] = await Promise.all([
    portfolioMeter(user.id),
    needsForOwner(user.id),
    listingsForOwner(user.id),
    salesForOwner(user.id),
    sqlAll<{ id: string; state: string; created_at: string }>(
      "SELECT id, state, created_at FROM runs WHERE owner_id = ? ORDER BY created_at DESC LIMIT 5",
      [user.id]
    ),
    morningBrief(user.id),
  ]);

  const open = needs.filter((n) =>
    ["pending", "running", "escalated"].includes(n.state)
  );
  const hasEnvelope = meter.envelopes.length > 0;
  const card = sandboxCardFor(user.id);
  const earned = sales.reduce((sum, s) => sum + s.amount_cents, 0);

  return (
    <>
      <PageHeader
        title={`Good to see you, ${user.display_name.split(" ")[0]}.`}
        lede={
          hasEnvelope
            ? "Your agent buys inside the limits you set, and wakes you only when it needs a decision."
            : "One approval and your agent can start buying — inside limits you set, and no further."
        }
        action={{ href: "/app/needs/new", label: "New request" }}
      />

      <GettingStarted
        steps={[
          {
            title: "Turn on text alerts",
            body: user.phone
              ? `Text anything to the number below from ${user.phone}. Our messaging line can only reach people who have messaged it first, so this one message is what switches it on. Skip it and refusals wait in Approvals instead — everything still works.`
              : "Add your mobile number, then text the agent's line once so it is allowed to reach you.",
            done: user.sms_ready === 1,
            detail: agentNumber()
              ? [{ label: "Text this number", value: agentNumber()! }]
              : undefined,
            cta: user.phone
              ? undefined
              : { href: "/app/settings", label: "Add your number" },
          },
          {
            title: "Approve spending power",
            body: "A passkey grants one bounded envelope. Enter the sandbox test card below when asked — it is a real card number at the network, and it is declined everywhere except this sandbox.",
            done: hasEnvelope,
            detail: [
              { label: "Test card", value: card.number },
              { label: "CVV", value: card.cvv },
              { label: "Expiry", value: card.expiry },
              { label: "If asked for a code", value: card.otp },
            ],
            cta: { href: "/app/portfolio", label: "Approve an envelope" },
          },
          {
            title: "Send your agent to buy something",
            body: "Ask for more than your policy allows and watch it refuse; ask for less and watch it buy. Either way you see every step as it happens.",
            done: runs.length > 0,
            cta: { href: "/app/needs/new", label: "New request" },
          },
        ]}
      />

      <MorningBrief brief={brief} />

      <div className="grid gap-4 p-6 lg:grid-cols-2">
        <Card
          title="Spending power"
          action={
            <Link
              href="/app/portfolio"
              className="font-mono text-[9px] uppercase tracking-[0.2em] text-neutral-500 hover:text-neutral-300"
            >
              Manage
            </Link>
          }
        >
          {hasEnvelope ? (
            <div className="flex flex-col gap-4">
              <Meter
                label="This cycle"
                spentCents={meter.portfolio.spent_cents}
                capCents={meter.portfolio.cap_cents}
              />
              {meter.policy ? (
                <Meter
                  label="Policy total"
                  spentCents={meter.policy.cumulative_cents}
                  capCents={meter.policy.cap_cents ?? 0}
                />
              ) : null}
              <div className="flex flex-col gap-1.5 border-t border-neutral-900 pt-3">
                {meter.envelopes.map((e) => (
                  <div
                    key={e.prava_mandate_id}
                    className="flex items-center justify-between"
                  >
                    <span className="font-mono text-[11px] text-neutral-300">
                      Envelope {e.label}
                    </span>
                    <span className="flex items-center gap-2">
                      <Amount
                        cents={e.per_charge_cap_cents}
                        className="text-[11px] text-neutral-500"
                      />
                      <Badge tone={e.cycle === "OPEN" ? "good" : "neutral"}>
                        {e.cycle}
                      </Badge>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <Empty
              title="No spending power yet."
              hint="Approve an envelope with your passkey. It is capped per charge, locked to this marketplace, and good for one charge per week — enforced by the card network, not by us."
              cta={{ href: "/app/portfolio", label: "Approve an envelope" }}
            />
          )}
        </Card>

        <Card
          title="Open requests"
          action={
            <Link
              href="/app/needs"
              className="font-mono text-[9px] uppercase tracking-[0.2em] text-neutral-500 hover:text-neutral-300"
            >
              All
            </Link>
          }
        >
          {open.length === 0 ? (
            <Empty
              title="Nothing in flight."
              hint="Tell your agent what you need and how much you will pay. It watches for supply and buys when it appears."
              cta={{ href: "/app/needs/new", label: "New request" }}
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {open.map((n) => (
                <li key={n.id} className="flex items-center justify-between">
                  <span className="font-sans text-[13px] text-neutral-300">
                    {n.vram_gb}GB · {n.duration_h}h
                    <Mono className="ml-2 text-[11px] text-neutral-600">
                      up to ${(n.max_price_cents / 100).toFixed(2)}
                    </Mono>
                  </span>
                  <Badge tone={toneForState(n.state)}>{n.state}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Recent activity"
          action={
            <Link
              href="/app/runs"
              className="font-mono text-[9px] uppercase tracking-[0.2em] text-neutral-500 hover:text-neutral-300"
            >
              All runs
            </Link>
          }
        >
          {runs.length === 0 ? (
            <Empty title="No runs yet." />
          ) : (
            <ul className="flex flex-col gap-2">
              {runs.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3">
                  <Link
                    href={`/app/runs/${r.id}`}
                    className="truncate font-mono text-[11px] text-neutral-400 hover:text-neutral-200"
                  >
                    {r.id}
                  </Link>
                  <span className="flex shrink-0 items-center gap-2">
                    <Stamp at={r.created_at} />
                    <Badge tone={toneForState(r.state)}>{r.state}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Selling"
          action={
            <Link
              href="/app/listings"
              className="font-mono text-[9px] uppercase tracking-[0.2em] text-neutral-500 hover:text-neutral-300"
            >
              Manage
            </Link>
          }
        >
          {listings.length === 0 ? (
            <Empty
              title="Not selling anything yet."
              hint="Have spare GPUs? List them and buying agents will find you through the same registry every other supplier uses."
              cta={{ href: "/app/listings/new", label: "List capacity" }}
            />
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">
                  Earned
                </span>
                <Amount cents={earned} className="text-[15px] text-emerald-400" />
              </div>
              <ul className="flex flex-col gap-1.5 border-t border-neutral-900 pt-3">
                {listings.map((l) => (
                  <li key={l.id} className="flex items-center justify-between">
                    <span className="font-sans text-[13px] text-neutral-300">
                      {l.gpu}
                    </span>
                    <Mono className="text-[11px] text-neutral-500">
                      ${(l.rate_cents_per_hour / 100).toFixed(2)}/h
                    </Mono>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
