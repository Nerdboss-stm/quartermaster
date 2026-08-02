import type { PravaMandate } from "@quartermaster/prava-client";
import { sqlAll, sqlGet, sqlRun } from "./db";
import { merchantForOwner, type UserRow } from "./tenant";
import { prava } from "./prava";

export interface EnvelopeRow {
  id: string;
  label: string;
  prava_mandate_id: string;
  merchant_name: string;
  per_charge_cap_cents: number;
  renews_at: string;
  created_at: string;
}

export const ENVELOPE_SPECS = {
  A: { totalCents: 6000, product: "GPU compute envelope" },
  B: { totalCents: 2000, product: "Incidentals envelope" },
} as const;

export type EnvelopeLabel = keyof typeof ENVELOPE_SPECS;

export interface EnvelopeSpec {
  label: string;
  totalCents: number;
  product: string;
}

/**
 * Opens a Prava mandate-setup session. The owner approves it with their
 * passkey; that approval is the only thing standing between an agent and
 * this money, and it is never automated. The cap is whatever the owner
 * chose — the fixed A/B specs below are only the demo's defaults.
 */
export async function createEnvelopeSession(
  owner: UserRow,
  spec: EnvelopeSpec
): Promise<{ approvalUrl: string }> {
  const consoleUrl = process.env.CONSOLE_URL ?? "http://localhost:3000";
  const { approvalUrl } = await prava().createMandateSetupSession({
    userId: owner.prava_customer_id,
    userEmail: owner.email,
    totalAmountCents: spec.totalCents,
    merchant: merchantForOwner(owner.id),
    productDescription: spec.product,
    recurringFrequency: "weekly",
    maxCharges: 4,
    validUntil: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    callbackUrl: `${consoleUrl.replace(/\/$/, "")}/api/prava/callback`,
  });
  return { approvalUrl };
}

export async function knownMandateIds(customerId: string): Promise<Set<string>> {
  const mandates = await prava().listMandates(customerId);
  return new Set(mandates.map((m) => m.id));
}

/** Poll List Mandates until a new active standing mandate appears (this is
 *  how the mandate id is discovered after passkey approval). */
export async function awaitNewMandate(
  customerId: string,
  known: Set<string>,
  timeoutMs = 6 * 60_000
): Promise<PravaMandate> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const mandates = await prava().listMandates(customerId);
    const fresh = mandates.find(
      (m) =>
        !known.has(m.id) &&
        (m.status === "active" || m.state === "available")
    );
    if (fresh) return fresh;
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`no new mandate appeared within ${timeoutMs}ms: failing closed`);
}

export async function storeEnvelope(
  ownerId: string,
  label: string,
  m: PravaMandate
): Promise<EnvelopeRow> {
  const row: EnvelopeRow = {
    id: `env_${label.toLowerCase()}_${Date.now()}`,
    label,
    prava_mandate_id: m.id,
    merchant_name: m.merchantName,
    per_charge_cap_cents: Math.round(Number.parseFloat(m.approvedAmount) * 100),
    renews_at: m.renewsAt,
    created_at: new Date().toISOString(),
  };
  await sqlRun(
    `INSERT INTO envelopes (id, label, prava_mandate_id, merchant_name, per_charge_cap_cents, renews_at, created_at, owner_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.label,
      row.prava_mandate_id,
      row.merchant_name,
      row.per_charge_cap_cents,
      row.renews_at,
      row.created_at,
      ownerId,
    ]
  );
  return row;
}

/** The next unused single-letter label for this account. */
async function nextLabel(ownerId: string): Promise<string> {
  const rows = await sqlAll<{ label: string }>(
    "SELECT label FROM envelopes WHERE owner_id = ?",
    [ownerId]
  );
  const taken = new Set(rows.map((r) => r.label));
  for (let i = 0; i < 26; i++) {
    const label = String.fromCharCode(65 + i);
    if (!taken.has(label)) return label;
  }
  return `E${rows.length + 1}`;
}

/**
 * Import every approved envelope this account has at Prava that we do not
 * already hold.
 *
 * Approval happens in Prava's window, on whatever device the owner
 * happens to be holding, and we are told about it by a redirect that may
 * never reach the tab that started it. So discovery cannot live in a
 * polling loop in one browser tab: closing it, refreshing it, or finishing
 * the passkey on a phone all used to lose the envelope entirely — the
 * money was approved and the product acted as though it never happened.
 *
 * This runs on the page that shows envelopes, so simply looking at
 * Spending power is enough to pick up anything that was approved. It is
 * idempotent: mandates already stored are skipped by id.
 */
export async function reconcileEnvelopes(
  owner: UserRow
): Promise<EnvelopeRow[]> {
  const known = new Set(
    (
      await sqlAll<{ prava_mandate_id: string }>(
        "SELECT prava_mandate_id FROM envelopes WHERE owner_id = ?",
        [owner.id]
      )
    ).map((r) => r.prava_mandate_id)
  );

  const mandates = await prava().listMandates(owner.prava_customer_id);
  const imported: EnvelopeRow[] = [];
  for (const m of mandates) {
    if (known.has(m.id)) continue;
    if (m.status !== "active" && m.state !== "available") continue;
    imported.push(await storeEnvelope(owner.id, await nextLabel(owner.id), m));
    console.log(`envelope reconciled for ${owner.id}: ${m.id}`);
  }
  return imported;
}

export function cycleStartIso(env: EnvelopeRow): string {
  return new Date(Date.parse(env.renews_at) - 7 * 86_400_000).toISOString();
}

export async function envelopeSpentThisCycle(env: EnvelopeRow): Promise<number> {
  const row = await sqlGet<{ total: number }>(
    `SELECT COALESCE(SUM(amount_cents), 0) AS total FROM ledger
     WHERE entry_type = 'spend' AND envelope_id = ? AND at >= ?`,
    [env.id, cycleStartIso(env)]
  );
  return Number(row?.total ?? 0);
}

/** OUR ledger decides cycle eligibility, before any Prava call (hard law 3). */
export async function envelopeCycleOpen(env: EnvelopeRow): Promise<boolean> {
  const row = await sqlGet<{ n: number }>(
    `SELECT COUNT(*) AS n FROM ledger
     WHERE entry_type = 'spend' AND envelope_id = ? AND at >= ?`,
    [env.id, cycleStartIso(env)]
  );
  return Number(row?.n ?? 0) === 0;
}

/** Newest envelope per label whose cycle window is still current. */
export async function currentEnvelopes(ownerId: string): Promise<EnvelopeRow[]> {
  const rows = await sqlAll<EnvelopeRow>(
    "SELECT * FROM envelopes WHERE owner_id = ? ORDER BY label ASC, created_at DESC",
    [ownerId]
  );
  const seen = new Set<string>();
  const out: EnvelopeRow[] = [];
  const now = Date.now();
  for (const row of rows) {
    if (seen.has(row.label)) continue;
    if (Date.parse(row.renews_at) <= now) continue;
    seen.add(row.label);
    out.push(row);
  }
  return out;
}

/** An unused same-cycle envelope can be reused by a rerun; a used one
 *  cannot re-charge until renewal (network rule). */
export async function findReusableEnvelope(
  ownerId: string,
  label: string
): Promise<EnvelopeRow | null> {
  const env = (await currentEnvelopes(ownerId)).find((e) => e.label === label);
  if (!env) return null;
  return (await envelopeCycleOpen(env)) ? env : null;
}
