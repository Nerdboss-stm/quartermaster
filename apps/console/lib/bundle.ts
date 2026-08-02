import type { Mandate } from "mandate-arbiter";
import { sqlAll, sqlGet } from "./db";
import { mandateChainIds } from "./mandates";
import { settlementMode } from "./prava";

export interface AuditBundle {
  bundleVersion: 1;
  environment: "SANDBOX" | "PRODUCTION";
  exportedAt: string;
  run: { id: string; state: string; created_at: string };
  policyMandateChain: {
    id: string;
    status: string;
    supersedes: string | null;
    created_at: string;
    body: Mandate;
  }[];
  envelopes: Record<string, unknown>[];
  routingDecisions: Record<string, unknown>[];
  trace: { id: number; at: string; body: Record<string, unknown> }[];
  ledger: Record<string, unknown>[];
  pravaIds: {
    mandateIds: string[];
    transactionIds: string[];
    merchantRefs: string[];
  };
}

/** Self-contained, replayable evidence for one run. Judges can diff this
 *  against the on-screen cascade: same ids, same order, same timings. */
export async function buildBundle(runId: string): Promise<AuditBundle | null> {
  const run = await sqlGet<{ id: string; state: string; created_at: string }>(
    "SELECT id, state, created_at FROM runs WHERE id = ?",
    [runId]
  );
  if (!run) return null;

  const trace = (
    await sqlAll<{ id: number; at: string; body: string }>(
      "SELECT id, at, body FROM trace_events WHERE run_id = ? ORDER BY id",
      [runId]
    )
  ).map((r) => ({
    id: r.id,
    at: r.at,
    body: JSON.parse(r.body) as Record<string, unknown>,
  }));

  const ledger = await sqlAll<Record<string, unknown>>(
    "SELECT * FROM ledger WHERE run_id = ? ORDER BY id",
    [runId]
  );

  // Mandate chain: start from whatever mandate this run actually used.
  const mandateIds = new Set<string>();
  for (const row of ledger) mandateIds.add(String(row.mandate_id));
  for (const e of trace) {
    const b = e.body as { type?: string; verdict?: { mandateId?: string } };
    if (b.type === "verdict_full" && b.verdict?.mandateId) {
      mandateIds.add(b.verdict.mandateId);
    }
  }
  const chainIds = new Set<string>();
  for (const id of mandateIds) {
    for (const linked of await mandateChainIds(id)) chainIds.add(linked);
  }
  const policyMandateChain = (
    await Promise.all(
      [...chainIds].map(async (id) => {
        const row = await sqlGet<{
          id: string;
          body: string;
          status: string;
          supersedes: string | null;
          created_at: string;
        }>(
          "SELECT id, body, status, supersedes, created_at FROM mandates WHERE id = ?",
          [id]
        );
        return row
          ? {
              id: row.id,
              status: row.status,
              supersedes: row.supersedes,
              created_at: row.created_at,
              body: JSON.parse(row.body) as Mandate,
            }
          : null;
      })
    )
  )
    .filter((m): m is NonNullable<typeof m> => m !== null)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  const envelopeIds = new Set(
    ledger.map((r) => r.envelope_id).filter((x): x is string => typeof x === "string")
  );
  for (const e of trace) {
    const b = e.body as { type?: string; envelopeId?: string };
    if (b.type === "route_selected" && b.envelopeId) envelopeIds.add(b.envelopeId);
  }
  const envelopes = (
    await Promise.all(
      [...envelopeIds].map((id) =>
        sqlGet<Record<string, unknown>>(
          "SELECT * FROM envelopes WHERE id = ?",
          [id]
        )
      )
    )
  ).filter((e): e is Record<string, unknown> => !!e);

  const routingDecisions = trace
    .filter((e) => {
      const t = (e.body as { type?: string }).type;
      return t === "route_selected" || t === "route_refused";
    })
    .map((e) => ({ at: e.at, ...e.body }));

  return {
    bundleVersion: 1,
    environment: settlementMode().toUpperCase() as "SANDBOX" | "PRODUCTION",
    exportedAt: new Date().toISOString(),
    run,
    policyMandateChain,
    envelopes,
    routingDecisions,
    trace,
    ledger,
    pravaIds: {
      mandateIds: [
        ...new Set(
          envelopes
            .map((e) => e.prava_mandate_id)
            .filter((x): x is string => typeof x === "string")
        ),
      ],
      transactionIds: [
        ...new Set(
          ledger
            .map((r) => r.prava_txn_id)
            .filter((x): x is string => typeof x === "string")
        ),
      ],
      merchantRefs: [
        ...new Set(
          ledger
            .map((r) => r.merchant_ref)
            .filter((x): x is string => typeof x === "string")
        ),
      ],
    },
  };
}
