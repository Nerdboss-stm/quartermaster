// Side-effect imports prove workspace packages resolve by name.
import "@quartermaster/escalation";
import "@quartermaster/prava-client";
import "mandate-arbiter";
import ConsoleRoot from "../_console/console-root";

export const dynamic = "force-dynamic";

/**
 * The operator console: one fixed screen, keyboard-driven, showing a single
 * run as it happens. This is the instrument panel behind the product — kept
 * intact because it is also how the whole flow is driven locally, with
 * `?replay=<runId>` re-rendering any stored run at its recorded pace.
 */
export default function ConsolePage({
  searchParams,
}: {
  searchParams: { replay?: string };
}) {
  return <ConsoleRoot replayId={searchParams.replay ?? null} />;
}
