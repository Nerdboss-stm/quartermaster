import { currentUser } from "./auth";
import { sqlGet } from "./db";
import { authorizeDemoControl } from "./demo-guard";

/**
 * Who may read a run's trace and audit bundle: its owner, anyone at all if
 * the owner published it, and the operator token for the demo console.
 * Everything else is a 404 — an unshared run does not even confirm it
 * exists.
 */
export async function canReadRun(
  req: Request,
  runId: string
): Promise<boolean> {
  const run = await sqlGet<{ owner_id: string; shared: number }>(
    "SELECT owner_id, shared FROM runs WHERE id = ?",
    [runId]
  );
  if (!run) return false;
  if (run.shared === 1) return true;

  const user = await currentUser();
  if (user?.id === run.owner_id) return true;

  return authorizeDemoControl(req).ok;
}
