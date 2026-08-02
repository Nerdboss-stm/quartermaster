import { createHash, randomBytes } from "node:crypto";
import { sqlAll, sqlGet, sqlRun } from "./db";
import { DEMO_OWNER } from "./tenant";

/**
 * Machine access for the NANDA payments plugin and any other agent
 * runtime. Keys are stored hashed; the plaintext is shown once, at
 * creation, and never again.
 *
 * A request with no key resolves to the demo account, which is what keeps
 * the published plugin and its test suite working against this deployment
 * with no configuration.
 */
export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function generateKey(): string {
  return `qm_live_${randomBytes(16).toString("hex")}`;
}

export async function ownerForApiKey(req: Request): Promise<string> {
  const supplied =
    req.headers.get("x-api-key") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!supplied) return DEMO_OWNER;

  const row = await sqlGet<{ owner_id: string }>(
    "SELECT owner_id FROM api_keys WHERE key_hash = ?",
    [hashKey(supplied)]
  );
  return row?.owner_id ?? DEMO_OWNER;
}

export async function createApiKey(
  ownerId: string,
  label: string
): Promise<{ id: string; key: string }> {
  const key = generateKey();
  const id = `key_${randomBytes(6).toString("hex")}`;
  await sqlRun(
    "INSERT INTO api_keys (id, owner_id, key_hash, label, created_at) VALUES (?, ?, ?, ?, ?)",
    [id, ownerId, hashKey(key), label, new Date().toISOString()]
  );
  return { id, key };
}

export async function listApiKeys(ownerId: string) {
  return sqlAll<{ id: string; label: string; created_at: string }>(
    "SELECT id, label, created_at FROM api_keys WHERE owner_id = ? ORDER BY created_at DESC",
    [ownerId]
  );
}
