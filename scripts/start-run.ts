import path from "node:path";

const root = path.resolve(__dirname, "..");
try {
  process.loadEnvFile(path.join(root, ".env"));
} catch {
  // no .env; rely on ambient environment
}

import { runBuyerAgent } from "../apps/console/lib/agent-a";
import { DEMO_OWNER } from "../apps/console/lib/tenant";
import type { Need } from "../apps/console/lib/registry";

/** Beat 2-8 demo need: prices to exactly 4700c against agent B's list. */
export function demoNeed(): Need {
  return {
    vramGb: 80,
    durationH: 4,
    deadline: new Date(Date.now() + 12 * 3_600_000).toISOString(),
    maxPriceCents: 4000,
  };
}

async function main() {
  const need = demoNeed();
  console.log(`start-run: need ${JSON.stringify(need)}`);
  const { runId, verdict } = await runBuyerAgent(need, DEMO_OWNER);
  console.log(`start-run: ${runId} -> ${verdict ? verdict.decision : "NO VERDICT (failed)"}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
