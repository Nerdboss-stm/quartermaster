import { LinqEscalator, verifyLinqSignature } from "@quartermaster/escalation";
import { sqlRun } from "@/lib/db";
import { latestPendingEscalation, recordReply } from "@/lib/escalation-flow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Field names verified against a live capture (webhook_version 2026-02-03):
// event name at event_type, reply text at data.parts[].value.
interface LinqEvent {
  event_type?: string;
  event?: string;
  type?: string;
  data?: {
    body?: unknown;
    direction?: string;
    parts?: { type?: string; value?: unknown }[];
    chat?: { id?: string | number };
    sender_handle?: { handle?: string; is_me?: boolean };
  };
}

export async function POST(req: Request) {
  // Both candidates are tried: the dashboard subscription secret and, for
  // `linq webhooks listen` forwarding, the CLI session secret.
  const candidates = [
    ["dashboard", process.env.LINQ_WEBHOOK_SECRET],
    ["cli", process.env.LINQ_WEBHOOK_SECRET_CLI],
  ].filter((c): c is [string, string] => !!c[1]);
  if (candidates.length === 0) {
    return Response.json({ error: "webhook secret not configured" }, { status: 500 });
  }

  const rawBody = await req.text();
  const headers = {
    id: req.headers.get("webhook-id"),
    timestamp: req.headers.get("webhook-timestamp"),
    signature: req.headers.get("webhook-signature"),
  };
  if (!headers.id || !headers.timestamp || !headers.signature) {
    console.warn(
      `linq webhook 401: missing signature headers; present: ${Array.from(req.headers.keys()).join(", ")}`
    );
    return Response.json({ error: "missing signature headers" }, { status: 401 });
  }
  const tsDelta = Math.round(Date.now() / 1000 - Number(headers.timestamp));
  const matched = candidates.find(([, secret]) =>
    verifyLinqSignature(secret, rawBody, headers)
  );
  if (!matched) {
    console.warn(
      `linq webhook 401: signature mismatch (tried: ${candidates.map(([n]) => n).join(", ")}; timestamp skew ${tsDelta}s; sig prefix ${headers.signature.slice(0, 8)})`
    );
    // TEMP DIAGNOSTIC: capture one failing request for offline scheme tests.
    if (process.env.QM_WEBHOOK_DEBUG_FILE) {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(
        process.env.QM_WEBHOOK_DEBUG_FILE,
        JSON.stringify({ headers, rawBody })
      );
    }
    return Response.json({ error: "invalid signature" }, { status: 401 });
  }
  console.log(`linq webhook verified with ${matched[0]} secret`);

  // At-least-once delivery: dedupe on webhook-id.
  const webhookId = req.headers.get("webhook-id")!;
  const inserted = await sqlRun(
    "INSERT INTO webhook_events (id, at) VALUES (?, ?) ON CONFLICT (id) DO NOTHING",
    [webhookId, new Date().toISOString()]
  );
  if (inserted.changes === 0) return Response.json({ ok: true, duplicate: true });

  let evt: LinqEvent;
  try {
    evt = JSON.parse(rawBody) as LinqEvent;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const name = evt.event_type ?? evt.event ?? evt.type;
  const data = evt.data;
  if (name !== "message.received" || !data || data.direction !== "inbound") {
    return Response.json({ ok: true, ignored: name ?? "unknown" });
  }

  // Accept only the demo chat (or, failing that, the owner's handle).
  const chatId = process.env.LINQ_DEMO_CHAT_ID;
  const ownerHandle = process.env.LINQ_TO_NUMBER;
  const chatMatches = chatId ? String(data.chat?.id) === chatId : false;
  const senderMatches = ownerHandle
    ? data.sender_handle?.handle === ownerHandle
    : false;
  if (!chatMatches && !senderMatches) {
    return Response.json({ ok: true, ignored: "not the demo chat" });
  }

  const pending = await latestPendingEscalation();
  if (!pending) return Response.json({ ok: true, ignored: "no pending escalation" });

  const raw =
    (data.parts ?? [])
      .filter((p) => p.type === "text" && typeof p.value === "string")
      .map((p) => p.value as string)
      .join(" ")
      .trim() || String(data.body ?? "");
  if (!raw) return Response.json({ ok: true, ignored: "no text parts" });
  const { parsed, correction } = await recordReply(pending.run_id, raw, "linq");

  if (correction && process.env.LINQ_API_KEY && process.env.LINQ_FROM_NUMBER && ownerHandle) {
    try {
      await new LinqEscalator({
        apiKey: process.env.LINQ_API_KEY,
        fromNumber: process.env.LINQ_FROM_NUMBER,
        toNumber: ownerHandle,
      }).sendText(correction);
    } catch (err) {
      console.warn(`correction send failed: ${String(err)}`);
    }
  }
  return Response.json({ ok: true, parsed: parsed?.action ?? null });
}
