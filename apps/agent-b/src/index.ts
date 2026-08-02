import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { buildOffer, registerOffer } from "./offer";
import { createOrder, parseOrderRequest, type Order } from "./orders";
import { quoteFor, requote, type Need, type StoredQuote } from "./pricing";

const app = new Hono();

// In-memory quote store; a Fly machine restart forgets open quotes,
// which fails closed (unknown quoteId -> 404).
const quotes = new Map<string, StoredQuote>();
const orders = new Map<string, Order>();

app.get("/health", (c) => c.json({ ok: true, service: "agent-b" }));

app.get("/offer", (c) => c.json(buildOffer()));

app.post("/quote", async (c) => {
  const body = await c.req.json().catch(() => null);
  const need = parseNeed(body);
  if (!need) return c.json({ error: "invalid need" }, 400);

  const result = quoteFor(need);
  if ("error" in result) return c.json({ error: result.error }, 422);

  quotes.set(result.quote.id, result);
  console.log(
    `quote ${result.quote.id}: ${result.quote.amountCents}c [${result.quote.pricingRule}]`
  );
  return c.json(result.quote);
});

app.post("/requote", async (c) => {
  const body = await c.req.json().catch(() => null);
  const quoteId = body && typeof body.quoteId === "string" ? body.quoteId : null;
  if (!quoteId) return c.json({ error: "quoteId required" }, 400);

  const stored = quotes.get(quoteId);
  if (!stored) return c.json({ error: `unknown quote ${quoteId}` }, 404);

  const updated = requote(stored);
  console.log(
    `requote ${quoteId}: ${updated.amountCents}c held=${updated.held === true} (${updated.note})`
  );
  return c.json(updated);
});

app.post("/orders", async (c) => {
  const body = await c.req.json().catch(() => null);
  const req = parseOrderRequest(body);
  if (!req) return c.json({ error: "invalid order request" }, 400);

  // If the quote is still known, the paid amount must match it exactly.
  const stored = quotes.get(req.quoteId);
  if (stored && stored.quote.amountCents !== req.amountCents) {
    return c.json({ error: "amount does not match quote" }, 422);
  }

  const order = createOrder(req);
  orders.set(order.orderRef, order);
  // Card credential is never logged; last 4 only.
  console.log(
    `order ${order.orderRef}: paid ${order.amountCents}c for ${req.quoteId} (card ...${order.tokenLast4}) [SANDBOX]`
  );
  return c.json({
    orderRef: order.orderRef,
    status: order.status,
    environment: order.environment,
  });
});

// ---- PRODUCTION ONLY (coordinated run): live Stripe Checkout ----
app.get("/checkout", async (c) => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return c.json({ error: "stripe not configured" }, 503);
  const amountCents = Number(c.req.query("amountCents"));
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return c.json({ error: "amountCents required" }, 400);
  }
  const description =
    c.req.query("description") ?? "GPU compute (Quartermaster)";
  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(key);
  const selfUrl = process.env.AGENT_B_URL ?? "https://quartermaster-agent-b.fly.dev";
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: amountCents,
          product_data: { name: description },
        },
      },
    ],
    success_url: `${selfUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${selfUrl}/checkout/cancel`,
  });
  return c.redirect(session.url!, 302);
});

app.get("/checkout/success", (c) => c.text("Payment complete."));
app.get("/checkout/cancel", (c) => c.text("Payment cancelled."));

app.get("/checkout/complete", async (c) => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return c.json({ error: "stripe not configured" }, 503);
  const sessionId = c.req.query("session_id");
  if (!sessionId) return c.json({ error: "session_id required" }, 400);
  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(key);
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  return c.json({
    payment_status: session.payment_status,
    payment_intent:
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : (session.payment_intent?.id ?? null),
  });
});

function parseNeed(body: unknown): Need | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  if (
    typeof b.vramGb !== "number" ||
    b.vramGb <= 0 ||
    typeof b.durationH !== "number" ||
    b.durationH <= 0 ||
    typeof b.deadline !== "string" ||
    Number.isNaN(Date.parse(b.deadline)) ||
    typeof b.maxPriceCents !== "number" ||
    !Number.isInteger(b.maxPriceCents) ||
    b.maxPriceCents <= 0
  ) {
    return null;
  }
  return {
    vramGb: b.vramGb,
    durationH: b.durationH,
    deadline: b.deadline,
    maxPriceCents: b.maxPriceCents,
  };
}

const port = Number(process.env.PORT ?? 8080);

serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
  console.log(`agent-b listening on ${info.address}:${info.port}`);
  void registerOffer();
});
