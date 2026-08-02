import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { sqlAll } from "@/lib/db";
import { Amount, Badge, Mono, Stamp } from "./_ui/primitives";

export const dynamic = "force-dynamic";

export default async function Landing({
  searchParams,
}: {
  searchParams: { replay?: string };
}) {
  // Old console links keep working.
  if (searchParams.replay) redirect(`/console?replay=${searchParams.replay}`);
  if (await currentUser()) redirect("/app");

  // The showcase is real history, not a mock: published runs and settled
  // charges, openable by anyone.
  const [shared, settled] = await Promise.all([
    sqlAll<{ id: string; state: string; created_at: string }>(
      "SELECT id, state, created_at FROM runs WHERE shared = 1 ORDER BY created_at DESC LIMIT 3"
    ),
    sqlAll<{ amount_cents: number; autonomous: number; at: string }>(
      "SELECT amount_cents, autonomous, at FROM ledger WHERE entry_type = 'spend' ORDER BY id DESC LIMIT 3"
    ),
  ]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-4xl flex-col px-6 py-16">
      <header className="flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-neutral-300">
          Quartermaster
        </span>
        <nav className="flex items-center gap-4">
          <Link
            href="/login"
            className="font-sans text-[13px] text-neutral-400 hover:text-neutral-200"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="border border-neutral-600 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-100 hover:border-neutral-400 hover:bg-neutral-900"
          >
            Get started
          </Link>
        </nav>
      </header>

      <section className="mt-24">
        <h1 className="max-w-2xl font-sans text-4xl leading-tight text-neutral-100">
          Give your agent an allowance.
          <span className="text-neutral-500"> Not your wallet.</span>
        </h1>
        <p className="mt-5 max-w-xl font-sans text-[15px] leading-relaxed text-neutral-400">
          Tell it what you need and the most you will pay. It finds a seller,
          haggles, and buys — inside limits you signed, enforced by the card
          network. If it wants to go further, it wakes you with a text and
          waits.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/signup"
            className="border border-neutral-400 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-100 hover:bg-neutral-900"
          >
            Give it a budget
          </Link>
          <Link
            href="/console"
            className="border border-neutral-800 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-500 hover:border-neutral-600 hover:text-neutral-300"
          >
            Watch the desk
          </Link>
        </div>
      </section>

      <section className="mt-24 grid gap-8 border-t border-neutral-900 pt-10 sm:grid-cols-3">
        <Point
          n="01"
          title="You approve once"
          body="A passkey grants a bounded envelope: capped per charge, locked to this market, one charge a week. Visa holds that line, not our code."
        />
        <Point
          n="02"
          title="Policy rules every charge"
          body="A deterministic arbiter walks your clauses before any money moves. No model decides to spend. Refusal is the default."
        />
        <Point
          n="03"
          title="You wake up to receipts"
          body="Every cent lands in an append-only ledger, attributed to the clause that allowed it and the envelope it came from."
        />
      </section>

      {settled.length > 0 ? (
        <section className="mt-20 border-t border-neutral-900 pt-10">
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-neutral-600">
            Real sandbox settlements
          </p>
          <ul className="mt-4 flex flex-col gap-2">
            {settled.map((s, i) => (
              <li key={i} className="flex flex-wrap items-center gap-3">
                <Amount
                  cents={s.amount_cents}
                  className="text-[13px] text-neutral-200"
                />
                {s.autonomous === 1 ? (
                  <Badge tone="good">no human in loop</Badge>
                ) : (
                  <Badge>approved by owner</Badge>
                )}
                <Stamp at={s.at} />
              </li>
            ))}
          </ul>

          {shared.length > 0 ? (
            <div className="mt-6">
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-neutral-600">
                Watch one happen
              </p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {shared.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/r/${r.id}`}
                      className="font-mono text-[11px] text-neutral-400 underline underline-offset-4 hover:text-neutral-200"
                    >
                      {r.id}
                    </Link>
                    <Mono className="ml-2 text-[10px] text-neutral-700">
                      {r.state}
                    </Mono>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      <footer className="mt-auto pt-20">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-700">
          Sandbox · every charge is real, no money is
        </p>
      </footer>
    </main>
  );
}

function Point({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] tracking-[0.2em] text-neutral-700">
        {n}
      </p>
      <h2 className="mt-2 font-sans text-[15px] text-neutral-200">{title}</h2>
      <p className="mt-1.5 font-sans text-[13px] leading-relaxed text-neutral-500">
        {body}
      </p>
    </div>
  );
}
