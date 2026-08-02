import Link from "next/link";
import { Mono } from "./primitives";

export interface Step {
  title: string;
  body: string;
  done: boolean;
  cta?: { href: string; label: string };
  /** Rendered monospace under the body: a number to text, a card to type. */
  detail?: { label: string; value: string }[];
}

/**
 * Directions, for someone who has never seen this before.
 *
 * It disappears the moment all three are done, because a checklist that
 * outlives its usefulness is clutter. Each step knows whether it is
 * finished by looking at real state — a phone that has messaged us, an
 * envelope that exists, a run that happened — so nothing here can claim
 * progress that did not occur.
 */
export default function GettingStarted({ steps }: { steps: Step[] }) {
  if (steps.every((s) => s.done)) return null;
  const next = steps.findIndex((s) => !s.done);

  return (
    <section className="border-b border-neutral-800 bg-neutral-950 px-6 py-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-neutral-600">
        Start here · {steps.filter((s) => s.done).length} of {steps.length} done
      </p>

      <ol className="mt-4 flex flex-col gap-4">
        {steps.map((step, i) => (
          <li key={step.title} className="flex gap-3">
            <span
              className={`mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center border font-mono text-[9px] ${
                step.done
                  ? "border-emerald-600 text-emerald-400"
                  : i === next
                    ? "border-neutral-400 text-neutral-200"
                    : "border-neutral-800 text-neutral-700"
              }`}
            >
              {step.done ? "✓" : i + 1}
            </span>

            <div className="min-w-0">
              <p
                className={`font-sans text-[14px] ${
                  step.done
                    ? "text-neutral-600 line-through decoration-neutral-800"
                    : i === next
                      ? "text-neutral-100"
                      : "text-neutral-500"
                }`}
              >
                {step.title}
              </p>

              {!step.done && i === next ? (
                <>
                  <p className="mt-1 max-w-xl font-sans text-[13px] leading-relaxed text-neutral-500">
                    {step.body}
                  </p>

                  {step.detail ? (
                    <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
                      {step.detail.map((d) => (
                        <div key={d.label}>
                          <dt className="font-mono text-[9px] uppercase tracking-[0.2em] text-neutral-600">
                            {d.label}
                          </dt>
                          <dd>
                            <Mono className="text-[13px] text-neutral-200">
                              {d.value}
                            </Mono>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}

                  {step.cta ? (
                    <Link
                      href={step.cta.href}
                      className="mt-3 inline-block border border-neutral-500 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-100 hover:border-neutral-300 hover:bg-neutral-900"
                    >
                      {step.cta.label}
                    </Link>
                  ) : null}
                </>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
