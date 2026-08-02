import path from "node:path";

const root = path.resolve(__dirname, "..");
try {
  process.loadEnvFile(path.join(root, ".env"));
} catch {
  // no .env; rely on ambient environment
}

import { hashPassword } from "../apps/console/lib/auth";
import { sqlGet, sqlRun } from "../apps/console/lib/db";
import { DEMO_OWNER, normalizePhone } from "../apps/console/lib/tenant";

/**
 * Makes the demo account loginable and reachable.
 *
 * It already owns every pre-tenancy row (migration 005 backfills to it), so
 * signing in as this account shows the real recorded history — which is
 * what a judge opening the showcase should see. Its phone is the number the
 * Linq webhook maps replies back from.
 */
async function main(): Promise<void> {
  const email = process.env.DEMO_EMAIL ?? "demo@quartermaster.app";
  const password = process.env.DEMO_PASSWORD ?? "quartermaster";
  const phone = process.env.LINQ_TO_NUMBER;

  const existing = await sqlGet<{ id: string }>(
    "SELECT id FROM users WHERE id = ?",
    [DEMO_OWNER]
  );
  if (!existing) {
    throw new Error(`${DEMO_OWNER} missing: run pnpm db:migrate first`);
  }

  await sqlRun(
    "UPDATE users SET email = ?, password_hash = ?, phone = ? WHERE id = ?",
    [
      email.toLowerCase(),
      await hashPassword(password),
      phone ? normalizePhone(phone) : null,
      DEMO_OWNER,
    ]
  );

  console.log(`seed-demo-user: ${DEMO_OWNER} ready`);
  console.log(`  email ${email}`);
  console.log(`  phone ${phone ? normalizePhone(phone) : "(none — inbox only)"}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
