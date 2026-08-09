import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import CompanyExplorer from "@/components/CompanyExplorer";
import AdSlot from "@/components/AdSlot";
import SourcesPanel from "@/components/SourcesPanel";
import SearchBox from "@/components/SearchBox";
import StoredBadge from "@/components/StoredBadge";
import JsonLd from "@/components/JsonLd";
import FollowBar from "@/components/FollowBar";
import { getCompanyPageData } from "@/lib/page-data";
import { absolute, breadcrumbLd, SITE_NAME } from "@/lib/seo";

export const revalidate = 900;

const latestDate = (events: { date: string }[]) => events.reduce((m, e) => (e.date > m ? e.date : m), "");

export async function generateMetadata({
  params,
}: {
  params: { ticker: string };
}): Promise<Metadata> {
  const data = await getCompanyPageData(decodeURIComponent(params.ticker));
  if (!data) return { title: "Company not found", robots: { index: false } };
  const title = `${data.name} (${data.ticker}) timeline`;
  const description = `${data.name} (${data.ticker}) news, SEC filings, and earnings on one timeline, pegged to the stock price — see what moved the stock.`;
  const url = absolute(`/company/${data.ticker}`);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title: `${title} · ${SITE_NAME}`, description, url, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function CompanyPage({ params }: { params: { ticker: string } }) {
  const data = await getCompanyPageData(decodeURIComponent(params.ticker));
  /**
   * A miss must never be cached. With `revalidate = 900`, a notFound render would be served
   * statically for 15 minutes — so a first-visit gather that failed transiently (a throttled
   * Yahoo, a slow proxy) pinned the miss page even after the attempt ledger's backoff had
   * expired and a retry would have succeeded. `noStore()` opts THIS render out of the route
   * cache; successful renders above it still cache for the full window.
   */
  if (!data) {
    noStore();
    notFound();
  }

  const last = data.prices.at(-1);
  const prev = data.prices.at(-2);
  const change = last && prev ? ((last.value - prev.value) / prev.value) * 100 : null;

  return (
    <div>
      <JsonLd
        data={breadcrumbLd([
          { name: SITE_NAME, path: "/" },
          { name: "Explore", path: "/explore" },
          { name: `${data.name} (${data.ticker})`, path: `/company/${data.ticker}` },
        ])}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Corporation",
          name: data.name,
          tickerSymbol: data.ticker,
          url: absolute(`/company/${data.ticker}`),
          ...(data.siteDomain ? { sameAs: `https://${data.siteDomain}` } : {}),
        }}
      />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-black text-slate-100">
            {data.name} <span className="text-slate-500">({data.ticker})</span>
            <StoredBadge refreshedAt={data.refreshedAt} />
          </h1>
          {last && (
            <p className="mt-1 text-lg font-semibold text-slate-300">
              ${last.value.toFixed(2)}{" "}
              {change !== null && (
                <span className={change >= 0 ? "text-emerald-400" : "text-red-400"}>
                  {change >= 0 ? "+" : ""}
                  {change.toFixed(2)}%
                </span>
              )}
              <span className="ml-2 text-xs font-normal text-slate-500">
                last close · {last.time}
              </span>
            </p>
          )}
          {data.industry && (
            <p className="mt-1.5 text-xs text-slate-500">
              Sector:{" "}
              <Link
                href={`/industry/${data.industry.slug}`}
                className="font-semibold text-emerald-400 underline decoration-emerald-800 underline-offset-2 hover:text-emerald-300"
              >
                {data.industry.name}
              </Link>{" "}
              <span className="text-slate-600">
                (SIC {data.industry.sic} · {data.industry.memberCount} tracked)
              </span>
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <FollowBar
            subject={{ href: `/company/${data.ticker}`, kind: "company", label: `${data.name} (${data.ticker})` }}
            signature={{ count: data.events.length, latest: latestDate(data.events) }}
          />
          <SearchBox />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        {/* min-w-0: a grid item defaults to min-width:auto, so it cannot shrink below its
            content. The price chart sizes itself from this column's width and then writes that
            width back as an explicit px value, so on a phone the two fed each other and the
            column settled ~2000px wide, scrolling the whole page sideways. */}
        <div className="min-w-0">
          {data.prices.length > 0 ? (
            <CompanyExplorer
              prices={data.prices}
              events={data.events}
              siteDomain={data.siteDomain}
              subject={data.name}
            />
          ) : (
            <p className="text-slate-500">No price data available for {data.ticker}.</p>
          )}
        </div>
        <aside className="min-w-0 space-y-4">
          {/* which feeds actually contributed — a page with three feeds down looks fine
              without it, which is exactly how it misdirects debugging */}
          <SourcesPanel slug={data.ticker} />
          <AdSlot />
          <AdSlot format="rectangle" />
          <AdSlot />
        </aside>
      </div>
    </div>
  );
}
