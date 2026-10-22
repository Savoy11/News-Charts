import type { TimelineEvent } from "@/lib/types";

/**
 * Says so when a page carries fewer news stories than it holds (batch 35). `boundPageNews` keeps a
 * page's cached entry under Next's 2 MB by leaving stories out, and a timeline that silently ends
 * its news at 659 of 3,090 stories would read as all there is.
 */
export default function NewsLeftOut({
  events,
  leftOut,
  priced,
}: {
  events: TimelineEvent[];
  leftOut: number;
  priced: boolean;
}) {
  if (leftOut <= 0) return null;
  const kept = events.filter((e) => e.type === "news").length;
  const count = (n: number) => n.toLocaleString("en-US");
  return (
    <p className="mb-3 text-xs text-slate-400">
      Showing {count(kept)} of the {count(kept + leftOut)} news stories stored for this page, so it
      stays quick to load: the newest, then the strongest of {priced ? "the days the price moved most" : "earlier days"}.
      Every filing and other record is here.
    </p>
  );
}
