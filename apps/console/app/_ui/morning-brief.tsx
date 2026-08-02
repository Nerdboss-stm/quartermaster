import Link from "next/link";
import type { Brief } from "@/lib/brief";
import { Amount, Badge, Mono } from "./primitives";

/**
 * The first thing you see after closing the laptop and coming back.
 *
 * Reads as a sentence, not a dashboard: what your agent did, what it
 * refused to do without you, and what it earned you. Silent when nothing
 * happened, because a band that says "nothing happened" is furniture.
 */
export default function MorningBrief({ brief }: { brief: Brief }) {
  if (brief.items.length === 0) return null;

  // A brief that scrolls is not a brief. Three of each, then a count.
  const all = {
    bought: brief.items.filter((i) => i.kind === "bought"),
    waiting: brief.items.filter((i) => i.kind === "waiting"),
  };
  const bought = all.bought.slice(0, 3);
  const waiting = all.waiting.slice(0, 3);
  const hidden =
    all.bought.length - bought.length + (all.waiting.length - waiting.length);
  const sold = brief.items.filter((i) => i.kind === "sold");

  return (
    <section className="border-b border-neutral-800 bg-neutral-950 px-6 py-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-neutral-600">
        While you were away
      </p>

      <div className="mt-3 flex flex-col gap-2">
        {bought.map((i, n) => (
          <p key={`b${n}`} className="font-sans text-[15px] text-neutral-200">
            Bought <Amount cents={i.amountCents ?? 0} className="text-emerald-400" />
            {i.counterparty ? (
              <>
                {" from "}
                <span className="text-neutral-100">{i.counterparty}</span>
              </>
            ) : null}
            {i.autonomous ? (
              <span className="ml-2 align-middle">
                <Badge tone="good">no human in loop</Badge>
              </span>
            ) : null}
            {i.runId ? (
              <Link
                href={`/app/runs/${i.runId}`}
                className="ml-2 font-mono text-[11px] text-neutral-600 underline underline-offset-4 hover:text-neutral-400"
              >
                see it
              </Link>
            ) : null}
          </p>
        ))}

        {waiting.map((i, n) => (
          <p key={`w${n}`} className="font-sans text-[15px] text-amber-400">
            Stopped and asked you.
            {i.counterparty ? (
              <Mono className="ml-2 text-[12px] text-amber-300/80">
                {i.counterparty}
              </Mono>
            ) : null}
            <Link
              href="/app/escalations"
              className="ml-2 font-mono text-[11px] text-neutral-500 underline underline-offset-4 hover:text-neutral-300"
            >
              answer it
            </Link>
          </p>
        ))}

        {sold.length > 0 ? (
          <p className="font-sans text-[15px] text-neutral-200">
            Someone bought your capacity —{" "}
            <Amount
              cents={sold.reduce((s, i) => s + (i.amountCents ?? 0), 0)}
              className="text-emerald-400"
            />{" "}
            <span className="text-neutral-500">
              while you were not watching.
            </span>
          </p>
        ) : null}

        {hidden > 0 ? (
          <p className="font-sans text-[13px] text-neutral-600">
            and {hidden} more.{" "}
            <Link
              href="/app/runs"
              className="underline underline-offset-4 hover:text-neutral-400"
            >
              All runs
            </Link>
          </p>
        ) : null}
      </div>

      {brief.slept ? (
        <p className="mt-3 font-sans text-[12px] text-neutral-600">
          That purchase happened without waking you. It could not have gone a
          cent over your cap, and it could not have gone to anyone else.
        </p>
      ) : null}
    </section>
  );
}
