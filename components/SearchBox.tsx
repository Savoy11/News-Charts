"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SearchBox({ large = false }: { large?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/resolve?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      // the qualifier from a natural-language prompt rides along so the page can use it
      const focus = json.focus ? `?focus=${encodeURIComponent(json.focus)}` : "";
      if (json.kind === "company") router.push(`/company/${json.ticker}${focus}`);
      else if (json.kind === "topic") router.push(`/topic/${json.slug}${focus}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className={`flex w-full ${large ? "max-w-2xl" : "max-w-md"} gap-2`}>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="AAPL, bicycle, or “history of Alibaba in the US”…"
        // min-w-0: an input carries an intrinsic default width, and flex-1 alone won't shrink
        // below it, so the form pushed a few pixels past a narrow phone viewport.
        className={`min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 text-slate-100 placeholder-slate-500 focus:border-sky-500 focus:outline-none ${
          large ? "px-5 py-4 text-lg" : "px-4 py-2 text-sm"
        }`}
      />
      <button
        type="submit"
        disabled={busy}
        className={`rounded-lg bg-sky-600 font-semibold text-white hover:bg-sky-500 disabled:opacity-50 ${
          large ? "px-6 py-4 text-lg" : "px-4 py-2 text-sm"
        }`}
      >
        {busy ? "…" : "Explore"}
      </button>
    </form>
  );
}
