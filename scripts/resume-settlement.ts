import path from "node:path";

const root = path.resolve(__dirname, "..");
try {
  process.loadEnvFile(path.join(root, ".env"));
} catch {
  // no .env; rely on ambient environment
}

import type { Verdict } from "mandate-arbiter";
import { db } from "../apps/console/lib/db";
import { usd } from "../apps/console/lib/money";
import { settleRun } from "../apps/console/lib/settlement";
import { runSecondNeed } from "./second-need";
import { printLedger, printMeter } from "./report";

/**
 * Resume a demo run whose EXECUTE verdict exists but whose settlement
 * failed upstream (e.g. a transient credential-mint error). A failed
 * charge clears its idempotency key, so exactly one fresh attempt is
 * made; every guard in settleRun still applies. Usage:
 *   pnpm tsx scripts/resume-settlement.ts <runId> [--skip-beat-11]
 */
async function main(): Promise<void> {
  const runId = process.argv[2];
  if (!runId) throw new Error("usage: resume-settlement.ts <runId>");

  const rows = db()
    .prepare("SELECT body FROM trace_events WHERE run_id = ? ORDER BY id DESC")
    .all(runId) as { body: string }[];
  let verdict: Verdict | null = null;
  for (const row of rows) {
    const body = JSON.parse(row.body) as { type?: string; verdict?: Verdict };
    if (body.type === "verdict_full" && body.verdict) {
      verdict = body.verdict;
      break;
    }
  }
  if (!verdict) throw new Error(`no verdict recorded for ${runId}: failing closed`);
  if (verdict.decision !== "EXECUTE") {
    throw new Error(`latest verdict is ${verdict.decision}, not EXECUTE: failing closed`);
  }

  console.log(`resuming ${runId}: EXECUTE on ${verdict.proposalId} under ${verdict.mandateId}`);
  const s1 = await settleRun(runId, verdict.proposalId, verdict, {
    autonomous: false,
  });
  console.log(
    `settled: ${usd(s1.amountCents)} from Envelope ${s1.envelope.label} ref=${s1.merchantRef} txn=${s1.transactionId} [${s1.mode.toUpperCase()}]`
  );

  if (!process.argv.includes("--skip-beat-11")) {
    console.log("\n=== BEAT 11: Hours later. Second need. ZERO human touches ===");
    await runSecondNeed();
  }

  console.log("\n=== BEAT 12: The ledger and the portfolio meter ===");
  printLedger();
  printMeter();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
