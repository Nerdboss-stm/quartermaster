import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { tryRunNeed } from "@/lib/matcher";
import { createNeed, needsForOwner } from "@/lib/needs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Posting a need attempts the purchase inline, which can run the agent,
// the arbiter and a settlement.
export const maxDuration = 300;

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

  // Try immediately. If supply exists the whole thing can be done before
  // the response returns; if not, it stays pending and a later trigger
  // picks it up — which is what "post it and go to sleep" means.
  const outcome = await tryRunNeed(need.id);
  return Response.json({ need, outcome });
}
