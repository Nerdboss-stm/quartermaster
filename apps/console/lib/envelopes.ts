import type { PravaMandate } from "@quartermaster/prava-client";
import { db } from "./db";
import { MERCHANT } from "./merchant";
import { prava, pravaCustomerId, pravaUserEmail } from "./prava";

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

export async function createEnvelopeSession(
  label: EnvelopeLabel
): Promise<{ approvalUrl: string }> {
  const spec = ENVELOPE_SPECS[label];
  const consoleUrl = process.env.CONSOLE_URL ?? "http://localhost:3000";
  const { approvalUrl } = await prava().createMandateSetupSession({
    userId: pravaCustomerId(),
    userEmail: pravaUserEmail(),
    totalAmountCents: spec.totalCents,
    merchant: MERCHANT,
    productDescription: spec.product,
    recurringFrequency: "weekly",
    maxCharges: 4,
    validUntil: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    callbackUrl: `${consoleUrl.replace(/\/$/, "")}/api/prava/callback`,
  });
  return { approvalUrl };
}

export async function knownMandateIds(): Promise<Set<string>> {
  const mandates = await prava().listMandates(pravaCustomerId());
  return new Set(mandates.map((m) => m.id));
}

/** Poll List Mandates until a new active standing mandate appears (this is
 *  how the mandate id is discovered after passkey approval). */
export async function awaitNewMandate(
  known: Set<string>,
  timeoutMs = 6 * 60_000
): Promise<PravaMandate> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const mandates = await prava().listMandates(pravaCustomerId());
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

export function storeEnvelope(
  label: EnvelopeLabel,
  m: PravaMandate
): EnvelopeRow {
  const row: EnvelopeRow = {
    id: `env_${label.toLowerCase()}_${Date.now()}`,
    label,
    prava_mandate_id: m.id,
    merchant_name: m.merchantName,
    per_charge_cap_cents: Math.round(Number.parseFloat(m.approvedAmount) * 100),
    renews_at: m.renewsAt,
    created_at: new Date().toISOString(),
  };
  db()
    .prepare(
      `INSERT INTO envelopes (id, label, prava_mandate_id, merchant_name, per_charge_cap_cents, renews_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      row.id,
      row.label,
      row.prava_mandate_id,
      row.merchant_name,
      row.per_charge_cap_cents,
      row.renews_at,
      row.created_at
    );
  return row;
}

export function cycleStartIso(env: EnvelopeRow): string {
  return new Date(Date.parse(env.renews_at) - 7 * 86_400_000).toISOString();
}

export function envelopeSpentThisCycle(env: EnvelopeRow): number {
  const row = db()
    .prepare(
      `SELECT COALESCE(SUM(amount_cents), 0) AS total FROM ledger
       WHERE entry_type = 'spend' AND envelope_id = ? AND at >= ?`
    )
    .get(env.id, cycleStartIso(env)) as { total: number };
  return row.total;
}

/** OUR ledger decides cycle eligibility, before any Prava call (hard law 3). */
export function envelopeCycleOpen(env: EnvelopeRow): boolean {
  const row = db()
    .prepare(
      `SELECT COUNT(*) AS n FROM ledger
       WHERE entry_type = 'spend' AND envelope_id = ? AND at >= ?`
    )
    .get(env.id, cycleStartIso(env)) as { n: number };
  return row.n === 0;
}

/** Newest envelope per label whose cycle window is still current. */
export function currentEnvelopes(): EnvelopeRow[] {
  const rows = db()
    .prepare("SELECT * FROM envelopes ORDER BY label ASC, created_at DESC")
    .all() as EnvelopeRow[];
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
export function findReusableEnvelope(label: EnvelopeLabel): EnvelopeRow | null {
  const env = currentEnvelopes().find((e) => e.label === label);
  return env && envelopeCycleOpen(env) ? env : null;
}
