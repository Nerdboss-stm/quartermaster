import Link from "next/link";
import { notFound } from "next/navigation";
import { sqlGet } from "@/lib/db";
import ConsoleRoot from "../../_console/console-root";

export const dynamic = "force-dynamic";

/**
 * A run, published. No account needed: this is the page you send someone
 * when you want them to check your work rather than take your word for it.
 * It replays at the pace the decisions actually happened.
 */
export default async function SharedRunPage({
  params,
}: {
  params: { id: string };
}) {
  const run = await sqlGet<{ id: string; shared: number; created_at: string }>(
    "SELECT id, shared, created_at FROM runs WHERE id = ?",
    [params.id]
  );
  if (!run || run.shared !== 1) notFound();

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-neutral-800 px-6 py-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-neutral-600">
            Quartermaster · shared run
          </p>
          <p className="truncate font-mono text-[12px] text-neutral-300">
            {run.id}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/api/runs/${run.id}/bundle.json`}
            className="border border-neutral-700 px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"
          >
            Download audit bundle
          </a>
          <Link
            href="/"
            className="border border-neutral-700 px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-neutral-300 hover:border-neutral-500"
          >
            What is this?
          </Link>
        </div>
      </header>

      <div className="min-h-0 flex-1">
        <ConsoleRoot replayId={run.id} chrome={false} />
      </div>
    </div>
  );
}
