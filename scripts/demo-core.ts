import { execSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(__dirname, "..");
try {
  process.loadEnvFile(path.join(root, ".env"));
} catch {
  // no .env; rely on ambient environment
}

import { upsertOffer } from "../apps/console/lib/db";
import { OfferSchema } from "../apps/console/lib/registry";
import { runBuyerAgent } from "../apps/console/lib/agent-a";
import { seedPolicyMandate, POLICY_MANDATE_ID } from "./seed-mandate";
import { demoNeed } from "./start-run";

const AGENT_B_URL =
  process.env.AGENT_B_URL ?? "https://quartermaster-agent-b.fly.dev";

async function main() {
  console.log("demo-core: applying migrations");
  execSync("pnpm db:migrate", { cwd: root, stdio: "inherit" });

  console.log(`demo-core: mandate ${seedPolicyMandate()} (${POLICY_MANDATE_ID})`);

  console.log(`demo-core: fetching offer from ${AGENT_B_URL}/offer`);
  const res = await fetch(`${AGENT_B_URL}/offer`);
  if (!res.ok) throw new Error(`offer fetch failed: ${res.status}`);
  const offer = OfferSchema.parse(await res.json());
  upsertOffer(offer.id, offer.agentId, offer);
  console.log(`demo-core: offer ${offer.id} registered from ${offer.agentId}`);

  const need = demoNeed();
  console.log(`demo-core: need ${JSON.stringify(need)}`);
  const { runId, verdict } = await runBuyerAgent(need);

  console.log("");
  console.log(`RUN      ${runId}`);
  if (!verdict) {
    console.log("VERDICT  none (run failed)");
    process.exit(1);
  }
  console.log(`VERDICT  ${verdict.decision}`);
  for (const d of verdict.determinedBy) {
    console.log(`FAILING  ${d.path} [${d.kind}] onFail=${d.onFail}`);
    console.log(`DETAIL   ${d.detail}`);
  }
  process.exit(verdict.decision === "NEEDS_HUMAN" ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
