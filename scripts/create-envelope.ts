import path from "node:path";

const root = path.resolve(__dirname, "..");
try {
  process.loadEnvFile(path.join(root, ".env"));
} catch {
  // no .env; rely on ambient environment
}

import {
  awaitNewMandate,
  createEnvelopeSession,
  ENVELOPE_SPECS,
  knownMandateIds,
  storeEnvelope,
  type EnvelopeLabel,
} from "../apps/console/lib/envelopes";
import { usd } from "../apps/console/lib/money";
import { DEMO_OWNER, getUser } from "../apps/console/lib/tenant";

/**
 * Force-create a fresh envelope (one passkey tap, one setup session),
 * even when an unused same-label envelope exists. Used for reruns and
 * for replacing an envelope whose credential minting is broken. The
 * newest row per label is the one the router selects.
 * Usage: pnpm tsx scripts/create-envelope.ts A|B
 */
async function main(): Promise<void> {
  const label = process.argv[2] as EnvelopeLabel;
  if (label !== "A" && label !== "B") {
    throw new Error("usage: create-envelope.ts A|B");
  }
  const demo = await getUser(DEMO_OWNER);
  if (!demo) throw new Error("demo owner missing: run pnpm db:migrate");
  const known = await knownMandateIds(demo.prava_customer_id);
  const { approvalUrl } = await createEnvelopeSession(demo, { label, ...ENVELOPE_SPECS[label] });
  console.log(
    `\n*** PASSKEY REQUIRED *** approve Envelope ${label} (team card ...2226, enrolled Chrome). Waiting...\n    ${approvalUrl}\n`
  );
  const mandate = await awaitNewMandate(demo.prava_customer_id, known);
  const row = await storeEnvelope(DEMO_OWNER, label, mandate);
  console.log(
    `envelope ${label}: ${row.id} prava=${mandate.id} merchant=${row.merchant_name} cap=${usd(row.per_charge_cap_cents)}/charge renews=${row.renews_at}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
