import type { Metadata } from "next";
import { applyFocus, focusPreview } from "./focus";
import { focusHref } from "./searchChoice";
import { absolute, clampDescription, SITE_NAME } from "./seo";
import type { TimelineEvent } from "./types";

/**
 * The rows a company page's focus narrows, as its explorer counts them on the first render: the
 * company's own, and the economy's too when the focus is about the economy, which turns that chip on
 * (CompanyExplorer's `macroMatchesFocus`). check:focus holds the two counts equal.
 */
export function companyFocusPool(events: TimelineEvent[], macro: TimelineEvent[], focus: string | null): TimelineEvent[] {
  return focus && applyFocus(macro, focus).active ? [...events, ...macro] : events;
}

/**
 * A focused page's own title, description and Open Graph text (NC-003). "How did covid affect Best
 * Buy" opens `/company/BBY?focus=covid`, and the link it leaves is the one a reader shares: its
 * preview said only "Best Buy (BBY) timeline", the page before the question. It now says what the
 * page shows, "Best Buy (BBY) timeline: 12 events on “covid”", and the description names the best
 * match, both in words the page's own records hold (`focusPreview`). A focus that narrows nothing
 * returns null, and the page keeps its plain metadata.
 *
 * The canonical address stays the page's own: a focused view is one reading of that page, and a
 * crawler that followed every focus anyone typed would index the same rows under endless addresses.
 * The Open Graph address is the focused one, so the shared link opens what its preview describes.
 */
export function focusedMetadata(opts: {
  /** "Best Buy (BBY)", "Electric cars": the page's own name for its subject */
  label: string;
  /** the page's own path, "/company/BBY" */
  path: string;
  /** the rows the page narrows, as the explorer counts them */
  events: TimelineEvent[];
  focus: string | null;
  /** whether the page has a chart, which the description then names */
  priced: boolean;
  ogType: "website" | "article";
}): Metadata | null {
  const preview = focusPreview(opts.events, opts.focus);
  if (!preview || !opts.focus) return null;
  const count = `${preview.matched.toLocaleString("en-US")} ${preview.matched === 1 ? "event" : "events"}`;
  const title = `${opts.label} timeline: ${count} ${preview.phrase}`;
  const best = clampDescription(preview.best.title, 110);
  const description = clampDescription(
    `${count} of ${preview.total.toLocaleString("en-US")} on the ${opts.label} timeline ${preview.phrase}${opts.priced ? ", against the price" : ""}. Best match, ${preview.best.date}: “${best}”`,
    240
  );
  const url = absolute(focusHref(opts.path, opts.focus));
  return {
    title,
    description,
    alternates: { canonical: absolute(opts.path) },
    openGraph: { title: `${title} · ${SITE_NAME}`, description, url, type: opts.ogType },
    twitter: { card: "summary_large_image", title, description },
  };
}
