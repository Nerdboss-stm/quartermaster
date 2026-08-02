import { latestPendingEscalation } from "@/lib/escalation-flow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const pending = latestPendingEscalation();
    if (!pending) return Response.json({ pending: null });
    return Response.json({
      pending: {
        runId: pending.run_id,
        mandateId: pending.mandate_id,
        quoteId: pending.quote_id,
        failingDetail: pending.failing_detail,
        options: JSON.parse(pending.options) as string[],
        at: pending.at,
      },
    });
  } catch {
    return Response.json({ pending: null });
  }
}
