"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Where refusals reach you.
 *
 * Phone used to be signup-only, so anyone who skipped it could never be
 * texted again — the escalation would sit in the inbox forever while they
 * waited for a message that was never coming.
 */
export default function AccountForm({
  displayName,
  phone,
}: {
  displayName: string;
  phone: string | null;
}) {
  const router = useRouter();
  const [form, setForm] = useState({ displayName, phone: phone ?? "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "could not save that");
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("could not reach the server");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex max-w-lg flex-col gap-5">
      <label className="flex flex-col gap-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">
          Your name
        </span>
        <input
          value={form.displayName}
          onChange={(e) =>
            setForm((f) => ({ ...f, displayName: e.target.value }))
          }
          className={input}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">
          Mobile number
        </span>
        <input
          type="tel"
          placeholder="415 555 0142"
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          className={input}
        />
        <span className="font-sans text-[12px] leading-relaxed text-neutral-600">
          When your agent hits a limit it texts this number and waits for your
          reply — APPROVE, DECLINE, or RAISE CAP TO $60. Leave it empty and
          refusals wait in Approvals instead.
        </span>
      </label>

      {error ? (
        <p className="border-l-2 border-red-500 pl-2 font-mono text-[11px] text-red-400">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="border-l-2 border-emerald-600 pl-2 font-sans text-[12px] text-emerald-400">
          Saved.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="self-start border border-neutral-500 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-100 hover:border-neutral-300 hover:bg-neutral-900 disabled:opacity-40"
      >
        {busy ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

const input =
  "w-full border border-neutral-800 bg-transparent px-2 py-2 font-mono text-[13px] text-neutral-100 outline-none placeholder:text-neutral-700 focus:border-neutral-500";
