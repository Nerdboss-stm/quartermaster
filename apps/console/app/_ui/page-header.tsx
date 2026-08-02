import Link from "next/link";
import type { ReactNode } from "react";

export default function PageHeader({
  title,
  lede,
  action,
}: {
  title: string;
  lede?: string;
  action?: { href: string; label: string } | ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-6 border-b border-neutral-800 px-6 py-5">
      <div>
        <h1 className="font-sans text-lg text-neutral-100">{title}</h1>
        {lede ? (
          <p className="mt-1 max-w-2xl font-sans text-[13px] leading-relaxed text-neutral-500">
            {lede}
          </p>
        ) : null}
      </div>
      {action && typeof action === "object" && "href" in action ? (
        <Link
          href={action.href}
          className="shrink-0 border border-neutral-600 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-200 hover:border-neutral-400 hover:bg-neutral-900"
        >
          {action.label}
        </Link>
      ) : (
        action
      )}
    </header>
  );
}
