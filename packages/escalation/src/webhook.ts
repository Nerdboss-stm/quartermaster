import { createHmac, timingSafeEqual } from "node:crypto";

export interface WebhookHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

/**
 * Standard Webhooks verification per linq-full.md: HMAC-SHA256 with the
 * base64-decoded whsec_ secret over "{webhook-id}.{webhook-timestamp}.{body}",
 * constant-time compare against each "v1,<base64>" value, 5-minute replay
 * window. Raw body bytes, never re-serialized.
 */
export function verifyLinqSignature(
  secret: string,
  rawBody: string,
  headers: WebhookHeaders,
  nowMs = Date.now()
): boolean {
  if (!headers.id || !headers.timestamp || !headers.signature) return false;
  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowMs / 1000 - ts) > 300) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key)
    .update(`${headers.id}.${headers.timestamp}.${rawBody}`)
    .digest("base64");
  const expectedBuf = Buffer.from(expected);

  for (const part of headers.signature.split(" ")) {
    if (!part.startsWith("v1,")) continue;
    const got = Buffer.from(part.slice(3));
    if (got.length === expectedBuf.length && timingSafeEqual(got, expectedBuf)) {
      return true;
    }
  }
  return false;
}
