import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Append-only ledger, oldest first. The rail renders newest at the right. */
export async function GET() {
  try {
    const rows = db()
      .prepare(
        `SELECT id, run_id, mandate_id, envelope_id, entry_type, autonomous,
                clause_paths, amount_cents, currency, mode, prava_session_id,
                prava_txn_id, merchant_ref, at
         FROM ledger ORDER BY id`
      )
      .all();
    return Response.json({ rows });
  } catch {
    return Response.json({ rows: [] });
  }
}
