"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CLIENT_BUDGET_MS } from "@/lib/timeout";
import type { SearchOption } from "@/lib/searchChoice";

/** How a candidate matched, in words a reader can weigh. */
const MATCHED: Record<SearchOption["via"], string> = {
  ticker: "ticker",
  name: "exact name",
  alias: "also known as",
  prefix: "name starts with your search",
  fuzzy: "similar name",
};

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
  /** Several held subjects matched about equally — the visitor picks, not the sort order (NC-039). */
  const [options, setOptions] = useState<SearchOption[] | null>(null);
  /** The options only resemble the query — nothing matched, so they are offered as a question. */
  const [suggested, setSuggested] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim() || busy) return;
    setBusy(true);
    setError(null);
    setOptions(null);
    setSuggested(false);
    try {
      const res = await fetch(`/api/resolve?q=${encodeURIComponent(q)}`, {
        // The server bounds its own network rungs; this is the backstop for everything else —
        // a dropped connection, a hung dev server, a laptop that slept mid-request.
        signal: AbortSignal.timeout(CLIENT_BUDGET_MS),
      });
      if (!res.ok) throw new Error(`resolve responded ${res.status}`);
      const json = await res.json();
      if (json.kind === "company") router.push(`/company/${json.ticker}`);
      else if (json.kind === "topic") router.push(`/topic/${json.slug}`);
      else if (json.kind === "choose") setOptions(json.options as SearchOption[]);
      else if (json.kind === "suggest") {
        setOptions(json.options as SearchOption[]);
        setSuggested(true);
      }
      // `none` is a real answer now, not just the empty-query case: the query named no listed
      // security and nothing the corpus holds. Say what the site is for instead of guessing.
      else
        setError(
          "That didn't match a listed security. Try a ticker (AAPL, SPY, VTSAX) or a company or fund name."
        );
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
      {/* action + name are the pre-hydration floor: until React attaches `submit`, a native
          submit performs a real search through /search (which redirects), instead of the silent
          reload of `/` that swallowed the query. After hydration, preventDefault wins. */}
      <form onSubmit={submit} action="/search" method="get" className="flex w-full gap-2">
        <input
          name="q"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            // A stale failure sitting under a query the visitor has since changed is its own kind
            // of lie: it describes an attempt that no longer matches what is in the box. The same
            // goes for a choice offered for a different query.
            if (error) setError(null);
            if (options) setOptions(null);
          }}
          placeholder="AAPL, SPY, VTSAX, or a company or fund name…"
          // A placeholder is not a label: it vanishes on the first keystroke and many screen
          // readers do not announce it (NC-167).
          aria-label="Search for a stock, ETF, fund or company name"
          // min-w-0: an input carries an intrinsic default width, and flex-1 alone won't shrink
          // below it, so the form pushed a few pixels past a narrow phone viewport.
          className={`min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 text-slate-100 placeholder-slate-500 focus:border-sky-500 focus:outline-hidden ${
            large ? "px-5 py-4 text-lg" : "px-4 py-2 text-sm"
          }`}
        />
        <button
          type="submit"
          disabled={busy}
          className={`rounded-lg bg-sky-700 font-semibold text-white hover:bg-sky-800 disabled:opacity-50 ${
            large ? "px-6 py-4 text-lg" : "px-4 py-2 text-sm"
          }`}
        >
          {busy ? "…" : "Explore"}
        </button>
      </form>
      {options && (
        <div
          role="status"
          aria-live="polite"
          data-search-choices
          data-search-suggested={suggested || undefined}
          className="mt-2 rounded-lg border border-slate-700 bg-slate-900 p-2"
        >
          <p className="px-1 pb-1 text-xs text-slate-400">
            {suggested ? "No exact match. Did you mean…" : "Several matches — which did you mean?"}
          </p>
          <ul>
            {options.map((o) => (
              <li key={o.href}>
                <Link
                  href={o.href}
                  className="flex items-baseline justify-between gap-3 rounded-md px-2 py-1.5 text-sm text-slate-100 hover:bg-slate-800"
                >
                  <span className="min-w-0 truncate">
                    {o.label} <span className="text-slate-400">· {o.detail}</span>
                  </span>
                  <span className="shrink-0 text-[11px] text-slate-400">{MATCHED[o.via]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
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
