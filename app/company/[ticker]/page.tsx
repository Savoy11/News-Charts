import Link from "next/link";
import { notFound } from "next/navigation";
import CompanyExplorer from "@/components/CompanyExplorer";
import AdSlot from "@/components/AdSlot";
import CaepPromo from "@/components/CaepPromo";
import SearchBox from "@/components/SearchBox";
import ServedFrom from "@/components/ServedFrom";
import FollowBar from "@/components/FollowBar";
import { getCompanyPageData } from "@/lib/page-data";

export const revalidate = 900;

const latestDate = (events: { date: string }[]) => events.reduce((m, e) => (e.date > m ? e.date : m), "");

export default async function CompanyPage({ params }: { params: { ticker: string } }) {
  const data = await getCompanyPageData(decodeURIComponent(params.ticker));
  if (!data) notFound();

  const last = data.prices.at(-1);
  const prev = data.prices.at(-2);
  const change = last && prev ? ((last.value - prev.value) / prev.value) * 100 : null;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-black text-slate-100">
            {data.name} <span className="text-slate-500">({data.ticker})</span>
            <ServedFrom source={data.servedFrom} />
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
        <div className="flex items-center gap-3">
          <FollowBar
            subject={{ href: `/company/${data.ticker}`, kind: "company", label: `${data.name} (${data.ticker})` }}
            signature={{ count: data.events.length, latest: latestDate(data.events) }}
          />
          <SearchBox />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div>
          {data.prices.length > 0 ? (
            <CompanyExplorer
              prices={data.prices}
              events={data.events}
              siteDomain={data.siteDomain}
            />
          ) : (
            <p className="text-slate-500">No price data available for {data.ticker}.</p>
          )}
        </div>
        <aside className="space-y-4">
          <AdSlot />
          <CaepPromo />
          <AdSlot />
        </aside>
      </div>
    </div>
  );
}
