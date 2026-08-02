import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { sqlGet } from "@/lib/db";
import ConsoleRoot from "../../../_console/console-root";
import ShareToggle from "../../../_ui/share-toggle";

export const dynamic = "force-dynamic";

export default async function RunPage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const run = await sqlGet<{
    id: string;
    state: string;
    owner_id: string;
    shared: number;
  }>("SELECT id, state, owner_id, shared FROM runs WHERE id = ?", [params.id]);

  if (!run || run.owner_id !== user.id) notFound();

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-neutral-800 px-6 py-3">
        <div className="min-w-0">
          <Link
            href="/app/runs"
            className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-600 hover:text-neutral-400"
          >
            ← Runs
          </Link>
          <p className="truncate font-mono text-[12px] text-neutral-300">
            {run.id}
          </p>
        </div>
        <p className="hidden max-w-md font-sans text-[11px] leading-relaxed text-neutral-600 lg:block">
          The model searched, asked for prices and haggled. It never decided
          whether money could move — that is the arbiter below, and it is
          ordinary code.
        </p>
        <ShareToggle runId={run.id} shared={run.shared === 1} />
      </header>

      {/* The same cascade the operator console renders, pinned to this run:
          live while it is happening, and replayable afterwards. */}
      <div className="min-h-0 flex-1">
        <ConsoleRoot replayId={null} pinnedRunId={run.id} chrome={false} />
      </div>
    </div>
  );
}
