import { sqlAll } from "../apps/console/lib/db";
import { usd } from "../apps/console/lib/money";
import { portfolioMeter } from "../apps/console/lib/portfolio";
import { DEMO_OWNER } from "../apps/console/lib/tenant";

export async function printLedger(): Promise<void> {
  const rows = await sqlAll<Record<string, unknown>>(
    "SELECT id, run_id, mandate_id, envelope_id, entry_type, autonomous, amount_cents, currency, mode, prava_txn_id, merchant_ref, at FROM ledger ORDER BY id"
  );
  console.log("\nLEDGER");
  for (const r of rows) {
    console.log(
      [
        String(r.id).padStart(3, " "),
        r.at,
        String(r.entry_type).padEnd(9, " "),
        usd(r.amount_cents as number).padStart(8, " "),
        String(r.mode).toUpperCase(),
        r.autonomous ? "NO-HUMAN-IN-LOOP" : "human-touched",
        `mandate=${r.mandate_id}`,
        r.envelope_id ? `envelope=${r.envelope_id}` : "envelope=-",
        r.prava_txn_id ? `txn=${r.prava_txn_id}` : "",
        r.merchant_ref ? `ref=${r.merchant_ref}` : "",
      ].join("  ")
    );
  }
}

export async function printMeter(): Promise<void> {
  const meter = await portfolioMeter(DEMO_OWNER);
  console.log(`\nPORTFOLIO [${meter.environment}]`);
  for (const e of meter.envelopes) {
    console.log(
      `  Envelope ${e.label}: ${e.cycle.padEnd(4, " ")} spent ${usd(e.spent_cents)} of ${usd(e.per_charge_cap_cents)}/charge  renews ${e.renews_at}  ${e.prava_mandate_id}`
    );
  }
  console.log(
    `  PORTFOLIO ${usd(meter.portfolio.spent_cents)} OF ${usd(meter.portfolio.cap_cents)} THIS CYCLE`
  );
  if (meter.policy) {
    console.log(
      `  POLICY CUMULATIVE ${usd(meter.policy.cumulative_cents)} OF ${meter.policy.cap_cents !== null ? usd(meter.policy.cap_cents) : "?"}`
    );
  }
}
