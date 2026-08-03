import path from "node:path";

const root = path.resolve(__dirname, "..");
try {
  process.loadEnvFile(path.join(root, ".env"));
} catch {
  // no .env; rely on ambient environment
}

import { runBuyerAgent } from "../apps/console/lib/agent-a";
import { sqlRun } from "../apps/console/lib/db";
import { usd } from "../apps/console/lib/money";
import { portfolioMeter } from "../apps/console/lib/portfolio";
import type { Need } from "../apps/console/lib/registry";
import { settleRun } from "../apps/console/lib/settlement";

/**
 * Put one real, completed purchase on the deployed database.
 *
 * Everything the product claims — a charge on the network, a merchant
 * paid, a receipt attributed to a clause and an envelope — was only ever
 * true in a local file. A judge opens the hosted URL, and the hosted
 * ledger was empty. This runs the ordinary path against production: the
 * agent negotiates, the arbiter rules, the router picks the envelope, and
 * settlement happens or fails closed. Nothing here bypasses a decision.
 *
 * Costs exactly one sandbox transaction. Usage:
 *   OWNER=usr_xxx pnpm prove:settlement
 */
function need(): Need {
  return {
    vramGb: 40,
    durationH: 2,
    deadline: new Date(Date.now() + 12 * 3_600_000).toISOString(),
    maxPriceCents: 2000,
  };
}

async function main(): Promise<void> {
  const owner = process.env.OWNER;
  if (!owner) throw new Error("OWNER is required");

  console.log(`prove-settlement: buying as ${owner}`);
  const { runId, verdict } = await runBuyerAgent(need(), owner);
  console.log(`  run ${runId}`);
  if (!verdict) throw new Error("no verdict: failing closed");
  console.log(`  verdict ${verdict.decision}`);
  for (const d of verdict.determinedBy) console.log(`  ${d.path} ${d.detail}`);

  if (verdict.decision !== "EXECUTE") {
    throw new Error(`expected EXECUTE, got ${verdict.decision}: nothing charged`);
  }

  const settlement = await settleRun(runId, verdict.proposalId, verdict, {
    autonomous: true,
  });
  console.log("");
  console.log(`SETTLED   ${usd(settlement.amountCents)} [NO HUMAN IN LOOP]`);
  console.log(`ENVELOPE  ${settlement.envelope.label} ${settlement.envelope.prava_mandate_id}`);
  console.log(`TXN       ${settlement.transactionId}`);
  console.log(`ORDER     ${settlement.merchantRef}`);
  console.log(`MODE      ${settlement.mode.toUpperCase()}`);

  // Publish it: this is the run a judge opens without an account.
  await sqlRun("UPDATE runs SET shared = 1 WHERE id = ?", [runId]);
  console.log(`SHARED    /r/${runId}`);

  const meter = await portfolioMeter(owner);
  console.log(
    `PORTFOLIO ${usd(meter.portfolio.spent_cents)} of ${usd(meter.portfolio.cap_cents)} this cycle`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
