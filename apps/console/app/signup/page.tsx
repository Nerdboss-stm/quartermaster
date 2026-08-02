import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import AuthForm from "../_ui/auth-form";

export const dynamic = "force-dynamic";

export default async function SignupPage() {
  if (await currentUser()) redirect("/app");

  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-neutral-600">
          Quartermaster
        </p>
        <h1 className="mt-2 font-sans text-xl text-neutral-100">
          Give your agent an allowance.
        </h1>
        <p className="mb-6 mt-1 font-sans text-[13px] leading-relaxed text-neutral-500">
          Not your wallet. You set the limits; it works inside them and wakes
          you only when it has to.
        </p>

        <AuthForm mode="signup" />

        <p className="mt-6 font-sans text-[12px] text-neutral-600">
          Already have an account?{" "}
          <Link href="/login" className="text-neutral-300 underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
