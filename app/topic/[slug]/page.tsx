import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import TopicExplorer from "@/components/TopicExplorer";
import NewsLeftOut from "@/components/NewsLeftOut";
import AdSlot from "@/components/AdSlot";
import SourcesPanel from "@/components/SourcesPanel";
import SearchBox from "@/components/SearchBox";
import TopicSummary from "@/components/TopicSummary";
import StoredBadge from "@/components/StoredBadge";
import JsonLd from "@/components/JsonLd";
import FollowBar from "@/components/FollowBar";
import { getTopicPageData } from "@/lib/page-data";
import { absolute, breadcrumbLd, clampDescription, SITE_NAME, subjectPath } from "@/lib/seo";
import { focusFromParam } from "@/lib/focus";
import { focusedMetadata } from "@/lib/focusMeta";
import { capHistory, DEFAULT_MAX_HISTORY } from "@/lib/historyCap";
import { focusHref } from "@/lib/searchChoice";

const latestDate = (events: { date: string }[]) => events.reduce((m, e) => (e.date > m ? e.date : m), "");

// No route-level revalidate: it never applied (the route is dynamic — a miss runs a first-visit
// gather and must never be cached), and it read as if pages were cached. The held-page reads in
// lib/page-data.ts carry the 15-minute cache instead (NC-159).

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: SearchParams;
}): Promise<Metadata> {
  const data = await getTopicPageData(decodeURIComponent((await params).slug));
  if (!data) return { title: "Topic not found", robots: { index: false } };
  // a focused link's preview says what the focused page shows (NC-003), counted over the rows the
  // explorer narrows on its first render, its Wikipedia entries capped as a new reader's are
  const focus = focusFromParam((await searchParams).focus);
  const focused = focusedMetadata({
    label: data.title,
    path: subjectPath("topic", data.slug),
    events: capHistory(data.events, DEFAULT_MAX_HISTORY),
    focus,
    priced: data.prices.length > 1,
    ogType: "article",
  });
  if (focused) return focused;
  const title = `${data.title} timeline`;
  const description = data.summary
    ? clampDescription(data.summary)
    : `A timeline of ${data.title}: history, news, and key events on one axis.`;
  // From the stored slug, never params.slug: Next passes the segment still percent-encoded, and
  // encoding it again declared /topic/electric%2520cars — a not-found page — canonical (NC-158).
  const url = absolute(subjectPath("topic", data.slug));
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title: `${title} · ${SITE_NAME}`, description, url, type: "article" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function TopicPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SearchParams }) {
  const topic = decodeURIComponent((await params).slug);
  // read here, so the page arrives narrowed rather than narrowing once its script runs (NC-003)
  const focus = focusFromParam((await searchParams).focus);
  const data = await getTopicPageData(topic);
  // A miss must never be cached — same rule and reasoning as the company page: a transient
  // gather failure would otherwise pin the miss for the whole revalidate window.
  if (!data) {
    noStore();
    notFound();
  }
  // A company reached through a topic address (its slug, or an old name stored as an alias) has
  // its own page, with its price chart and filings; a topic layout would drop both.
  // Both redirects keep the question the link asked.
  if (data.companyTicker) redirect(focusHref(subjectPath("company", data.slug, data.companyTicker), focus));
  // Another phrasing of a held topic is served from the same rows; send the visitor to the one
  // address the topic is stored under, so a typed wording never stands as a page (NC-157).
  if (data.slug !== topic.trim().toLowerCase()) redirect(focusHref(subjectPath("topic", data.slug), focus));

  return (
    <div>
      <JsonLd
        data={breadcrumbLd([
          { name: SITE_NAME, path: "/" },
          { name: "Explore", path: "/explore" },
          { name: data.title, path: subjectPath("topic", data.slug) },
        ])}
      />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-violet-400">
            Topic timeline
            <StoredBadge refreshedAt={data.refreshedAt} />
          </p>
          <h1 className="text-2xl font-black leading-tight text-slate-100">{data.title}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <FollowBar
            subject={{ href: `/topic/${encodeURIComponent(topic)}`, kind: "topic", label: data.title }}
            signature={{ count: data.events.length, latest: latestDate(data.events) }}
          />
          <SearchBox />
        </div>
      </div>

      {data.summary && <TopicSummary text={data.summary} wikipediaTitle={data.wikipediaTitle} />}

      <NewsLeftOut events={data.events} leftOut={data.newsLeftOut} priced={data.prices.length > 1} />
      <TopicExplorer events={data.events} prices={data.prices} subject={data.title} initialFocus={focus} />

      {/* min-w-0 on both items: a grid item cannot shrink below its own content by default,
          and the source names and attribution lines are long enough to push a phone sideways
          even though they are individually truncated. */}
      <div className="mt-8 grid gap-4 lg:grid-cols-[2fr_1fr] *:min-w-0">
        <SourcesPanel slug={topic} />
        <AdSlot />
      </div>
      <div className="mt-4">
        <AdSlot format="billboard" />
      </div>
    </div>
  );
}
