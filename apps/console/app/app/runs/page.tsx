import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { sqlAll } from "@/lib/db";
import PageHeader from "../../_ui/page-header";
import { Badge, Empty, Stamp, toneForState } from "../../_ui/primitives";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  const user = await requireUser();
  const runs = await sqlAll<{
    id: string;
    state: string;
    created_at: string;
    shared: number;
  }>(
    "SELECT id, state, created_at, shared FROM runs WHERE owner_id = ? ORDER BY created_at DESC LIMIT 100",
    [user.id]
  );

  return (
    <>
      <PageHeader
        title="Runs"
        lede="Every decision your agent made, replayable at the pace it actually happened."
      />
      <div className="p-6">
        {runs.length === 0 ? (
          <Empty
            title="No runs yet."
            hint="A run is one attempt to buy something: the search, the negotiation, the policy check, and what happened to the money."
            cta={{ href: "/app/needs/new", label: "New request" }}
          />
        ) : (
          <ul className="flex flex-col divide-y divide-neutral-900 border-y border-neutral-900">
            {runs.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/app/runs/${r.id}`}
                  className="flex items-center justify-between gap-4 py-3 hover:bg-neutral-900/40"
                >
                  <span className="truncate font-mono text-[12px] text-neutral-300">
                    {r.id}
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    {r.shared === 1 ? <Badge>shared</Badge> : null}
                    <Stamp at={r.created_at} />
                    <Badge tone={toneForState(r.state)}>{r.state}</Badge>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
