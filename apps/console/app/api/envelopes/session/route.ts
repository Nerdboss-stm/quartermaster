import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { createEnvelopeSession, currentEnvelopes } from "@/lib/envelopes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const Schema = z.object({
  capCents: z.number().int().min(100).max(100_000),
  label: z.string().min(1).max(24).optional(),
  product: z.string().min(1).max(80).optional(),
});

/**
 * Opens a Prava mandate-setup session for this account. The response is an
 * approval URL the owner must complete with their passkey — we never see
 * it, and there is no path here that skips it.
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "sign in required" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "invalid envelope" },
      { status: 400 }
    );
  }

  const existing = await currentEnvelopes(user.id);
  const label =
    parsed.data.label ??
    String.fromCharCode(65 + Math.min(existing.length, 25));

  try {
    const { approvalUrl } = await createEnvelopeSession(user, {
      label,
      totalCents: parsed.data.capCents,
      product: parsed.data.product ?? "Compute envelope",
    });
    return Response.json({ approvalUrl, label });
  } catch (err) {
    console.error(`envelope session failed for ${user.id}: ${String(err)}`);
    return Response.json(
      { error: "could not open an approval session" },
      { status: 502 }
    );
  }
}
