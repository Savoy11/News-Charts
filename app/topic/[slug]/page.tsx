import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import TopicExplorer from "@/components/TopicExplorer";
import AdSlot from "@/components/AdSlot";
import SourcesPanel from "@/components/SourcesPanel";
import SearchBox from "@/components/SearchBox";
import TopicSummary from "@/components/TopicSummary";
import StoredBadge from "@/components/StoredBadge";
import JsonLd from "@/components/JsonLd";
import FollowBar from "@/components/FollowBar";
import { getTopicPageData } from "@/lib/page-data";
import { absolute, breadcrumbLd, clampDescription, SITE_NAME, subjectPath } from "@/lib/seo";

const latestDate = (events: { date: string }[]) => events.reduce((m, e) => (e.date > m ? e.date : m), "");

// No route-level revalidate: it never applied (the route is dynamic — a miss runs a first-visit
// gather and must never be cached), and it read as if pages were cached. The held-page reads in
// lib/page-data.ts carry the 15-minute cache instead (NC-159).

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const data = await getTopicPageData(decodeURIComponent(params.slug));
  if (!data) return { title: "Topic not found", robots: { index: false } };
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

export default async function TopicPage({ params }: { params: { slug: string } }) {
  const topic = decodeURIComponent(params.slug);
  const data = await getTopicPageData(topic);
  // A miss must never be cached — same rule and reasoning as the company page: a transient
  // gather failure would otherwise pin the miss for the whole revalidate window.
  if (!data) {
    noStore();
    notFound();
  }
  // Another phrasing of a held topic is served from the same rows; send the visitor to the one
  // address the topic is stored under, so a typed wording never stands as a page (NC-157).
  if (data.slug !== topic.trim().toLowerCase()) redirect(subjectPath("topic", data.slug));

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

      <TopicExplorer events={data.events} prices={data.prices} subject={data.title} />

      {/* min-w-0 on both items: a grid item cannot shrink below its own content by default,
          and the source names and attribution lines are long enough to push a phone sideways
          even though they are individually truncated. */}
      <div className="mt-8 grid gap-4 lg:grid-cols-[2fr_1fr] [&>*]:min-w-0">
        <SourcesPanel slug={decodeURIComponent(params.slug)} />
        <AdSlot />
      </div>
      <div className="mt-4">
        <AdSlot format="billboard" />
      </div>
    </div>
  );
}
