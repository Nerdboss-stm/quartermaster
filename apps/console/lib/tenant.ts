import { sqlGet } from "./db";
import { MERCHANT } from "./merchant";

/**
 * The account that owns everything created before tenancy existed: the
 * recorded runs, the audit bundles, the demo scripts. Passed explicitly by
 * demo-flow, the CLI scripts, and the NANDA no-key fallback — never as a
 * default parameter on a money path, so a missed call site fails to
 * compile instead of quietly spending someone else's envelope.
 */
export const DEMO_OWNER = "usr_demo";

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  phone: string | null;
  prava_customer_id: string;
  created_at: string;
}

export async function getUser(id: string): Promise<UserRow | null> {
  const row = await sqlGet<UserRow>("SELECT * FROM users WHERE id = ?", [id]);
  return row ?? null;
}

export async function getUserByEmail(email: string): Promise<UserRow | null> {
  const row = await sqlGet<UserRow>(
    "SELECT * FROM users WHERE email = ?",
    [email.trim().toLowerCase()]
  );
  return row ?? null;
}

/** Inbound iMessage replies carry a phone number, not a session. */
export async function getUserByPhone(phone: string): Promise<UserRow | null> {
  const row = await sqlGet<UserRow>("SELECT * FROM users WHERE phone = ?", [
    normalizePhone(phone),
  ]);
  return row ?? null;
}

/** Best-effort E.164, so the webhook's sender matches what we stored. */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

const PLATFORM_MERCHANT = {
  name: "QuarterMaster Market",
  url: process.env.CONSOLE_URL ?? "http://localhost:3000",
  countryCodeIso2: "US",
};

/**
 * Which merchant an owner's envelopes are scoped to.
 *
 * The demo owner keeps Agent B, because its existing envelopes were
 * approved against that name and the recorded story depends on them.
 * Everyone else is scoped to the platform, so a single approved envelope
 * can fund a purchase from any supplier in the marketplace. The per-charge
 * cap and the one-charge-per-cycle rule are unchanged either way: those
 * are enforced by the card network, not by us.
 */
export function merchantForOwner(ownerId: string) {
  return ownerId === DEMO_OWNER ? MERCHANT : PLATFORM_MERCHANT;
}
