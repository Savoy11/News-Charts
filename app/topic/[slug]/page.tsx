import { notFound } from "next/navigation";
import TopicExplorer from "@/components/TopicExplorer";
import AdSlot from "@/components/AdSlot";
import CaepPromo from "@/components/CaepPromo";
import SearchBox from "@/components/SearchBox";
import TopicSummary from "@/components/TopicSummary";
import ServedFrom from "@/components/ServedFrom";
import FollowBar from "@/components/FollowBar";
import { getTopicPageData } from "@/lib/page-data";

const latestDate = (events: { date: string }[]) => events.reduce((m, e) => (e.date > m ? e.date : m), "");

// short enough that a page rendered while a source was throttled self-heals quickly
export const revalidate = 900;

export default async function TopicPage({ params }: { params: { slug: string } }) {
  const topic = decodeURIComponent(params.slug);
  const data = await getTopicPageData(topic);
  if (!data) notFound();

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-violet-400">
            Topic timeline
            <ServedFrom source={data.servedFrom} />
          </p>
          <h1 className="text-2xl font-black leading-tight text-slate-100">{data.title}</h1>
        </div>
        <div className="flex items-center gap-3">
          <FollowBar
            subject={{ href: `/topic/${encodeURIComponent(topic)}`, kind: "topic", label: data.title }}
            signature={{ count: data.events.length, latest: latestDate(data.events) }}
          />
          <SearchBox />
        </div>
      </div>

      {data.summary && <TopicSummary text={data.summary} />}

      <TopicExplorer events={data.events} />

      <div className="mt-8 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <CaepPromo />
        <AdSlot />
      </div>
    </div>
  );
}
