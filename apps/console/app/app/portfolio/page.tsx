import { requireUser } from "@/lib/auth";
import { reconcileEnvelopes } from "@/lib/envelopes";
import { portfolioMeter } from "@/lib/portfolio";
import { sandboxCardFor } from "@/lib/tenant";
import EnvelopeWizard from "../../_ui/envelope-wizard";
import PageHeader from "../../_ui/page-header";
import { Amount, Badge, Card, Meter, Mono } from "../../_ui/primitives";
import WhoHoldsTheLine from "../../_ui/who-holds-the-line";

export const dynamic = "force-dynamic";

export default async function PortfolioPage({
  searchParams,
}: {
  searchParams: { approved?: string };
}) {
  const user = await requireUser();

  // Pick up anything approved since we last looked — including approvals
  // finished on another device, or in a tab that was closed before the
  // wizard noticed. A Prava outage must not take this page down with it.
  let reconcileError: string | null = null;
  let imported: { label: string; per_charge_cap_cents: number }[] = [];
  try {
    imported = await reconcileEnvelopes(user);
  } catch (err) {
    reconcileError = String((err as Error).message ?? err);
    console.warn(`envelope reconcile failed for ${user.id}: ${reconcileError}`);
  }

  const meter = await portfolioMeter(user.id);
  const card = sandboxCardFor(user.id);

  return (
    <>
      <PageHeader
        title="Spending power"
        lede="Envelopes are how your agent holds money without holding your card. Each one is capped per charge, locked to this marketplace, and good for a single charge per weekly cycle."
      />

      {searchParams.approved || imported.length > 0 ? (
        <div className="border-b border-neutral-800 px-6 py-4">
          {imported.length > 0 ? (
            <p className="font-sans text-[15px] text-emerald-400">
              Envelope {imported.map((e) => e.label).join(" and ")} is live —{" "}
              <Amount
                cents={imported[0].per_charge_cap_cents}
                className="text-emerald-400"
              />{" "}
              per charge.
            </p>
          ) : (
            <p className="font-sans text-[15px] text-neutral-300">
              Back from Prava. Anything you approved is below.
            </p>
          )}
          <p className="mt-1 font-sans text-[12px] text-neutral-500">
            Your agent can draw on this without asking again — never above the
            cap, never more than once a week, never anywhere else.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 p-6 lg:grid-cols-2">
        <Card title="Approve a new envelope">
          <EnvelopeWizard />

          <div className="mt-6 border-t border-neutral-900 pt-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-600">
              Use this sandbox card when asked
            </p>
            <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
              <Field label="Card number" value={card.number} />
              <Field label="CVV" value={card.cvv} />
              <Field label="Expiry" value={card.expiry} />
              <Field label="One-time code" value={card.otp} />
            </dl>
            <p className="mt-3 max-w-md font-sans text-[11px] leading-relaxed text-neutral-600">
              A real card number on the Visa network, issued for sandbox
              testing and declined everywhere else. On a new browser you are
              asked for the code first, then to create a passkey; after that
              it is the passkey alone.
            </p>
          </div>
        </Card>

        <Card
          title="Your envelopes"
          action={
            <a
              href="/app/portfolio"
              className="font-mono text-[9px] uppercase tracking-[0.2em] text-neutral-500 hover:text-neutral-300"
            >
              Check again
            </a>
          }
        >
          {reconcileError ? (
            <p className="mb-3 border-l-2 border-red-500 pl-2 font-mono text-[11px] leading-relaxed text-red-400">
              Could not reach Prava to check for approvals, so this list may be
              incomplete. Nothing was lost — reload to try again.
              <span className="mt-1 block text-neutral-600">
                {reconcileError}
              </span>
            </p>
          ) : null}
          {meter.envelopes.length === 0 ? (
            <p className="py-6 font-sans text-[13px] text-neutral-500">
              None yet. Approving one takes about eight seconds. If you just
              approved one, use Check again.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              <Meter
                label="Drawn this cycle"
                spentCents={meter.portfolio.spent_cents}
                capCents={meter.portfolio.cap_cents}
              />
              <div className="flex flex-col divide-y divide-neutral-900 border-t border-neutral-900">
                {meter.envelopes.map((e) => (
                  <div key={e.prava_mandate_id} className="py-3">
                    <div className="flex items-center justify-between">
                      <span className="font-sans text-[13px] text-neutral-200">
                        Envelope {e.label}
                      </span>
                      <Badge tone={e.cycle === "OPEN" ? "good" : "neutral"}>
                        {e.cycle === "OPEN" ? "ready" : "used this cycle"}
                      </Badge>
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <Mono className="text-[11px] text-neutral-500">
                        {e.prava_mandate_id}
                      </Mono>
                      <span className="font-mono text-[11px] tabular-nums text-neutral-500">
                        <Amount cents={e.per_charge_cap_cents} /> per charge
                      </span>
                    </div>
                    <p className="mt-1 font-sans text-[11px] text-neutral-600">
                      Renews {new Date(e.renews_at).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        <div className="lg:col-span-2">
          <WhoHoldsTheLine />
        </div>
      </div>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-[9px] uppercase tracking-[0.2em] text-neutral-600">
        {label}
      </dt>
      <dd>
        <Mono className="text-[13px] text-neutral-200">{value}</Mono>
      </dd>
    </div>
  );
}
