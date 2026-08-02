import type { ChargeCredentials } from "@quartermaster/prava-client";

const AGENT_B_URL =
  process.env.AGENT_B_URL ?? "https://quartermaster-agent-b.fly.dev";

/**
 * PRODUCTION MODE ONLY (coordinated run, Prava-provided buyer card).
 * Drives Agent B's live Stripe Checkout with Playwright per docs/stripe.md.
 * VERIFY the hosted-Checkout selectors in Stripe TEST MODE (card 4242...)
 * before the coordinated run; selectors are the fragile part.
 * Requires: pnpm exec playwright install chromium
 */
export async function settleViaStripeCheckout(
  amountCents: number,
  credential: ChargeCredentials
): Promise<{ paymentIntentId: string }> {
  let chromium: (typeof import("playwright"))["chromium"];
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    throw new Error(
      "playwright unavailable: run `pnpm exec playwright install chromium` before the production session"
    );
  }

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(
      `${AGENT_B_URL}/checkout?amountCents=${amountCents}&description=${encodeURIComponent("GPU compute (Quartermaster)")}`,
      { waitUntil: "load", timeout: 60_000 }
    );

    // Stripe-hosted inputs; generous timeouts per docs/stripe.md.
    await page.getByPlaceholder(/card number/i).fill(credential.token, { timeout: 30_000 });
    await page
      .getByPlaceholder(/MM\s*\/\s*YY/i)
      .fill(
        `${String(credential.expiryMonth).padStart(2, "0")}${String(credential.expiryYear).slice(-2)}`
      );
    await page.getByPlaceholder(/CVC/i).fill(String(credential.dynamicCvv));
    await page.getByPlaceholder(/full name|name on card/i).fill("Quartermaster Agent A");
    const zip = page.getByPlaceholder(/ZIP|postal/i);
    if (await zip.count()) await zip.fill("94103");

    await page.getByRole("button", { name: /pay/i }).click();
    await page.waitForURL(/checkout\/success/, { timeout: 90_000 });

    const sessionId = new URL(page.url()).searchParams.get("session_id");
    if (!sessionId) throw new Error("no session_id on success url: failing closed");

    const res = await fetch(
      `${AGENT_B_URL}/checkout/complete?session_id=${encodeURIComponent(sessionId)}`
    );
    if (!res.ok) throw new Error(`checkout completion lookup failed: ${res.status}`);
    const done = (await res.json()) as {
      payment_status: string;
      payment_intent: string | null;
    };
    if (done.payment_status !== "paid" || !done.payment_intent) {
      throw new Error(`checkout not paid (${done.payment_status}): failing closed`);
    }
    return { paymentIntentId: done.payment_intent };
  } finally {
    await browser.close();
  }
}
