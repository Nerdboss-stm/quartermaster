import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { hashPassword, sessionCookie } from "@/lib/auth";
import { sqlRun } from "@/lib/db";
import { createDefaultPolicy } from "@/lib/policy";
import { getUserByEmail, normalizePhone } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "at least 8 characters"),
  displayName: z.string().min(1).max(80),
  // Where refusals will reach them. Optional: without it, escalations fall
  // back to the in-app inbox rather than iMessage.
  phone: z.string().min(7).optional().or(z.literal("")),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = SignupSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "invalid details" },
      { status: 400 }
    );
  }
  const { email, password, displayName, phone } = parsed.data;

  if (await getUserByEmail(email)) {
    return Response.json(
      { error: "an account with that email already exists" },
      { status: 409 }
    );
  }

  const id = `usr_${randomBytes(5).toString("hex")}`;
  try {
    await sqlRun(
      `INSERT INTO users (id, email, password_hash, display_name, phone, prava_customer_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        email.trim().toLowerCase(),
        await hashPassword(password),
        displayName.trim(),
        phone ? normalizePhone(phone) : null,
        // Their own Prava customer: envelopes approved here are theirs,
        // never shared with another account.
        `user_${randomBytes(6).toString("hex")}`,
        new Date().toISOString(),
      ]
    );
    // Everyone starts with a real signed policy, so the arbiter has
    // something to rule on from the very first charge.
    await createDefaultPolicy(id);
  } catch (err) {
    console.error(`signup failed for ${email}: ${String(err)}`);
    return Response.json({ error: "could not create account" }, { status: 500 });
  }

  cookies().set(sessionCookie(id));
  return Response.json({ ok: true, id });
}
