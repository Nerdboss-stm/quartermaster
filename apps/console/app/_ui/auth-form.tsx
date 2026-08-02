"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Sign in / sign up. Deliberately small: the product's job is to get out of
 * the way here and show the desk.
 */
export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const signup = mode === "signup";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: data.get("email"),
          password: data.get("password"),
          ...(signup
            ? {
                displayName: data.get("displayName"),
                phone: data.get("phone") ?? "",
              }
            : {}),
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "something went wrong");
        return;
      }
      router.push("/app");
      router.refresh();
    } catch {
      setError("could not reach the server");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-3">
      {signup ? (
        <Field name="displayName" label="Name" autoComplete="name" required />
      ) : null}
      <Field
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        required
      />
      <Field
        name="password"
        label="Password"
        type="password"
        autoComplete={signup ? "new-password" : "current-password"}
        required
      />
      {signup ? (
        <Field
          name="phone"
          label="Phone for approvals"
          type="tel"
          autoComplete="tel"
          hint="Where your agent texts you when a purchase needs your call. Optional."
        />
      ) : null}

      {error ? (
        <p className="border-l-2 border-red-500 pl-2 font-mono text-[11px] text-red-400">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="mt-1 border border-neutral-500 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-100 transition-colors hover:border-neutral-300 hover:bg-neutral-900 disabled:opacity-40"
      >
        {busy ? "…" : signup ? "Create account" : "Sign in"}
      </button>
    </form>
  );
}

function Field({
  name,
  label,
  hint,
  ...rest
}: {
  name: string;
  label: string;
  hint?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">
        {label}
      </span>
      <input
        name={name}
        {...rest}
        className="border border-neutral-800 bg-transparent px-2 py-2 font-mono text-[12px] text-neutral-100 outline-none focus:border-neutral-500"
      />
      {hint ? (
        <span className="font-sans text-[11px] leading-snug text-neutral-600">
          {hint}
        </span>
      ) : null}
    </label>
  );
}
