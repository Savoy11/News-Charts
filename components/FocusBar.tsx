"use client";

import type { FocusResult } from "@/lib/focus";

/**
 * Says what the timeline is currently showing, and offers the way out.
 *
 * A narrowed view that does not announce itself is indistinguishable from a subject with very
 * little history, so this is never decoration — it is the thing that keeps the filter honest.
 * The zero-match case gets its own wording because "nothing here mentions Trump" is a genuine
 * answer to the question, and showing an empty page instead would read as "we have nothing on
 * IBM at all".
 */
export default function FocusBar({
  focus,
  result,
  subject,
  onClear,
}: {
  focus: string;
  result: FocusResult;
  /** this page's subject, for the "against its own timeline" compose link */
  subject: string;
  onClear: () => void;
}) {
  const none = result.matched === 0;
  return (
    <div
      data-focus-bar
      className={`mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border p-3 text-xs ${
        none
          ? "border-amber-800/50 bg-amber-500/5 text-amber-300/90"
          : "border-sky-800/50 bg-sky-500/5 text-sky-200/90"
      }`}
    >
      {none ? (
        <span>
          Nothing on this timeline mentions <strong>“{focus}”</strong> — showing everything
          instead. That is an answer too: no overlap in what we have.
        </span>
      ) : (
        <span>
          Showing the <strong>{result.matched}</strong> of {result.total} events that mention{" "}
          <strong>“{focus}”</strong>, against the price.
        </span>
      )}
      <button
        type="button"
        onClick={onClear}
        className="rounded border border-current/30 px-2 py-0.5 font-semibold opacity-80 hover:opacity-100"
      >
        {none ? "Dismiss" : "Show everything"}
      </button>
      {/* The other honest reading of the same question: the influence's own timeline against this
          price. It answers "what was he doing" rather than "what did he do to this company", so
          it is offered rather than chosen for the reader. */}
      <a
        href={`/compare?a=${encodeURIComponent(focus)}&b=${encodeURIComponent(subject)}`}
        className="rounded border border-current/30 px-2 py-0.5 font-semibold opacity-80 hover:opacity-100"
      >
        “{focus}” on its own timeline →
      </a>
    </div>
  );
}
