import type { Metadata } from "next";
import { notFound } from "next/navigation";
import TopicExplorer from "@/components/TopicExplorer";
import AdSlot from "@/components/AdSlot";
import CaepPromo from "@/components/CaepPromo";
import SourcesPanel from "@/components/SourcesPanel";
import SearchBox from "@/components/SearchBox";
import TopicSummary from "@/components/TopicSummary";
import ServedFrom from "@/components/ServedFrom";
import JsonLd from "@/components/JsonLd";
import FollowBar from "@/components/FollowBar";
import { getTopicPageData } from "@/lib/page-data";
import { absolute, breadcrumbLd, clampDescription, SITE_NAME } from "@/lib/seo";

const latestDate = (events: { date: string }[]) => events.reduce((m, e) => (e.date > m ? e.date : m), "");

// short enough that a page rendered while a source was throttled self-heals quickly
export const revalidate = 900;

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
  const url = absolute(`/topic/${encodeURIComponent(params.slug)}`);
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
  if (!data) notFound();

  return (
    <div>
      <JsonLd
        data={breadcrumbLd([
          { name: SITE_NAME, path: "/" },
          { name: "Explore", path: "/explore" },
          { name: data.title, path: `/topic/${encodeURIComponent(params.slug)}` },
        ])}
      />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-violet-400">
            Topic timeline
            <ServedFrom source={data.servedFrom} />
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

      {data.summary && <TopicSummary text={data.summary} />}

      <TopicExplorer events={data.events} prices={data.prices} />

      {/* min-w-0 on both items: a grid item cannot shrink below its own content by default,
          and the source names and attribution lines are long enough to push a phone sideways
          even though they are individually truncated. */}
      <div className="mt-8 grid gap-4 lg:grid-cols-[2fr_1fr] [&>*]:min-w-0">
        <SourcesPanel slug={decodeURIComponent(params.slug)} />
        <AdSlot />
      </div>
      <div className="mt-4">
        <CaepPromo />
      </div>
    </div>
  );
}
