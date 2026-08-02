import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { createNeed, needsForOwner } from "@/lib/needs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NeedInputSchema = z.object({
  vramGb: z.number().int().positive().max(1024),
  durationH: z.number().positive().max(24),
  deadline: z
    .string()
    .refine((s) => !Number.isNaN(Date.parse(s)), "must be a date")
    .refine((s) => Date.parse(s) > Date.now(), "deadline must be in the future"),
  maxPriceCents: z.number().int().positive().max(1_000_000),
});

export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "sign in required" }, { status: 401 });
  return Response.json({ needs: await needsForOwner(user.id) });
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
  const parsed = NeedInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "invalid need" },
      { status: 400 }
    );
  }

  const need = await createNeed(user.id, {
    ...parsed.data,
    phone: user.phone,
  });

  // Return as soon as it is recorded. The work itself is started by the
  // caller against /api/needs/<id>/run and watched live, because a person
  // who just told an agent to spend their money should get to see it
  // happen rather than a spinner. Nobody watching is fine too: the need
  // sits pending and a later trigger claims it.
  return Response.json({ need });
}
