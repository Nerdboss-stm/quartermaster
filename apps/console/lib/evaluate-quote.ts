import { evaluate, type Verdict } from "mandate-arbiter";
import { insertTraceEvent, setRunState } from "./db";
import { ledgerReader, loadActiveMandate } from "./mandates";
import { findQuote } from "./quotes";

/** The only path to a verdict, shared by the agent tool and the post-
 *  amendment re-evaluation. The arbiter alone decides. */
export async function evaluateQuote(
  runId: string,
  quoteId: string
): Promise<Verdict> {
  const quote = await findQuote(runId, quoteId);
  if (!quote) {
    throw new Error(`unknown quote ${quoteId} in run ${runId}: failing closed`);
  }
  const mandate = await loadActiveMandate();
  const proposal = {
    id: quote.id,
    counterpartyId: quote.counterpartyId,
    amountCents: quote.amountCents,
    currency: quote.currency,
    attributes: quote.attributes,
    createdAt: quote.createdAt,
  };
  const verdict = await evaluate(mandate, proposal, {
    ledger: ledgerReader(),
    onEvent: (e) => void insertTraceEvent(runId, e),
  });
  await insertTraceEvent(runId, { type: "verdict_full", verdict });
  await setRunState(
    runId,
    verdict.decision === "EXECUTE"
      ? "execute_ready"
      : verdict.decision === "NEEDS_HUMAN"
        ? "needs_human"
        : "refused"
  );
  return verdict;
}
