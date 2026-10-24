"use client";

import { composableFocus, type FocusResult } from "@/lib/focus";

/**
 * Says what the timeline is currently showing, and offers the way out.
 *
 * A narrowed view that does not announce itself is indistinguishable from a subject with very
 * little history, so this is never decoration — it is the thing that keeps the filter honest.
 * The zero-match case gets its own wording because "nothing here mentions Trump" is a genuine
 * answer to the question, and showing an empty page instead would read as "we have nothing on
 * IBM at all".
 *
 * So does a focus with nothing to search for (batch 39). "How did the US affect Ford" leaves "the
 * US": two words too short or too common to look for in a headline, and no year. Nothing was
 * narrowed, so every event came back, and the bar used to say "Showing the 52 of 52 events that
 * mention “the US”": a match it never made.
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
  const dated = result.window?.label;
  const worded = result.terms.length > 0;
  const unsearchable = !worded && !dated;
  const none = result.matched === 0 || unsearchable;
  // A qualifier ("in 2020") has no timeline of its own, so there is nothing to compose with.
  const composeWith = composableFocus(focus);
  /**
   * Say which other words counted, or an event that never says "covid" looks like a mistake in
   * a covid-narrowed view. A few are enough to show the idea; the full list is lib/concepts.ts.
   */
  const alsoMatched =
    worded && result.related.length > 0
      ? ` or a related word (${result.related.slice(0, 4).join(", ")}${result.related.length > 4 ? ", …" : ""})`
      : "";
  return (
    <div
      data-focus-bar
      className={`mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border p-3 text-xs ${
        none
          ? "border-amber-800/50 bg-amber-500/5 text-amber-300/90"
          : "border-sky-800/50 bg-sky-500/5 text-sky-200/90"
      }`}
    >
      {unsearchable ? (
        <span>
          Nothing in <strong>“{focus}”</strong> can be looked for in headlines: words under three
          letters and common words like “the” are skipped. This is the whole timeline.
        </span>
      ) : none ? (
        <span>
          {worded ? (
            <>
              Nothing on this timeline mentions <strong>“{focus}”</strong>
              {alsoMatched}
            </>
          ) : (
            <>
              Nothing on this timeline is dated <strong>{dated}</strong>
            </>
          )}{" "}
          — showing everything instead. That is an answer too: no overlap in what we have.
        </span>
      ) : (
        <span>
          Showing the <strong>{result.matched}</strong> of {result.total} events{" "}
          {dated && !worded ? (
            <>
              dated <strong>{dated}</strong>
            </>
          ) : (
            <>
              {dated ? <>dated {dated} that match</> : "that mention"} <strong>“{focus}”</strong>
              {alsoMatched}
            </>
          )}
          , against the price.
        </span>
      )}
      <button
        type="button"
        onClick={onClear}
        className="rounded-sm border border-current/30 px-2 py-0.5 font-semibold opacity-80 hover:opacity-100"
      >
        {none ? "Dismiss" : "Show everything"}
      </button>
      {/* The other honest reading of the same question: the influence's own timeline against this
          price. It answers "what was he doing" rather than "what did he do to this company", so
          it is offered rather than chosen for the reader. */}
      {composeWith && (
        <a
          href={`/compare?a=${encodeURIComponent(composeWith)}&b=${encodeURIComponent(subject)}`}
          className="rounded-sm border border-current/30 px-2 py-0.5 font-semibold opacity-80 hover:opacity-100"
        >
          “{composeWith}” on its own timeline →
        </a>
      )}
    </div>
  );
}
