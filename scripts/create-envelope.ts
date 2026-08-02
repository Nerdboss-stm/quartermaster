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
  knownMandateIds,
  storeEnvelope,
  type EnvelopeLabel,
} from "../apps/console/lib/envelopes";
import { usd } from "../apps/console/lib/money";

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
  const known = await knownMandateIds();
  const { approvalUrl } = await createEnvelopeSession(label);
  console.log(
    `\n*** PASSKEY REQUIRED *** approve Envelope ${label} (card 7797, enrolled Chrome). Waiting...\n    ${approvalUrl}\n`
  );
  const mandate = await awaitNewMandate(known);
  const row = storeEnvelope(label, mandate);
  console.log(
    `envelope ${label}: ${row.id} prava=${mandate.id} merchant=${row.merchant_name} cap=${usd(row.per_charge_cap_cents)}/charge renews=${row.renews_at}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
