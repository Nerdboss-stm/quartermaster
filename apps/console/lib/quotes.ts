import { traceEventsSince } from "./db";

export interface Quote {
  id: string;
  counterpartyId: string;
  amountCents: number;
  currency: string;
  attributes: Record<string, string | number | boolean>;
  createdAt: string;
  pricingRule?: string;
  held?: boolean;
  note?: string;
}

/** Latest stored version of a quote (a requote overwrites by same id).
 *  Quotes live in trace_events, so amounts always come from the record,
 *  never from model output. */
export async function findQuote(
  runId: string,
  quoteId: string
): Promise<Quote | null> {
  const rows = await traceEventsSince(runId, 0);
  for (let i = rows.length - 1; i >= 0; i--) {
    const body = JSON.parse(rows[i].body) as { type?: string; quote?: Quote };
    if (
      (body.type === "quote_received" || body.type === "requote_response") &&
      body.quote?.id === quoteId
    ) {
      return body.quote;
    }
  }
  return null;
}
