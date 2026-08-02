import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import AuthForm from "../_ui/auth-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await currentUser()) redirect("/app");

  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-neutral-600">
          Quartermaster
        </p>
        <h1 className="mt-2 font-sans text-xl text-neutral-100">Welcome back.</h1>
        <p className="mb-6 mt-1 font-sans text-[13px] leading-relaxed text-neutral-500">
          Your agents kept working while you were gone.
        </p>

        <AuthForm mode="login" />

        <p className="mt-6 font-sans text-[12px] text-neutral-600">
          No account yet?{" "}
          <Link href="/signup" className="text-neutral-300 underline underline-offset-4">
            Create one
          </Link>
        </p>
      </div>
    </main>
  );
}
