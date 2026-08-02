import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { sqlRun } from "@/lib/db";
import { getUserByPhone, normalizePhone } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AccountSchema = z.object({
  displayName: z.string().min(1).max(80).optional(),
  // Empty string clears it: back to the in-app inbox only.
  phone: z.string().max(20).optional(),
});

export async function PATCH(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "sign in required" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = AccountSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "invalid details" },
      { status: 400 }
    );
  }

  const phone = parsed.data.phone?.trim()
    ? normalizePhone(parsed.data.phone)
    : null;

  // Inbound replies are matched to an account by sender number, so two
  // accounts sharing one number would make a reply ambiguous — and an
  // ambiguous reply is one that could approve the wrong person's charge.
  if (phone) {
    const holder = await getUserByPhone(phone);
    if (holder && holder.id !== user.id) {
      return Response.json(
        { error: "that number is already on another account" },
        { status: 409 }
      );
    }
  }

  await sqlRun("UPDATE users SET display_name = ?, phone = ? WHERE id = ?", [
    parsed.data.displayName?.trim() || user.display_name,
    phone,
    user.id,
  ]);

  return Response.json({ ok: true, phone });
}
