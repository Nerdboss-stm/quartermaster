import { listApiKeys } from "@/lib/api-keys";
import { requireUser } from "@/lib/auth";
import KeyManager from "../../_ui/key-manager";
import PageHeader from "../../_ui/page-header";
import { Card, Empty, Mono, Stamp } from "../../_ui/primitives";

export const dynamic = "force-dynamic";

export default async function DevelopersPage() {
  const user = await requireUser();
  const keys = await listApiKeys(user.id);
  const base = process.env.CONSOLE_URL ?? "http://localhost:3000";

  return (
    <>
      <PageHeader
        title="Agent access"
        lede="Your own agents can buy through this account over HTTP. The rules do not change for them: the arbiter still rules on every quote, the router still picks the envelope, and a refusal still reaches your phone."
      />

      <div className="grid gap-4 p-6 lg:grid-cols-2">
        <Card title="Issue a key">
          <KeyManager />
        </Card>

        <Card title="Your keys">
          {keys.length === 0 ? (
            <Empty
              title="No keys yet."
              hint="A request with no key is treated as the public demo account — useful for trying the endpoints, useless for spending, because that account's envelopes are not yours."
            />
          ) : (
            <ul className="flex flex-col divide-y divide-neutral-900">
              {keys.map((k) => (
                <li
                  key={k.id}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-sans text-[13px] text-neutral-200">
                      {k.label}
                    </span>
                    <Mono className="text-[10px] text-neutral-600">{k.id}</Mono>
                  </span>
                  <Stamp at={k.created_at} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Speaking NANDA" className="lg:col-span-2">
          <p className="max-w-2xl font-sans text-[13px] leading-relaxed text-neutral-400">
            These endpoints implement the NANDA <Mono>Payments</Mono> protocol —
            quote, pay, verify, refund — so an agent built on their runtime can
            spend here without knowing anything about Prava, envelopes or
            mandates. It gets a refusal it can act on instead of a stack trace.
          </p>
          <pre className="mt-4 overflow-x-auto border border-neutral-900 bg-black p-3 font-mono text-[11px] leading-relaxed text-neutral-400">
            {`curl -X POST ${base}/api/nanda/quote \\
  -H 'content-type: application/json' \\
  -H 'x-api-key: qm_live_...' \\
  -d '{"vramGb": 48, "durationH": 2, "maxPriceCents": 2000,
       "deadline": "${new Date(Date.now() + 12 * 3_600_000).toISOString()}"}'`}
          </pre>
          <p className="mt-3 max-w-2xl font-sans text-[12px] leading-relaxed text-neutral-600">
            Send the key as <Mono>x-api-key</Mono> or a bearer token. Keys are
            stored hashed; if one goes missing, issue another and stop using the
            old one.
          </p>
        </Card>
      </div>
    </>
  );
}
