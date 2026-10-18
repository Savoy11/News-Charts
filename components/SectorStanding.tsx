import Link from "next/link";
import type { SectorStanding as Standing } from "@/lib/signals";

const signed = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
const tone = (n: number) => (n > 0 ? "text-emerald-400" : n < 0 ? "text-red-400" : "text-slate-300");

function gapWords(gap: number): string {
  if (gap === 0) return "level with the median";
  return `${Math.abs(gap).toFixed(1)} points ${gap > 0 ? "ahead of" : "behind"} the median`;
}

/**
 * Every member's return against the sector median, over dates they all share (2026-10-17
 * proposal 6). The window and the member count travel with every figure, so "the sector" never
 * silently means two companies or a different stretch of time from the one quoted.
 *
 * With a `ticker` it is the company page's one line — this company against its peers, each peer
 * a link into `/compare` — and without one, the sector page's table of all of them.
 */
export default function SectorStanding({
  standing,
  ticker,
  sector,
}: {
  standing: Standing;
  ticker?: string;
  sector?: { name: string; slug: string };
}) {
  const dates = `${standing.from} to ${standing.to}`;
  const n = standing.members.length;

  if (ticker) {
    const me = standing.members.find((m) => m.ticker === ticker);
    const peers = standing.members.filter((m) => m.ticker !== ticker);
    const sectorName = sector ? (
      <Link
        href={`/industry/${sector.slug}`}
        className="text-emerald-400 underline decoration-emerald-800 underline-offset-2 hover:text-emerald-300"
      >
        {sector.name}
      </Link>
    ) : (
      "its sector"
    );
    return (
      <section data-sector-standing className="mb-4 rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3 text-sm">
        {me ? (
          <p className="text-slate-300">
            <span className="font-semibold text-slate-100">{ticker}</span> returned{" "}
            <span className={`font-semibold ${tone(me.pct)}`}>{signed(me.pct)}</span> from {dates}, against a median of{" "}
            <span className={tone(standing.median)}>{signed(standing.median)}</span> across the {n} members of {sectorName}{" "}
            with prices over those dates — <strong className="text-slate-100">{gapWords(me.gap)}</strong>.
          </p>
        ) : (
          <p className="text-slate-400">
            {ticker}&apos;s prices don&apos;t cover {dates}, the window its {n} peers in {sectorName} are measured over, so it
            isn&apos;t compared with them.
          </p>
        )}
        {peers.length > 0 && (
          <p className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-slate-500">
            <span>Compare with:</span>
            {peers.map((p) => (
              <Link
                key={p.ticker}
                href={`/compare?a=${encodeURIComponent(ticker)}&b=${encodeURIComponent(p.ticker)}`}
                className="text-slate-300 hover:text-sky-300"
              >
                {p.ticker} <span className={tone(p.pct)}>{signed(p.pct)}</span>
              </Link>
            ))}
          </p>
        )}
      </section>
    );
  }

  return (
    <section data-sector-standing className="mb-6 rounded-xl border border-slate-800 bg-slate-900/40">
      <div className="flex flex-wrap items-baseline gap-2 border-b border-slate-800 px-4 py-2.5">
        <h2 className="text-sm font-bold text-slate-100">How each member did</h2>
        <span className="text-xs text-slate-500">
          {dates} · median {signed(standing.median)} across {n} members with prices over those dates
        </span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
            <th scope="col" className="px-4 py-1.5 font-semibold">Member</th>
            <th scope="col" className="px-4 py-1.5 text-right font-semibold">Return</th>
            <th scope="col" className="px-4 py-1.5 text-right font-semibold">Against the median</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/70">
          {standing.members.map((m) => (
            <tr key={m.ticker}>
              <td className="px-4 py-1.5">
                <Link href={`/company/${encodeURIComponent(m.ticker)}`} className="font-semibold text-slate-200 hover:text-emerald-300">
                  {m.ticker}
                </Link>
              </td>
              <td className={`px-4 py-1.5 text-right tabular-nums ${tone(m.pct)}`}>{signed(m.pct)}</td>
              <td className={`px-4 py-1.5 text-right tabular-nums ${tone(m.gap)}`}>
                {m.gap === 0 ? "level" : `${m.gap > 0 ? "+" : "−"}${Math.abs(m.gap).toFixed(1)} pts`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
