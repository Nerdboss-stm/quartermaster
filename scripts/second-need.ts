import path from "node:path";

const root = path.resolve(__dirname, "..");
try {
  process.loadEnvFile(path.join(root, ".env"));
} catch {
  // no .env; rely on ambient environment
}

import { runBuyerAgent } from "../apps/console/lib/agent-a";
import { usd } from "../apps/console/lib/money";
import { portfolioMeter } from "../apps/console/lib/portfolio";
import type { Need } from "../apps/console/lib/registry";
import { settleRun } from "../apps/console/lib/settlement";

/** Beat 11: the hours-later incidental. Prices to exactly 1800c against
 *  agent B's list (L40S 48GB x 2h x 900c), within budget, so no
 *  negotiation triggers and the loop runs with zero human touches. */
export function secondNeed(): Need {
  return {
    vramGb: 40,
    durationH: 2,
    deadline: new Date(Date.now() + 12 * 3_600_000).toISOString(),
    maxPriceCents: 2000,
  };
}

export async function runSecondNeed(): Promise<void> {
  const { runId, verdict } = await runBuyerAgent(secondNeed());
  if (!verdict || verdict.decision !== "EXECUTE") {
    throw new Error(
      `beat 11 expected EXECUTE, got ${verdict?.decision ?? "no verdict"}: failing closed`
    );
  }
  const s = await settleRun(runId, verdict.proposalId, verdict, {
    autonomous: true,
  });
  console.log(`settled autonomously [NO HUMAN IN LOOP]: ${s.receiptText}`);
  const meter = portfolioMeter();
  console.log(
    `portfolio: ${usd(meter.portfolio.spent_cents)} of ${usd(meter.portfolio.cap_cents)} this cycle`
  );
}

if (require.main === module) {
  runSecondNeed().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
