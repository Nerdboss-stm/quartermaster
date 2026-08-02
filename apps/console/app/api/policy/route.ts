import { z } from "zod";
import { amendOwnerPolicy } from "@/lib/amendments";
import { currentUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PolicySchema = z
  .object({
    perChargeCapCents: z.number().int().positive().max(1_000_000).optional(),
    cumulativeCapCents: z.number().int().positive().max(10_000_000).optional(),
    minVramGb: z.number().int().positive().max(1024).optional(),
    maxDurationH: z.number().positive().max(24).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "no change requested",
  });

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "sign in required" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = PolicySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "invalid policy" },
      { status: 400 }
    );
  }

  try {
    const result = await amendOwnerPolicy(user.id, parsed.data);
    return Response.json(result);
  } catch (err) {
    // Fail closed and say why: the old mandate stays active either way.
    console.warn(`policy amendment refused for ${user.id}: ${String(err)}`);
    return Response.json({ error: String((err as Error).message) }, { status: 400 });
  }
}
