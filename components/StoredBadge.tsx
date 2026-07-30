import type { RefreshedAt } from "@/lib/page-data";

/**
 * Small honesty badge: this page was served out of the News Charts database, and this is when
 * that copy was last written.
 *
 * It replaces a `stored` / `live` badge. Pages fetched live on a miss until commit 813d505 moved
 * fetching to `npm run refresh`, after which the `live` arm was unreachable and every page showed
 * `stored` — a two-state badge asserting a comparison nothing performed any more. The honest
 * question on a database-only site is not which path served the page but how old what it served
 * is, so the age is what the badge now carries.
 *
 * The date is absolute rather than "3 hours ago" on purpose: these pages are cached, and a
 * relative age rendered once and served for an hour is a fresher claim than the truth.
 */
export default function StoredBadge({ refreshedAt }: { refreshedAt: RefreshedAt }) {
  const when = refreshedAt
    ? `${refreshedAt.toISOString().slice(0, 16).replace("T", " ")} UTC`
    : null;
  return (
    <span
      title={
        when
          ? `Served from the News Charts database — last refreshed ${when}`
          : "Served from the News Charts database — no refresh recorded for this subject"
      }
      className="rounded-full border border-teal-800/60 bg-teal-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-teal-400"
    >
      stored{when ? ` · ${when.slice(0, 10)}` : ""}
    </span>
  );
}
