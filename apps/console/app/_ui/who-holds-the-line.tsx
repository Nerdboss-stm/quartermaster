import { Card } from "./primitives";

/**
 * Two locks, named.
 *
 * The distinction this product is built on is invisible unless you say it:
 * one limit is ours and can be changed by the owner in a minute; the other
 * is the card network's and cannot be changed by anyone here, including us.
 * A judge, an auditor and a nervous first-time user all want the same
 * answer — what happens if your code is wrong?
 */
export default function WhoHoldsTheLine() {
  return (
    <Card title="Who holds the line">
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">
            Lock 1 · your policy
          </p>
          <p className="mt-1 font-sans text-[13px] text-neutral-300">
            Checked on every single charge
          </p>
          <ul className="mt-3 flex flex-col gap-1.5 font-sans text-[12px] leading-relaxed text-neutral-500">
            <li>Most per purchase, and most in total</li>
            <li>What may be bought, and from whom</li>
            <li>Whether to refuse outright or wake you</li>
          </ul>
          <p className="mt-3 font-sans text-[11px] leading-relaxed text-neutral-600">
            Enforced by a deterministic arbiter in this codebase. No model
            takes part in the decision. You can change these rules yourself,
            and every version is kept.
          </p>
        </div>

        <div className="sm:border-l sm:border-neutral-900 sm:pl-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">
            Lock 2 · the card network
          </p>
          <p className="mt-1 font-sans text-[13px] text-neutral-300">
            Approved once, with your passkey
          </p>
          <ul className="mt-3 flex flex-col gap-1.5 font-sans text-[12px] leading-relaxed text-neutral-500">
            <li>A hard cap on any single charge</li>
            <li>Locked to this marketplace and nowhere else</li>
            <li>One charge per envelope, per weekly cycle</li>
          </ul>
          <p className="mt-3 font-sans text-[11px] leading-relaxed text-neutral-600">
            Enforced by Visa, outside this codebase. If everything here were
            wrong at once — the arbiter, the router, the ledger — these three
            limits would still hold, and we could not lift them for you.
          </p>
        </div>
      </div>

      <p className="mt-5 border-t border-neutral-900 pt-3 font-sans text-[12px] leading-relaxed text-neutral-600">
        Loosening Lock 1 never loosens Lock 2. More spending power always
        costs another passkey.
      </p>
    </Card>
  );
}
