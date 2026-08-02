import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { buildOffer, registerOffer } from "./offer";
import { quoteFor, requote, type Need, type StoredQuote } from "./pricing";

const app = new Hono();

// In-memory quote store; a Fly machine restart forgets open quotes,
// which fails closed (unknown quoteId -> 404).
const quotes = new Map<string, StoredQuote>();

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
