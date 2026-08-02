import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { needsForOwner } from "@/lib/needs";
import PageHeader from "../../_ui/page-header";
import { Badge, Empty, Mono, Stamp, toneForState } from "../../_ui/primitives";
import RunNow from "../../_ui/run-now";

export const dynamic = "force-dynamic";

export default async function NeedsPage() {
  const user = await requireUser();
  const needs = await needsForOwner(user.id);

  return (
    <>
      <PageHeader
        title="Requests"
        lede="Everything you have asked your agent to buy, and where each one got to."
        action={{ href: "/app/needs/new", label: "New request" }}
      />
      <div className="p-6">
        {needs.length === 0 ? (
          <Empty
            title="You have not asked for anything yet."
            hint="A request is a standing instruction: what you need, and your ceiling. Your agent watches the market and acts when it can."
            cta={{ href: "/app/needs/new", label: "New request" }}
          />
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-neutral-800 text-left">
                {["Requested", "Shape", "Ceiling", "State", ""].map((h) => (
                  <th
                    key={h}
                    className="pb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-neutral-600"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {needs.map((n) => (
                <tr key={n.id} className="border-b border-neutral-900">
                  <td className="py-2.5">
                    <Stamp at={n.created_at} />
                  </td>
                  <td className="py-2.5 font-sans text-[13px] text-neutral-300">
                    {n.vram_gb}GB · {n.duration_h}h
                  </td>
                  <td className="py-2.5">
                    <Mono className="text-[12px] text-neutral-400">
                      ${(n.max_price_cents / 100).toFixed(2)}
                    </Mono>
                  </td>
                  <td className="py-2.5">
                    <Badge tone={toneForState(n.state)}>{n.state}</Badge>
                  </td>
                  <td className="py-2.5 text-right">
                    {n.run_id ? (
                      <Link
                        href={`/app/runs/${n.run_id}`}
                        className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500 hover:text-neutral-200"
                      >
                        View run
                      </Link>
                    ) : n.state === "pending" ? (
                      <RunNow needId={n.id} />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
