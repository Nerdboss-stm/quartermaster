import { serve } from "@hono/node-server";
import { Hono } from "hono";

const app = new Hono();

app.get("/health", (c) => c.json({ ok: true, service: "agent-b" }));

const port = Number(process.env.PORT ?? 8080);

serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
  console.log(`agent-b listening on ${info.address}:${info.port}`);
});
