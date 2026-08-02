import { requireUser } from "@/lib/auth";
import { listingsForOwner, salesForOwner } from "@/lib/listings";
import PageHeader from "../../_ui/page-header";
import { Amount, Badge, Card, Empty, Mono, Stamp } from "../../_ui/primitives";

export const dynamic = "force-dynamic";

export default async function ListingsPage() {
  const user = await requireUser();
  const [listings, sales] = await Promise.all([
    listingsForOwner(user.id),
    salesForOwner(user.id),
  ]);
  const earned = sales.reduce((sum, s) => sum + s.amount_cents, 0);

  return (
    <>
      <PageHeader
        title="My capacity"
        lede="What you are selling, and what it has earned."
        action={{ href: "/app/listings/new", label: "List capacity" }}
      />

      <div className="grid gap-4 p-6 lg:grid-cols-2">
        <Card title="Listings">
          {listings.length === 0 ? (
            <Empty
              title="Nothing listed."
              hint="A listing is discoverable the moment you publish it — and if someone's agent is already waiting for what you have, it may buy within seconds."
              cta={{ href: "/app/listings/new", label: "List capacity" }}
            />
          ) : (
            <ul className="flex flex-col divide-y divide-neutral-900">
              {listings.map((l) => (
                <li key={l.id} className="py-3">
                  <div className="flex items-center justify-between">
                    <span className="font-sans text-[13px] text-neutral-200">
                      {l.gpu}
                    </span>
                    <Badge tone={l.available === 1 ? "good" : "neutral"}>
                      {l.available === 1 ? "live" : "paused"}
                    </Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 font-mono text-[11px] tabular-nums text-neutral-500">
                    <span>{l.vram_gb}GB</span>
                    <span>${(l.rate_cents_per_hour / 100).toFixed(2)}/h</span>
                    <span className="text-neutral-700">
                      floor ${(l.floor_cents_per_hour / 100).toFixed(2)}/h
                    </span>
                    <span className="text-neutral-700">
                      max {l.max_duration_h}h
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Sales">
          {sales.length === 0 ? (
            <Empty
              title="No sales yet."
              hint="When a buyer's agent picks your listing, the payment lands here — settled through the card network, not an IOU."
            />
          ) : (
            <>
              <div className="mb-3 flex items-baseline justify-between border-b border-neutral-900 pb-3">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">
                  Total earned
                </span>
                <Amount cents={earned} className="text-[18px] text-emerald-400" />
              </div>
              <ul className="flex flex-col divide-y divide-neutral-900">
                {sales.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <span className="min-w-0">
                      <Stamp at={s.at} />
                      {s.merchant_ref ? (
                        <Mono className="ml-2 text-[10px] text-neutral-600">
                          {s.merchant_ref}
                        </Mono>
                      ) : null}
                    </span>
                    <Amount
                      cents={s.amount_cents}
                      className="text-[13px] text-neutral-100"
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>
    </>
  );
}
