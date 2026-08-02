import path from "node:path";

const root = path.resolve(__dirname, "..");
try {
  process.loadEnvFile(path.join(root, ".env"));
} catch {
  // no .env; rely on ambient environment
}

import { hashPassword } from "../apps/console/lib/auth";
import { sqlAll, sqlGet, sqlRun } from "../apps/console/lib/db";
import { getListing, syncListingOffer } from "../apps/console/lib/listings";
import { createDefaultPolicy } from "../apps/console/lib/policy";

/**
 * The other side of the market.
 *
 * Compute is not only sold by data centres. Half of these are companies
 * with racks; half are people renting out the card in the spare room while
 * they sleep. They publish to the same registry Agent B does, are quoted
 * through the same endpoints, and are paid through the same ledger — the
 * buying agent cannot tell which is which, and neither can the arbiter.
 *
 * Two things are deliberately NOT seeded:
 *   - envelopes, because spending power only ever comes from a passkey;
 *   - anything above 24GB, because both demo needs ask for 40GB or more.
 *     Agent B stays the only supplier that can serve them, which is why the
 *     3 AM A100 job costs $47 and busts the cap. Seeding a cheaper big card
 *     would silently rewrite the recorded story.
 */

interface Persona {
  slug: string;
  displayName: string;
  email: string;
  /** What they are: shown to buyers browsing the market. */
  kind: "company" | "person";
  listing: {
    gpu: string;
    vramGb: number;
    rateCentsPerHour: number;
    floorCentsPerHour: number;
    maxDurationH: number;
  };
}

const PERSONAS: Persona[] = [
  {
    slug: "nimbus",
    displayName: "Nimbus Labs",
    email: "ops@nimbuslabs.example",
    kind: "company",
    listing: {
      gpu: "RTX 4090 24GB",
      vramGb: 24,
      rateCentsPerHour: 450,
      floorCentsPerHour: 380,
      maxDurationH: 12,
    },
  },
  {
    slug: "halcyon",
    displayName: "Halcyon Compute",
    email: "sales@halcyoncompute.example",
    kind: "company",
    listing: {
      gpu: "L4 24GB",
      vramGb: 24,
      rateCentsPerHour: 320,
      floorCentsPerHour: 290,
      maxDurationH: 24,
    },
  },
  {
    slug: "priya",
    displayName: "Priya Raman",
    email: "priya@example.com",
    kind: "person",
    listing: {
      gpu: "RTX 4090 24GB — spare room rig",
      vramGb: 24,
      rateCentsPerHour: 380,
      floorCentsPerHour: 330,
      maxDurationH: 8,
    },
  },
  {
    slug: "diego",
    displayName: "Diego Alvarez",
    email: "diego@example.com",
    kind: "person",
    listing: {
      gpu: "RTX 3090 24GB — garage box, idle overnight",
      vramGb: 24,
      rateCentsPerHour: 240,
      floorCentsPerHour: 200,
      maxDurationH: 6,
    },
  },
  {
    slug: "wren",
    displayName: "Wren Okafor",
    email: "wren@example.com",
    kind: "person",
    listing: {
      gpu: "RTX 4080 16GB — under the stairs",
      vramGb: 16,
      rateCentsPerHour: 190,
      floorCentsPerHour: 170,
      maxDurationH: 5,
    },
  },
];

async function seedPersona(p: Persona, passwordHash: string): Promise<string> {
  const ownerId = `usr_seed_${p.slug}`;
  const now = new Date().toISOString();

  const existing = await sqlGet<{ id: string }>(
    "SELECT id FROM users WHERE id = ?",
    [ownerId]
  );
  if (!existing) {
    await sqlRun(
      `INSERT INTO users (id, email, password_hash, display_name, phone,
         prava_customer_id, created_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?)`,
      [ownerId, p.email, passwordHash, p.displayName, `user_seed_${p.slug}`, now]
    );
    // A supplier account is still an account: give it the same starting
    // policy every buyer gets, so it is not a half-built thing on camera.
    await createDefaultPolicy(ownerId);
  }

  // Deterministic id keeps re-running this idempotent, and keeps the
  // supplier readable in a trace: ls_seed_priya, sup_usr_seed_priya.
  const listingId = `ls_seed_${p.slug}`;
  if (!(await getListing(listingId))) {
    await sqlRun(
      `INSERT INTO listings (id, owner_id, gpu, vram_gb, rate_cents_per_hour,
         floor_cents_per_hour, max_duration_h, available, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        listingId,
        ownerId,
        p.listing.gpu,
        p.listing.vramGb,
        p.listing.rateCentsPerHour,
        p.listing.floorCentsPerHour,
        p.listing.maxDurationH,
        now,
      ]
    );
  }
  // Always re-sync: the offer body carries this instance's quote URLs.
  await syncListingOffer((await getListing(listingId))!);

  return ownerId;
}

async function main(): Promise<void> {
  // No credential in the repo. Without SEED_PASSWORD these accounts exist
  // and sell, but cannot be signed into.
  const password = process.env.SEED_PASSWORD;
  const passwordHash = password ? await hashPassword(password) : "";

  for (const p of PERSONAS) {
    const ownerId = await seedPersona(p, passwordHash);
    const rate = (p.listing.rateCentsPerHour / 100).toFixed(2);
    console.log(
      `  ${p.kind === "company" ? "co " : "person"}  ${p.displayName.padEnd(18)} ${ownerId.padEnd(20)} ${p.listing.gpu} @ $${rate}/h`
    );
  }

  const offers = await sqlAll<{ id: string; agent_id: string }>(
    "SELECT id, agent_id FROM offers ORDER BY agent_id"
  );
  console.log("");
  console.log(`seed-personas: ${PERSONAS.length} suppliers, registry now holds:`);
  for (const o of offers) console.log(`  ${o.agent_id.padEnd(24)} ${o.id}`);
  console.log("");
  console.log(
    password
      ? "  sign-in enabled for these accounts (SEED_PASSWORD is set)"
      : "  sign-in disabled for these accounts (set SEED_PASSWORD to enable)"
  );
  console.log("  no envelopes seeded: spending power only ever comes from a passkey");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
