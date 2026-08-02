// Side-effect imports prove workspace packages resolve by name.
import "@quartermaster/escalation";
import "@quartermaster/prava-client";
import "mandate-arbiter";
import ConsoleRoot from "./_console/console-root";

export default function Home({
  searchParams,
}: {
  searchParams: { replay?: string };
}) {
  return <ConsoleRoot replayId={searchParams.replay ?? null} />;
}
