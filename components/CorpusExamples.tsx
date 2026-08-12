"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Suggestion } from "@/lib/suggestions";

/**
 * Subjects this site actually holds, offered as a way out of a dead end.
 *
 * The "Not on News Charts yet" page used to end with "try a ticker like AAPL or a broader topic
 * like bicycle" — two names hardcoded in the markup, neither of which the corpus is guaranteed to
 * hold. That is the same broken promise commit cf9d820 fixed on the homepage, still live on the
 * one page a visitor reaches *because* something was missing: they search, get told it isn't here,
 * follow the example offered, and get told that isn't here either. A dead end that reads as a
 * broken site.
 *
 * So the examples come from `/api/suggestions` — the corpus-first endpoint the homepage chips use
 * — and **`padded` entries are dropped**. Padding is the seed pool standing in to keep the
 * homepage full; on this page a stand-in would recreate the exact bug, because the reader is here
 * to be shown something that works.
 *
 * Fetched on the client rather than read from the database on the server: `/_not-found` is
 * statically prerendered, so a server-side query would bake one build's corpus into the page and
 * serve it forever.
 *
 * Renders nothing at all when the corpus has nothing to offer — an empty database, or one we
 * cannot reach. Saying nothing is the honest floor; a suggestion is a promise about what is here.
 */
export default function CorpusExamples({ count = 5 }: { count?: number }) {
  const [have, setHave] = useState<Suggestion[]>([]);

  useEffect(() => {
    let live = true;
    fetch("/api/suggestions")
      .then((r) => (r.ok ? r.json() : { suggestions: [] }))
      .then((json: { suggestions?: Suggestion[] }) => {
        if (!live) return;
        setHave((json.suggestions ?? []).filter((s) => !s.padded).slice(0, count));
      })
      .catch(() => {
        /* an empty row is the fallback, and it is already the initial state */
      });
    return () => {
      live = false;
    };
  }, [count]);

  if (!have.length) return null;

  return (
    <div className="mt-6">
      <p className="text-sm text-slate-500">On News Charts right now:</p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        {have.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            /* Same rule as SuggestionChips: no prefetch, so a decorative link never triggers
               a first-visit gather. (These are corpus-held subjects, so the risk is smaller,
               but the read alone is not worth paying per render of a miss page.) */
            prefetch={false}
            className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-sm text-slate-300 hover:border-sky-500 hover:text-sky-300"
          >
            {s.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
