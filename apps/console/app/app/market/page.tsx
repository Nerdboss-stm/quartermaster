import { requireUser } from "@/lib/auth";
import { marketRows } from "@/lib/market";
import PageHeader from "../../_ui/page-header";
import { Badge, Empty, Mono } from "../../_ui/primitives";

export const dynamic = "force-dynamic";

export default async function MarketPage() {
  await requireUser();
  const rows = await marketRows();

  return (
    <>
      <PageHeader
        title="Market"
        lede="Everything your agent can see right now — read from the same registry it queries, cheapest first. Some of it is a company with racks; some of it is a person renting out the card in their spare room."
        action={{ href: "/app/needs/new", label: "Post a need" }}
      />

      <div className="p-6">
        {rows.length === 0 ? (
          <Empty
            title="Nobody is selling yet."
            hint="Suppliers publish capacity from their own account. Until one does, your agent has nothing to buy — and it will wait rather than improvise."
            cta={{ href: "/app/listings/new", label: "List capacity" }}
          />
        ) : (
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr className="text-left">
                {["Seller", "Hardware", "Memory", "Rate", "Longest"].map((h) => (
                  <th
                    key={h}
                    className="border-b border-neutral-800 pb-2 font-mono text-[10px] uppercase tracking-[0.2em] font-normal text-neutral-600"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.offerId}-${i}`}>
                  <td className="border-b border-neutral-900 py-2.5 pr-4">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-sans text-[13px] text-neutral-200">
                        {r.seller}
                      </span>
                      {r.kind === "merchant" ? (
                        <Badge>own host</Badge>
                      ) : null}
                      {r.sample ? <Badge>sample seller</Badge> : null}
                    </span>
                    <Mono className="text-[10px] text-neutral-700">
                      {r.agentId}
                    </Mono>
                  </td>
                  <td className="border-b border-neutral-900 py-2.5 pr-4 font-sans text-[13px] text-neutral-400">
                    {r.gpu}
                  </td>
                  <td className="border-b border-neutral-900 py-2.5 pr-4 font-mono text-[12px] tabular-nums text-neutral-500">
                    {r.vramGb} GB
                  </td>
                  <td className="border-b border-neutral-900 py-2.5 pr-4 font-mono text-[13px] tabular-nums text-neutral-100">
                    ${(r.rateCentsPerHour / 100).toFixed(2)}
                    <span className="text-neutral-600">/h</span>
                  </td>
                  <td className="border-b border-neutral-900 py-2.5 font-mono text-[12px] tabular-nums text-neutral-500">
                    {r.maxDurationH} h
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <p className="mt-4 max-w-2xl font-sans text-[12px] leading-relaxed text-neutral-600">
          These are advertised rates. Your agent asks each seller for a firm
          quote and may haggle once — what comes back is the price the arbiter
          rules on, never the number on this page.
        </p>
        {rows.some((r) => r.sample) ? (
          <p className="mt-2 max-w-2xl font-sans text-[12px] leading-relaxed text-neutral-600">
            Sellers marked <span className="text-neutral-400">sample seller</span>{" "}
            are seeded accounts, not real people, so the market is not empty
            while this is a sandbox. They quote and negotiate with exactly the
            same code a real seller would.
          </p>
        ) : null}
      </div>
    </>
  );
}
