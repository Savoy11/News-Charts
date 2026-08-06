"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CLIENT_BUDGET_MS } from "@/lib/timeout";

export default function SearchBox({ large = false }: { large?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  /**
   * What went wrong, for the visitor rather than for the console.
   *
   * This awaited `/api/resolve` with no deadline and no failure branch, so a slow or failed
   * resolve left the button reading "…" for ever with nothing on screen to explain it. The route
   * reaches the SEC ticker index, which rate-limits by User-Agent — a few scheduled refresh runs
   * are enough to make the front door look broken to everybody.
   *
   * A search that cannot be answered has to *say so and stay retryable*. Silence reads as a dead
   * site, which is a worse claim than the truth.
   */
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/resolve?q=${encodeURIComponent(q)}`, {
        // The server bounds its own network rungs; this is the backstop for everything else —
        // a dropped connection, a hung dev server, a laptop that slept mid-request.
        signal: AbortSignal.timeout(CLIENT_BUDGET_MS),
      });
      if (!res.ok) throw new Error(`resolve responded ${res.status}`);
      const json = await res.json();
      // the qualifier from a natural-language prompt rides along so the page can use it
      const focus = json.focus ? `focus=${encodeURIComponent(json.focus)}` : "";
      const query = (existing: string) =>
        [existing, focus].filter(Boolean).length ? `?${[existing, focus].filter(Boolean).join("&")}` : "";

      // A relational question lands on the affected subject with the influence as a focus, which
      // narrows that subject's own timeline — the intersection the question asks about. The
      // two-subject compose stays one click away from the focus bar there.
      if (json.kind === "company") router.push(`/company/${json.ticker}${query("")}`);
      else if (json.kind === "topic") router.push(`/topic/${json.slug}${query("")}`);
      // `none` is what an empty query resolves to; anything else is a shape we don't know.
      else setError("That didn't resolve to a subject. Try a ticker, a company name, or a topic.");
    } catch (err) {
      // Named separately because they need different things from the reader: one is worth
      // retrying in a moment, the other usually means the site itself is unreachable.
      const timedOut = err instanceof DOMException && err.name === "TimeoutError";
      setError(
        timedOut
          ? "Search is taking too long — a source we check is slow right now. Try again."
          : "Couldn't reach search just now. Try again."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`w-full ${large ? "max-w-2xl" : "max-w-md"}`}>
      <form onSubmit={submit} className="flex w-full gap-2">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            // A stale failure sitting under a query the visitor has since changed is its own kind
            // of lie: it describes an attempt that no longer matches what is in the box.
            if (error) setError(null);
          }}
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
      {error && (
        // Announced rather than only drawn: the visitor's attention is on the button they just
        // pressed, and a message appearing silently below it can go unread while they press again.
        <p role="status" aria-live="polite" data-search-error className="mt-2 text-sm text-amber-400">
          {error}
        </p>
      )}
    </div>
  );
}
