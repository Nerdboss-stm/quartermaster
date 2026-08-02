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
  /** 1 once they have messaged our line, which is what lets us text them. */
  sms_ready: number;
  created_at: string;
}

/** The number an owner texts to switch on alerts, and that alerts come from. */
export function agentNumber(): string | null {
  return process.env.LINQ_FROM_NUMBER ?? null;
}

/**
 * A sandbox test card to enroll during approval, spread across accounts so
 * two people trying this at once do not share one card's daily limit.
 * Published Prava sandbox numbers — they are declined everywhere else.
 * 7789 and 7797 are held back: the demo browser is enrolled on 7797.
 */
const SANDBOX_CARDS = [
  { number: "4622 9431 2313 7805", cvv: "304" },
  { number: "4622 9431 2313 7847", cvv: "698" },
  { number: "4622 9431 2313 7854", cvv: "799" },
  { number: "4622 9431 2313 7862", cvv: "938" },
  { number: "4622 9431 2313 7870", cvv: "966" },
  { number: "4622 9431 2313 7888", cvv: "408" },
  { number: "4622 9431 2313 7896", cvv: "499" },
  { number: "4622 9431 2313 7904", cvv: "890" },
  { number: "4622 9431 2313 7912", cvv: "999" },
];

export function sandboxCardFor(ownerId: string) {
  let hash = 0;
  for (const ch of ownerId) hash = (hash * 31 + ch.charCodeAt(0)) % 100_000;
  return {
    ...SANDBOX_CARDS[hash % SANDBOX_CARDS.length],
    expiry: "12/27",
    otp: "456789",
  };
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
