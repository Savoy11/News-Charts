import GroupView from "@/components/GroupView";
import AdSlot from "@/components/AdSlot";
import CaepPromo from "@/components/CaepPromo";
import SearchBox from "@/components/SearchBox";

/**
 * Custom peer groups live in the visitor's browser, so the page is a shell: the client
 * reads the group from preferences and asks the server to compute over those tickers.
 * Nothing about a group is stored server-side.
 */
export default function GroupPage({ params }: { params: { name: string } }) {
  const name = decodeURIComponent(params.name);
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-400">
            Custom group · yours only
          </p>
          <h1 className="text-2xl font-black leading-tight text-slate-100">{name}</h1>
        </div>
        <SearchBox />
      </div>

      <GroupView name={name} />

      <div className="mt-8 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <CaepPromo />
        <AdSlot />
      </div>
    </div>
  );
}
