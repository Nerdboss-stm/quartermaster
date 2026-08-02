"use client";

import { useEffect, useState } from "react";

interface Pending {
  runId: string;
  failingDetail: string;
  options: string[];
  at: string;
}

/** Console-channel approval surface (fallback + guest runs). Replies go
 *  through the same strict parser as iMessage replies. */
export default function ApprovalStrip() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [capDollars, setCapDollars] = useState("47");
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const res = await fetch("/api/escalations/pending", { cache: "no-store" });
        const data = (await res.json()) as { pending: Pending | null };
        if (active) setPending(data.pending);
      } catch {
        // console not migrated yet
      }
    };
    check();
    const interval = setInterval(check, 2000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const reply = async (raw: string) => {
    setNotice(null);
    const res = await fetch("/api/escalations/reply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ raw }),
    });
    const data = (await res.json()) as { correction?: string | null; error?: string };
    if (data.correction) setNotice(data.correction);
    else if (data.error) setNotice(data.error);
    else setPending(null);
  };

  if (!pending) return null;

  return (
    <div className="mt-3 border border-neutral-700 p-3 font-mono text-[11px] leading-5">
      <div className="uppercase tracking-[0.2em] text-neutral-500">
        Escalation pending
      </div>
      <div className="mt-1 text-neutral-300">{pending.failingDetail}</div>
      <div className="mt-2 flex items-center gap-2">
        <button
          className="border border-neutral-600 px-2 py-1 uppercase"
          onClick={() => reply("APPROVE")}
        >
          Approve
        </button>
        <button
          className="border border-neutral-600 px-2 py-1 uppercase"
          onClick={() => reply("DECLINE")}
        >
          Decline
        </button>
        <span className="ml-2">$</span>
        <input
          className="w-14 border border-neutral-700 bg-transparent px-1 py-1"
          value={capDollars}
          onChange={(e) => setCapDollars(e.target.value)}
        />
        <button
          className="border border-neutral-600 px-2 py-1 uppercase"
          onClick={() => reply(`RAISE CAP TO $${capDollars}`)}
        >
          Raise cap
        </button>
      </div>
      {notice ? (
        <div className="mt-2 whitespace-pre-wrap text-neutral-500">{notice}</div>
      ) : null}
    </div>
  );
}
