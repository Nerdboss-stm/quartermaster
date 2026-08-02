import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { currentUser } from "@/lib/auth";
import { sqlGet } from "@/lib/db";
import Nav from "../_ui/nav";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const pending = await sqlGet<{ n: number }>(
    "SELECT COUNT(*) AS n FROM escalations WHERE owner_id = ? AND status = 'pending'",
    [user.id]
  );

  return (
    <div className="flex min-h-dvh bg-neutral-950">
      <Nav
        displayName={user.display_name}
        pendingCount={Number(pending?.n ?? 0)}
      />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
