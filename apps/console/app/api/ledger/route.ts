import { ownerOrDemo } from "@/lib/auth";
import { sqlAll } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Append-only ledger, oldest first. The rail renders newest at the right.
 * One account's rows only: signed in it is yours, and without a session it
 * is the demo account's recorded history, which is what the operator
 * console and the showcase are meant to show.
 */
export async function GET() {
  try {
    const rows = await sqlAll(
      `SELECT id, run_id, mandate_id, envelope_id, entry_type, autonomous,
              clause_paths, amount_cents, currency, mode, prava_session_id,
              prava_txn_id, merchant_ref, at
       FROM ledger WHERE owner_id = ? ORDER BY id`,
      [await ownerOrDemo()]
    );
    return Response.json({ rows });
  } catch {
    return Response.json({ rows: [] });
  }
}
