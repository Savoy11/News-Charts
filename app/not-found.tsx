import SearchBox from "@/components/SearchBox";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center py-24 text-center">
      <h1 className="text-3xl font-black text-slate-100">Nothing found</h1>
      <p className="mt-2 max-w-md text-slate-400">
        We couldn&apos;t build a timeline for that. Try a stock ticker (like AAPL) or a broader
        topic (like &quot;bicycle&quot;).
      </p>
      <div className="mt-6 flex w-full justify-center">
        <SearchBox large />
      </div>
    </div>
  );
}
