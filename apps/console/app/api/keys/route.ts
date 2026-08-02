import { z } from "zod";
import { createApiKey, listApiKeys } from "@/lib/api-keys";
import { currentUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KeySchema = z.object({ label: z.string().min(1).max(60) });

export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "sign in required" }, { status: 401 });
  return Response.json({ keys: await listApiKeys(user.id) });
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "sign in required" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = KeySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "invalid label" },
      { status: 400 }
    );
  }

  // The plaintext is returned exactly once. Only its hash is stored.
  const created = await createApiKey(user.id, parsed.data.label.trim());
  return Response.json(created);
}
