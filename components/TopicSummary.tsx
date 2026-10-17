"use client";

import { useState } from "react";

const wikiUrl = (title: string) =>
  `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;

/**
 * One-line teaser by default so the timeline stays above the fold; expands on demand.
 *
 * The text is Wikipedia's lede, reused under CC BY-SA, which asks for the credit where the text
 * is — a line in the Sources panel further down the page is not beside it (NC-047). Always
 * visible, including while the teaser is collapsed.
 */
export default function TopicSummary({ text, wikipediaTitle }: { text: string; wikipediaTitle?: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-3 text-sm text-slate-400">
      <div className="flex items-start gap-2">
        <p className={open ? "" : "line-clamp-1"}>{text}</p>
        <button
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 text-xs font-semibold text-sky-400 hover:text-sky-300"
        >
          {open ? "Less" : "More"}
        </button>
      </div>
      <p data-wikipedia-credit className="mt-0.5 text-xs text-slate-400">
        From{" "}
        {wikipediaTitle ? (
          <a href={wikiUrl(wikipediaTitle)} target="_blank" rel="noopener noreferrer" className="underline decoration-slate-600 underline-offset-2 hover:text-sky-300">
            Wikipedia’s “{wikipediaTitle}” article
          </a>
        ) : (
          "Wikipedia"
        )}
        , by its contributors ·{" "}
        <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer" className="underline decoration-slate-600 underline-offset-2 hover:text-sky-300">
          CC BY-SA 4.0
        </a>
      </p>
    </div>
  );
}
