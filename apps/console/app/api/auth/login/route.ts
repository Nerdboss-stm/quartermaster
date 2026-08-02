import { cookies } from "next/headers";
import { sessionCookie, verifyPassword } from "@/lib/auth";
import { getUserByEmail } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { email?: string; password?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.email || !body.password) {
    return Response.json({ error: "email and password required" }, { status: 400 });
  }

  const user = await getUserByEmail(body.email);
  // Same message either way: never reveal which half was wrong.
  const ok = user ? await verifyPassword(body.password, user.password_hash) : false;
  if (!user || !ok) {
    return Response.json({ error: "wrong email or password" }, { status: 401 });
  }

  cookies().set(sessionCookie(user.id));
  return Response.json({ ok: true, id: user.id });
}
