# docs/stripe.md
# Written Jul 31, 2026 FROM TRAINING KNOWLEDGE, not fetched. Stripe
# Checkout is stable and this is production-day-only code (Agent B's
# live merchant page for the coordinated Prava production run).
# Verify against https://docs.stripe.com/payments/checkout before
# the production session. Sandbox demo NEVER touches Stripe.

=====================================================================
1. WHAT AGENT B USES STRIPE FOR
=====================================================================
Production mode only: Agent B exposes GET /checkout which creates a
Stripe Checkout Session at the quote amount and redirects to the
hosted page. Playwright fills the Prava one-time credential like any
card and submits. The payment intent id becomes merchant_ref in the
ledger, and the Stripe dashboard is the third-party proof on camera.

=====================================================================
2. SERVER: CREATE THE CHECKOUT SESSION (Node)
=====================================================================
import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const session = await stripe.checkout.sessions.create({
  mode: "payment",
  line_items: [{
    quantity: 1,
    price_data: {
      currency: "usd",
      unit_amount: amountCents,          // FROM THE QUOTE, never hardcoded
      product_data: { name: "GPU compute: A100 x 3h (Quartermaster)" },
    },
  }],
  success_url: `${AGENT_B_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: `${AGENT_B_URL}/checkout/cancel`,
});
// redirect the browser to session.url
Retrieve after success:
  const s = await stripe.checkout.sessions.retrieve(id);
  // s.payment_status === "paid"; s.payment_intent -> merchant_ref
Poll retrieve for confirmation. No Stripe webhooks needed at this
scale; keep it simple.

=====================================================================
3. PLAYWRIGHT FILL (production run only)
=====================================================================
Hosted Checkout renders card number, expiry, CVC, name, and postal
code fields (Stripe-hosted inputs; use page.getByLabel /
getByPlaceholder, allow generous timeouts). Fill the Prava
credentials: token as the card number, dynamicCvv, expiry
month/year. Postal code: any valid US zip. Submit, wait for the
success_url.
Rehearse the selectors in TEST MODE with Stripe's standard test card
4242 4242 4242 4242 (any future expiry, any CVC) BEFORE the
coordinated run. Selectors are the fragile part; rehearse twice.

=====================================================================
4. HARD RULES (account survival)
=====================================================================
1. NEVER your own card on your own Stripe account (prohibited,
   card-testing pattern). The buyer card is Prava-provided.
2. Under EIGHT live charges all weekend, varied amounts.
3. Radar stays default; add no 3DS-forcing rules.
4. New accounts hold first payouts ~7-14 days; irrelevant to
   authorization; ignore it.
5. Live keys enter .env only on production day; test keys otherwise.
6. If the coordinated run hits declines: network-tokens setting,
   Radar review, then the Prava team on the call, in that order.

=====================================================================
5. VERIFY LINKS (production morning, 5 minutes)
=====================================================================
https://docs.stripe.com/payments/checkout
https://docs.stripe.com/checkout/quickstart
https://docs.stripe.com/testing        (test cards)
