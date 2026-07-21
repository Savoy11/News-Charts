"use client";

import { useState } from "react";

/** One-line teaser by default so the timeline stays above the fold; expands on demand. */
export default function TopicSummary({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-3 flex items-start gap-2 text-sm text-slate-400">
      <p className={open ? "" : "line-clamp-1"}>{text}</p>
      <button
        onClick={() => setOpen((v) => !v)}
        className="shrink-0 text-xs font-semibold text-sky-400 hover:text-sky-300"
      >
        {open ? "Less" : "More"}
      </button>
    </div>
  );
}
