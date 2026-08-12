/**
 * EDGAR's fund series/class listing — the only free, keyless place that carries fund NAMES.
 *
 * `company_tickers_mf.json` maps a symbol to a CIK and a series id and nothing else, so a fund
 * resolved from it has no name; the registrant record is the wrong level ("VANGUARD INDEX FUNDS"
 * is what `data.sec.gov/submissions/…` says for VOO, and nobody searches for that). The series is
 * the level a person means: `S000002839 · Vanguard 500 Index Fund`, with its share classes hung
 * underneath — `C000007773 Investor Shares VFINX`, `C000092055 ETF Shares VOO`.
 *
 * `browse-edgar?action=getcompany&CIK=<cik>&scd=series` returns that whole join for one
 * registrant in one response, as HTML. Parsing HTML is not something to enjoy, but the
 * alternative is 11,970 per-series requests instead of 1,164 per-registrant ones, and this runs
 * at sync time rather than on a read path.
 */

export interface FundClass {
  classId: string;
  /** "Investor Shares", "ETF Shares" — the share class, not the fund */
  className: string;
  symbol: string;
}

export interface FundSeries {
  seriesId: string;
  /** "Vanguard 500 Index Fund" — the name a person actually searches for */
  name: string;
  classes: FundClass[];
}

const SERIES_ROW = /CIK=(S\d{9})&amp;scd=series&amp;view=mutual-fund"[^>]*>([^<]+)<\/a>/i;
const CLASS_ROW =
  /CIK=(C\d{9})&[^"]*"[^>]*>C\d{9}<\/a>\s*<\/td>\s*<td[^>]*>([^<]*)<\/td>\s*<td[^>]*>([^<]*)<\/td>/i;

const decode = (s: string): string =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Series and their share classes, in document order.
 *
 * Row-by-row rather than by two independent regex sweeps: a class belongs to the series above it,
 * and matching all series and all classes separately would lose that association entirely — every
 * symbol would land on whichever fund happened to sort first.
 */
export function parseSeriesPage(html: string): FundSeries[] {
  const out: FundSeries[] = [];
  for (const row of html.split(/<tr[\s>]/i)) {
    const series = SERIES_ROW.exec(row);
    if (series) {
      out.push({ seriesId: series[1], name: decode(series[2]), classes: [] });
      continue;
    }
    const klass = CLASS_ROW.exec(row);
    // A class before any series has nothing to belong to — EDGAR does not emit that, and
    // silently attaching it to the previous registrant's last fund would be a wrong answer
    // rather than a missing one.
    if (klass && out.length) {
      const symbol = decode(klass[3]).toUpperCase();
      if (symbol) out[out.length - 1].classes.push({ classId: klass[1], className: decode(klass[2]), symbol });
    }
  }
  return out;
}

/**
 * Which share class a bare fund name should resolve to.
 *
 * "Vanguard 500" is honestly VFINX, VFIAX *and* VOO — one fund, several classes, one of which
 * trades on an exchange. The ETF class wins, for the reason the 2026-08-08 scope refocus gives:
 * this product is about exchange-traded securities, and the ETF class is the one with a price
 * chart a reader can act on. Mutual-fund classes stay resolvable by their own symbols.
 *
 * Deliberately not a silent pick between equals — it is a stated preference for the class that
 * matches the product's scope, and it is asserted in `check:tickers` so it cannot drift.
 */
export function preferredClass(series: FundSeries): FundClass | null {
  if (!series.classes.length) return null;
  return series.classes.find((c) => /\bETF\b/i.test(c.className)) ?? series.classes[0];
}
