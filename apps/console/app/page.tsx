// Side-effect imports prove workspace packages resolve by name; both are
// empty until product code lands.
import "@quartermaster/escalation";
import "@quartermaster/prava-client";

function RegionLabel({ children }: { children: string }) {
  return (
    <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-neutral-600">
      {children}
    </span>
  );
}

export default function Home() {
  return (
    <main className="grid h-dvh grid-cols-[1fr_1.15fr_1fr] grid-rows-[minmax(0,1fr)_176px] overflow-hidden">
      <section className="min-h-0 border-r border-neutral-800 px-4 py-3">
        <RegionLabel>AGENT A</RegionLabel>
      </section>
      <section className="min-h-0 border-r border-neutral-800 px-4 py-3">
        <RegionLabel>MANDATE</RegionLabel>
      </section>
      <section className="min-h-0 px-4 py-3">
        <RegionLabel>AGENT B</RegionLabel>
      </section>
      <section className="col-span-3 min-h-0 border-t border-neutral-800 px-4 py-3">
        <RegionLabel>LEDGER</RegionLabel>
      </section>
    </main>
  );
}
