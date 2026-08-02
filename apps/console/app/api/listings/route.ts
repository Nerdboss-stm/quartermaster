import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { createListing, listingsForOwner } from "@/lib/listings";
import { tickMatcher } from "@/lib/matcher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Publishing capacity can immediately satisfy someone's waiting need.
export const maxDuration = 300;

const ListingSchema = z.object({
  gpu: z.string().min(1).max(60),
  vramGb: z.number().int().positive().max(1024),
  rateCentsPerHour: z.number().int().positive().max(1_000_000),
  floorCentsPerHour: z.number().int().positive().optional(),
  maxDurationH: z.number().int().positive().max(24),
});

export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "sign in required" }, { status: 401 });
  return Response.json({ listings: await listingsForOwner(user.id) });
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
  const parsed = ListingSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "invalid listing" },
      { status: 400 }
    );
  }

  const listing = await createListing(user.id, parsed.data);

  // New supply is a trigger: someone may have been waiting for exactly
  // this. Failures here must not fail the listing itself.
  let woke: unknown[] = [];
  try {
    woke = await tickMatcher(2);
  } catch (err) {
    console.warn(`listing created but matcher tick failed: ${String(err)}`);
  }

  return Response.json({ listing, woke });
}
