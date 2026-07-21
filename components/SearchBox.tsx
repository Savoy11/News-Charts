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
      if (json.kind === "company") router.push(`/company/${json.ticker}`);
      else if (json.kind === "topic") router.push(`/topic/${json.slug}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className={`flex w-full ${large ? "max-w-2xl" : "max-w-md"} gap-2`}>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search a ticker (AAPL) or any topic (bicycle)…"
        className={`flex-1 rounded-lg border border-slate-700 bg-slate-900 text-slate-100 placeholder-slate-500 focus:border-sky-500 focus:outline-none ${
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
