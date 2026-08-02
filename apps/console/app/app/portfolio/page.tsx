import { requireUser } from "@/lib/auth";
import { portfolioMeter } from "@/lib/portfolio";
import EnvelopeWizard from "../../_ui/envelope-wizard";
import PageHeader from "../../_ui/page-header";
import { Amount, Badge, Card, Meter, Mono } from "../../_ui/primitives";

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const user = await requireUser();
  const meter = await portfolioMeter(user.id);

  return (
    <>
      <PageHeader
        title="Spending power"
        lede="Envelopes are how your agent holds money without holding your card. Each one is capped per charge, locked to this marketplace, and good for a single charge per weekly cycle."
      />

      <div className="grid gap-4 p-6 lg:grid-cols-2">
        <Card title="Approve a new envelope">
          <EnvelopeWizard />
        </Card>

        <Card title="Your envelopes">
          {meter.envelopes.length === 0 ? (
            <p className="py-6 font-sans text-[13px] text-neutral-500">
              None yet. Approving one takes about eight seconds.
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
      </div>
    </>
  );
}
