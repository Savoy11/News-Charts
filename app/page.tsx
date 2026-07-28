import SearchBox from "@/components/SearchBox";
import AdSlot from "@/components/AdSlot";
import CaepPromo from "@/components/CaepPromo";
import SuggestionChips from "@/components/SuggestionChips";

export default function Home() {
  return (
    <div>
      <section className="flex flex-col items-center py-16 text-center">
        <h1 className="max-w-3xl text-4xl font-black tracking-tight text-slate-100 sm:text-5xl">
          Every headline, filing, and earnings report —{" "}
          <span className="text-sky-400">on one timeline</span>
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-slate-400">
          News Charts lines up news coverage, SEC filings, and earnings against the stock price so
          you can see what actually moved it. Or explore the full history of any topic.
        </p>
        <div className="mt-8 flex w-full justify-center">
          <SearchBox large />
        </div>
        <SuggestionChips />
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          {
            title: "Pegged to price",
            body: "For public companies, every event is a marker on the price chart. Spot the news that sparked the move.",
          },
          {
            title: "Primary sources",
            body: "Earnings and filings come straight from SEC EDGAR — no paraphrasing, one click to the original document.",
          },
          {
            title: "Any topic",
            body: "Not a ticker? Search anything — from the bicycle to AI — and get its history as a timeline.",
          },
        ].map((c) => (
          <div key={c.title} className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
            <h3 className="font-bold text-slate-100">{c.title}</h3>
            <p className="mt-2 text-sm text-slate-400">{c.body}</p>
          </div>
        ))}
      </section>

      <section className="mt-10 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <CaepPromo />
        <AdSlot />
      </section>
    </div>
  );
}
