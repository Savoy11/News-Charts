import { notFound } from "next/navigation";
import CompanyExplorer from "@/components/CompanyExplorer";
import AdSlot from "@/components/AdSlot";
import CaepPromo from "@/components/CaepPromo";
import SearchBox from "@/components/SearchBox";
import ServedFrom from "@/components/ServedFrom";
import { getCompanyPageData } from "@/lib/page-data";

export const revalidate = 900;

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
        </div>
        <SearchBox />
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
