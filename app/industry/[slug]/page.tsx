import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import EventList from "@/components/EventList";
import AdSlot from "@/components/AdSlot";
import CaepPromo from "@/components/CaepPromo";
import SearchBox from "@/components/SearchBox";
import SignalPanel from "@/components/SignalPanel";
import JsonLd from "@/components/JsonLd";
import FollowBar from "@/components/FollowBar";
import { loadIndustry, loadIndustryEvents } from "@/lib/store/read";
import { absolute, breadcrumbLd, SITE_NAME } from "@/lib/seo";

export const revalidate = 900;

const latestDate = (events: { date: string }[]) => events.reduce((m, e) => (e.date > m ? e.date : m), "");

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const slug = decodeURIComponent(params.slug);
  const industry = await loadIndustry(slug).catch(() => null);
  if (!industry) return { title: "Industry not found", robots: { index: false } };
  const title = `${industry.name} sector timeline`;
  const description = `A merged timeline for the ${industry.name} sector (SIC ${industry.sic}): peer-company news, filings, earnings, and regulation in one view.`;
  const url = absolute(`/industry/${slug}`);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title: `${title} · ${SITE_NAME}`, description, url, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function IndustryPage({ params }: { params: { slug: string } }) {
  const slug = decodeURIComponent(params.slug);
  const industry = await loadIndustry(slug).catch(() => null);
  if (!industry) notFound();

  const events = await loadIndustryEvents(industry.id);
  const shared = events.filter((e) => e.description?.includes("peers")).length;

  return (
    <div>
      <JsonLd
        data={breadcrumbLd([
          { name: SITE_NAME, path: "/" },
          { name: "Explore", path: "/explore" },
          { name: industry.name, path: `/industry/${slug}` },
        ])}
      />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-400">
            Industry · SIC {industry.sic}
          </p>
          <h1 className="text-2xl font-black leading-tight text-slate-100">{industry.name}</h1>
        </div>
        <div className="flex items-center gap-3">
          <FollowBar
            subject={{ href: `/industry/${slug}`, kind: "industry", label: industry.name }}
            signature={{ count: events.length, latest: latestDate(events) }}
          />
          <SearchBox />
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">Members:</span>
        {industry.members.map((m) => (
          <Link
            key={m.slug}
            href={`/company/${m.ticker}`}
            className="rounded-full border border-slate-700 px-3 py-1 text-sm text-slate-300 hover:border-emerald-600 hover:text-emerald-300"
          >
            {m.ticker}
            <span className="ml-1.5 text-xs text-slate-500">{m.name}</span>
          </Link>
        ))}
      </div>

      <SignalPanel industrySlug={slug} />

      <div className="mb-4 flex items-baseline gap-2">
        <h2 className="text-lg font-bold text-slate-100">Sector timeline</h2>
        <span className="text-xs text-slate-500">
          {events.length} events
          {shared > 0 && (
            <>
              {" · "}
              <span className="text-emerald-400">{shared}</span> touching more than one peer
            </>
          )}
        </span>
      </div>

      {events.length ? (
        <EventList events={events} />
      ) : (
        <p className="text-sm text-slate-500">
          No events yet. Ingest a member company to populate this sector.
        </p>
      )}

      <div className="mt-8 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <CaepPromo />
        <AdSlot />
      </div>
    </div>
  );
}
