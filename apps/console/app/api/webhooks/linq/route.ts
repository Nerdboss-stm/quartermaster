import { LinqEscalator, verifyLinqSignature } from "@quartermaster/escalation";
import { sqlRun } from "@/lib/db";
import { latestPendingEscalation, recordReply } from "@/lib/escalation-flow";
import { continueAfterReply } from "@/lib/continuation";
import { DEMO_OWNER, getUserByPhone } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Settlement runs inside this request: Prava charge, merchant order, report.
export const maxDuration = 300;

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

  // Anyone with an account here may reply from their own number. The demo
  // chat stays accepted so the recorded scripts keep working, but it is no
  // longer the only sender allowed — that made the whole product a
  // single-person demo the moment a second person signed up.
  const replyFrom = data.sender_handle?.handle ?? "";
  const sender = replyFrom ? await getUserByPhone(replyFrom) : null;
  const chatId = process.env.LINQ_DEMO_CHAT_ID;
  const ownerHandle = process.env.LINQ_TO_NUMBER;
  const chatMatches = chatId ? String(data.chat?.id) === chatId : false;
  const senderMatches = ownerHandle ? replyFrom === ownerHandle : false;
  if (!sender && !chatMatches && !senderMatches) {
    return Response.json({ ok: true, ignored: "sender has no account here" });
  }

  const ownerId = sender?.id ?? DEMO_OWNER;
  // They have now messaged this line, so Linq will let us message them.
  const firstContact = sender !== null && sender.sms_ready !== 1;
  if (sender && firstContact) {
    await sqlRun("UPDATE users SET sms_ready = 1 WHERE id = ?", [sender.id]);
  }

  const replyTo = sender?.phone ?? ownerHandle;

  const pending = await latestPendingEscalation(ownerId);
  if (!pending) {
    // Nothing to decide. If this is the message that switched texting on,
    // say so — otherwise they are left wondering whether it worked.
    if (firstContact && replyTo && process.env.LINQ_API_KEY && process.env.LINQ_FROM_NUMBER) {
      try {
        await new LinqEscalator({
          apiKey: process.env.LINQ_API_KEY,
          fromNumber: process.env.LINQ_FROM_NUMBER,
          toNumber: replyTo,
        }).sendText(
          `QUARTERMASTER: text alerts are on for ${sender!.display_name}. When your agent wants to spend past your policy, it will ask you here and wait.`
        );
      } catch (err) {
        console.warn(`activation confirmation failed: ${String(err)}`);
      }
    }
    return Response.json({ ok: true, activated: firstContact });
  }

  const raw =
    (data.parts ?? [])
      .filter((p) => p.type === "text" && typeof p.value === "string")
      .map((p) => p.value as string)
      .join(" ")
      .trim() || String(data.body ?? "");
  if (!raw) return Response.json({ ok: true, ignored: "no text parts" });
  const { parsed, claimed, correction } = await recordReply(pending, raw, "linq");

  if (correction && process.env.LINQ_API_KEY && process.env.LINQ_FROM_NUMBER && replyTo) {
    try {
      await new LinqEscalator({
        apiKey: process.env.LINQ_API_KEY,
        fromNumber: process.env.LINQ_FROM_NUMBER,
        // Back to whoever wrote it, not to whoever the deployment is
        // configured for.
        toNumber: replyTo,
      }).sendText(correction);
    } catch (err) {
      console.warn(`correction send failed: ${String(err)}`);
    }
  }
  // The reply is the trigger: amend, re-evaluate and settle happen here,
  // server-side, while the owner goes back to sleep. Errors are swallowed
  // into a 200 so Linq never retries a money path.
  if (parsed && claimed) {
    try {
      const outcome = await continueAfterReply(pending, parsed);
      console.log(`continuation for ${pending.run_id}: ${outcome.status} — ${outcome.detail}`);
      return Response.json({ ok: true, parsed: parsed.action, continuation: outcome.status });
    } catch (err) {
      console.error(`continuation threw for ${pending.run_id}: ${String(err)}`);
      return Response.json({ ok: true, parsed: parsed.action, continuation: "failed" });
    }
  }

  return Response.json({ ok: true, parsed: parsed?.action ?? null });
}
