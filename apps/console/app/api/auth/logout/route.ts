import { cookies } from "next/headers";
import { clearedCookie } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  cookies().set(clearedCookie());
  return Response.json({ ok: true });
}
