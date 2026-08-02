import { LinqEscalator, verifyLinqSignature } from "@quartermaster/escalation";
import { db } from "@/lib/db";
import { latestPendingEscalation, recordReply } from "@/lib/escalation-flow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface LinqEvent {
  event?: string;
  type?: string;
  data?: {
    body?: unknown;
    direction?: string;
    chat?: { id?: string | number };
    sender_handle?: { handle?: string; is_me?: boolean };
  };
}

export async function POST(req: Request) {
  const secret = process.env.LINQ_WEBHOOK_SECRET;
  if (!secret) {
    return Response.json({ error: "webhook secret not configured" }, { status: 500 });
  }

  const rawBody = await req.text();
  const ok = verifyLinqSignature(secret, rawBody, {
    id: req.headers.get("webhook-id"),
    timestamp: req.headers.get("webhook-timestamp"),
    signature: req.headers.get("webhook-signature"),
  });
  if (!ok) return Response.json({ error: "invalid signature" }, { status: 401 });

  // At-least-once delivery: dedupe on webhook-id.
  const webhookId = req.headers.get("webhook-id")!;
  const inserted = db()
    .prepare("INSERT OR IGNORE INTO webhook_events (id, at) VALUES (?, ?)")
    .run(webhookId, new Date().toISOString());
  if (inserted.changes === 0) return Response.json({ ok: true, duplicate: true });

  let evt: LinqEvent;
  try {
    evt = JSON.parse(rawBody) as LinqEvent;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const name = evt.event ?? evt.type;
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

  const pending = latestPendingEscalation();
  if (!pending) return Response.json({ ok: true, ignored: "no pending escalation" });

  const raw = String(data.body ?? "");
  const { parsed, correction } = recordReply(pending.run_id, raw, "linq");

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
