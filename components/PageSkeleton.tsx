/**
 * Instant loading fallback for the data-heavy pages. A first visit to an un-ingested subject
 * fetches live (Wikipedia + news + archives) and can take many seconds; without this the click
 * looks frozen. Next renders this immediately during that fetch. Server component — pure markup.
 */
export default function PageSkeleton({
  eyebrow = "Loading timeline",
  withChart = false,
}: {
  eyebrow?: string;
  withChart?: boolean;
}) {
  return (
    <div className="animate-pulse motion-reduce:animate-none" aria-hidden>
      {/* header */}
      <div className="mb-6">
        <div className="h-3 w-32 rounded bg-slate-800/70" />
        <div className="mt-2 h-7 w-72 max-w-full rounded bg-slate-800" />
      </div>

      {withChart ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
          <div className="h-[360px] w-full rounded-lg bg-gradient-to-b from-slate-800/40 to-slate-900/20" />
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40">
          <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
            <div className="h-3 w-40 rounded bg-slate-800/70" />
            <div className="h-6 w-52 rounded bg-slate-800/70" />
          </div>
          <div className="relative h-[420px] overflow-hidden">
            <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-slate-800" />
            {[
              { left: "8%", above: true },
              { left: "27%", above: false },
              { left: "46%", above: true },
              { left: "65%", above: false },
              { left: "84%", above: true },
            ].map((c, i) => (
              <div key={i}>
                <div
                  className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-700"
                  style={{ left: c.left }}
                />
                <div
                  className="absolute w-56 -translate-x-1/2 rounded-lg border border-slate-800 bg-slate-900 p-3"
                  style={{
                    left: c.left,
                    [c.above ? "bottom" : "top"]: "calc(50% + 26px)",
                  }}
                >
                  <div className="h-3 w-14 rounded bg-slate-800" />
                  <div className="mt-2 h-3 w-full rounded bg-slate-800/70" />
                  <div className="mt-1.5 h-3 w-3/4 rounded bg-slate-800/70" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="mt-4 text-center text-xs text-slate-500">
        {eyebrow} — a first visit gathers this from Wikipedia, news and archives, so it can take a
        few seconds. Next time it loads instantly.
      </p>
    </div>
  );
}
