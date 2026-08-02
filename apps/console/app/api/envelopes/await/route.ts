import { currentUser } from "@/lib/auth";
import { sqlAll } from "@/lib/db";
import { storeEnvelope } from "@/lib/envelopes";
import { prava } from "@/lib/prava";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Polled by the browser while the owner is approving on their phone.
 *
 * Prava does not tell us the mandate id up front, so approval is detected
 * by asking which standing mandates now exist for this customer. One short
 * look per call, so the request never hangs; the page keeps asking.
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "sign in required" }, { status: 401 });

  let label = "A";
  try {
    const body = (await req.json()) as { label?: string };
    if (body.label) label = body.label;
  } catch {
    // label is optional
  }

  const known = new Set(
    (
      await sqlAll<{ prava_mandate_id: string }>(
        "SELECT prava_mandate_id FROM envelopes WHERE owner_id = ?",
        [user.id]
      )
    ).map((r) => r.prava_mandate_id)
  );

  try {
    const mandates = await prava().listMandates(user.prava_customer_id);
    const fresh = mandates.find(
      (m) =>
        !known.has(m.id) && (m.status === "active" || m.state === "available")
    );
    if (!fresh) return Response.json({ approved: false });

    const envelope = await storeEnvelope(user.id, label, fresh);
    console.log(`envelope ${envelope.id} approved by ${user.id}`);
    return Response.json({ approved: true, envelope });
  } catch (err) {
    console.error(`envelope poll failed for ${user.id}: ${String(err)}`);
    return Response.json({ approved: false, error: String(err) });
  }
}
