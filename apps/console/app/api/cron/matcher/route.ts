import { tickMatcher } from "@/lib/matcher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * The scheduled sweep. Vercel calls this with CRON_SECRET; it also expires
 * needs whose deadline passed and fails runs that were abandoned.
 *
 * Deliberately not load-bearing: posting a need runs it inline, a new
 * listing wakes waiting needs, and an open dashboard ticks too. This is
 * the safety net for the hours when nobody is looking.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const supplied = req.headers.get("authorization");
    if (supplied !== `Bearer ${secret}`) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  try {
    const outcomes = await tickMatcher(3);
    if (outcomes.length > 0) {
      console.log(`cron matcher: ${JSON.stringify(outcomes)}`);
    }
    return Response.json({ ok: true, outcomes });
  } catch (err) {
    console.error(`cron matcher failed: ${String(err)}`);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
