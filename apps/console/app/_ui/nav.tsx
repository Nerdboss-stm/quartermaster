"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const BUY = [
  { href: "/app", label: "Overview" },
  { href: "/app/needs", label: "Needs" },
  { href: "/app/market", label: "Market" },
  { href: "/app/runs", label: "Runs" },
  { href: "/app/portfolio", label: "Spending power" },
  { href: "/app/policy", label: "Policy" },
  { href: "/app/escalations", label: "Approvals" },
  { href: "/app/ledger", label: "Ledger" },
];

const SELL = [{ href: "/app/listings", label: "My capacity" }];

const BUILD = [{ href: "/app/developers", label: "Agent access" }];

export default function Nav({
  displayName,
  pendingCount,
}: {
  displayName: string;
  pendingCount: number;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  };

  return (
    <nav className="flex w-52 shrink-0 flex-col border-r border-neutral-800 bg-neutral-950">
      <div className="border-b border-neutral-800 px-4 py-4">
        <Link
          href="/app"
          className="font-mono text-[11px] uppercase tracking-[0.28em] text-neutral-200"
        >
          Quartermaster
        </Link>
        <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-neutral-600">
          Sandbox
        </p>
      </div>

      <div className="flex-1 overflow-y-auto py-3">
        <Section label="Buy" items={BUY} pathname={pathname} badge={{ "/app/escalations": pendingCount }} />
        <Section label="Sell" items={SELL} pathname={pathname} />
        <Section label="Build" items={BUILD} pathname={pathname} />
      </div>

      <div className="border-t border-neutral-800 px-4 py-3">
        <p className="truncate font-sans text-[12px] text-neutral-300">
          {displayName}
        </p>
        <button
          onClick={signOut}
          className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-neutral-600 hover:text-neutral-300"
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}

function Section({
  label,
  items,
  pathname,
  badge = {},
}: {
  label: string;
  items: { href: string; label: string }[];
  pathname: string;
  badge?: Record<string, number>;
}) {
  return (
    <div className="mb-4">
      <p className="px-4 pb-1 font-mono text-[9px] uppercase tracking-[0.25em] text-neutral-700">
        {label}
      </p>
      {items.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== "/app" && pathname.startsWith(item.href));
        const count = badge[item.href] ?? 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center justify-between px-4 py-1.5 font-sans text-[13px] transition-colors ${
              active
                ? "bg-neutral-900 text-neutral-100"
                : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            {item.label}
            {count > 0 ? (
              <span className="border border-amber-500 px-1 font-mono text-[9px] tabular-nums text-amber-400">
                {count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
