import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import type { TimelineEvent } from "./types";

/**
 * Big investors' quarterly holdings changes in the company's stock, from the SEC's Form 13F data sets, 2013 on (batch
 * 179; the owner's call of 2026-11-24: the 13F reports of every manager with $100 million or more, one row a quarter
 * naming the biggest buyers and sellers, and a row of its own for any manager whose change equals 1% or more of the
 * company's shares).
 *
 * A 13F report is a manager's holdings on a quarter's last day, filed within 45 days. No order or trade is public: a
 * manager's change is the difference between two of its reports, and the row says so. Each quarter a manager's report
 * is its latest original or restatement with the "new holdings" amendments filed after it (`effectiveFilings`); a
 * notice that another manager reports for it is none, and a report whose holdings were all omitted as confidential is
 * replaced by the amendment that gives them (Norges Bank's for 2025's first quarter, its 1,743 holdings filed a year
 * later). Its positions are its shares of each security, options and
 * principal amounts left out, on the page of the ticker the security's CUSIP has (`scripts/sync-13f.ts` builds the map
 * from the SEC's fails-to-deliver files, checked against the company's names). A manager is compared only where it
 * reported both quarters, neither report a quarter of the other's size (`comparable`); a position it dropped in a
 * report that omits confidential holdings, or took up after one, is no move. A split is read from the managers' own
 * ratios (`splitFactor`: NVIDIA's ten for one of 2024) and the earlier quarter scaled by it; a share count stated
 * before the split is read in the later unit (`shareBasis`). The summary row is dated by the reports' deadline, the
 * 45th day after the quarter (`deadlineOf`); a 1% move by the day its manager's report was filed. `npm run sync:13f`
 * commits it all (`data/13f/<year>.json.gz`); ingest asks nothing. The SEC's own work (17 U.S.C. § 105).
 */

export const INST_HOLDINGS_DIR = join(__dirname, "..", "data", "13f");

/** One 13F filing, as stage 1 of the sync keeps it. */
export interface Submission {
  accession: string;
  /** the filing manager's CIK */
  cik: string;
  period: string;
  filedOn: string;
  type: string;
  amendment: boolean;
  amendmentType: string;
  reportType: string;
  manager: string;
  /** the summary page's entry count and value, and whether it omits confidential holdings */
  entries: number;
  value: number;
  confidential: boolean;
}

/** The columns stage 1 writes a submission in. */
export const SUBMISSION_COLUMNS = ["cik", "period", "filedOn", "type", "amendment", "amendmentType", "reportType", "manager", "entries", "value", "confidential"] as const;

export function submissionOf(accession: string, row: readonly unknown[]): Submission {
  const s = (i: number) => String(row[i] ?? "");
  return {
    accession,
    cik: s(0).replace(/^0+/, ""),
    period: s(1),
    filedOn: s(2),
    type: s(3),
    amendment: s(4) === "Y",
    amendmentType: s(5),
    reportType: s(6),
    manager: s(7).trim(),
    entries: Number(row[8] ?? 0) || 0,
    value: Number(row[9] ?? 0) || 0,
    confidential: s(10) === "Y",
  };
}

/**
 * Each manager's quarter: its filings in the order filed, an original or a restatement replacing what came before and a
 * "new holdings" amendment adding to it, unless it holds half as many entries as what it amends or more, when it is a
 * whole report filed again under that label and replaces it too (Morgan Stanley's of 2024, 44,908 entries beside the
 * original's 44,939, which added would have doubled its every position). A notice (its holdings are another manager's
 * report) is none.
 */
export function effectiveFilings(subs: Iterable<Submission>): Map<string, Submission[]> {
  const byKey = new Map<string, Submission[]>();
  for (const s of subs) {
    if (!/HOLDINGS|COMBINATION/i.test(s.reportType)) continue;
    const k = `${s.cik}|${s.period}`;
    (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(s);
  }
  const out = new Map<string, Submission[]>();
  for (const [k, list] of byKey) {
    list.sort((a, b) => a.filedOn.localeCompare(b.filedOn) || a.accession.localeCompare(b.accession));
    let set: Submission[] = [];
    for (const s of list) {
      const adds = s.amendment && /NEW HOLDINGS/i.test(s.amendmentType);
      const before = set.reduce((n, x) => n + x.entries, 0);
      if (adds && set.length && s.entries < 0.5 * before) set.push(s);
      else if (!s.amendment || /RESTATEMENT/i.test(s.amendmentType) || adds) set = [s];
    }
    if (set.length) out.set(k, set);
  }
  return out;
}

/** The day by which a quarter's 13F reports are due: its 45th day after, a weekend's the Monday after. */
export function deadlineOf(period: string): string {
  const d = new Date(`${period}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 45);
  const wd = d.getUTCDay();
  if (wd === 6) d.setUTCDate(d.getUTCDate() + 2);
  if (wd === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** The quarter before a quarter's last day. */
export function previousPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const pm = m - 3 <= 0 ? m + 9 : m - 3;
  const py = m - 3 <= 0 ? y - 1 : y;
  const last = new Date(Date.UTC(py, pm, 0)).getUTCDate();
  return `${py}-${String(pm).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

/**
 * The split a ratio of later shares to earlier is read as: 1 between 0.72 and 1.4; else three for two, or a whole number
 * for one up to 100 (NVIDIA's ten for one), or one for a whole number up to 1,000 (GeneDx's one for 33 of 2023), within 3%;
 * else 1.
 */
export function simpleRatio(r: number): number {
  if (!(r > 0) || (r < 1.4 && r > 0.72)) return 1;
  if (Math.abs(r / 1.5 - 1) < 0.03) return 1.5;
  if (r >= 1.4) {
    const n = Math.round(r);
    return n >= 2 && n <= 100 && Math.abs(r / n - 1) < 0.03 ? n : 1;
  }
  const d = Math.round(1 / r);
  return d >= 2 && d <= 1_000 && Math.abs(r * d - 1) < 0.03 ? 1 / d : 1;
}

/**
 * The split a quarter's holders show: the median of their later shares over their earlier where at least five held both
 * quarters (NVIDIA's of June 2024: 10.004), read as a simple ratio (`simpleRatio`); 1 where none.
 */
export function splitFactor(ratios: readonly number[]): number {
  if (ratios.length < 5) return 1;
  const sorted = [...ratios].sort((a, b) => a - b);
  return simpleRatio(sorted[Math.floor(sorted.length / 2)]);
}

/**
 * The share count a 1% move is measured against: the company's stated count, or that count in a split's later unit
 * where the managers alone hold more than one and a half times it (a cover page dated before the split), else none.
 */
export function shareBasis(stated: number | undefined, held: number, factor: number): number | undefined {
  if (!stated || stated <= 0) return undefined;
  for (const x of factor === 1 ? [stated] : [stated, stated * factor]) if (held <= 1.5 * x) return x;
  return undefined;
}

/** A manager's position in a page's security at a quarter's end, and the day its report giving it was filed. */
export interface Holding {
  shares: number;
  /** whether the report giving it is an amendment, filed after the quarter's own */
  amended?: boolean;
  /** its value as stated, in dollars (`dollars`) */
  value?: number;
  filedOn: string;
  accession: string;
  /** a position whose stated value gives a price no other manager's does (`markSuspect`) */
  suspect?: boolean;
}

/** A 13F value in dollars: thousands of dollars in a report filed before 2023-01-03, dollars since (the SEC's amendment of 2022). */
export const dollars = (value: number, filedOn: string) => (filedOn < "2023-01-03" ? value * 1_000 : value);

/**
 * Marks the positions of a quarter's security whose shares cannot be right: the price their stated value gives is more
 * than five times off the managers' median, and not by a thousand times either (a value stated in the wrong unit, whose
 * shares are still right). J. Stern & Co.'s 125,760,307 NVIDIA shares of 2025, between its 910,704 and its 619,354, are
 * one. Fewer than five priced positions mark none.
 */
export function markSuspect(holdings: ReadonlyMap<string, Holding>): void {
  const prices = [...holdings.values()].filter((h) => h.shares > 0 && (h.value ?? 0) > 0).map((h) => h.value! / h.shares).sort((a, b) => a - b);
  if (prices.length < 5) return;
  const median = prices[Math.floor(prices.length / 2)];
  for (const h of holdings.values()) {
    if (!(h.shares > 0 && (h.value ?? 0) > 0)) continue;
    const r = h.value! / h.shares / median;
    const near = r >= 0.2 && r <= 5;
    const unitSlip = (r >= 0.0002 && r <= 0.005) || (r >= 200 && r <= 5_000);
    if (!near && !unitSlip) h.suspect = true;
  }
}

/** A manager's change in a quarter: shares bought (+) or sold (−), what it held after, and its report. */
export interface Move {
  filer: string;
  delta: number;
  after: number;
  filedOn: string;
  accession: string;
  /** the change in hundredths of a percent of the company's shares, where a count is known */
  bp?: number;
  /** whether its report is an amendment */
  amended?: boolean;
}

export interface PageQuarter {
  period: string;
  /** managers reporting the security at the quarter's end */
  holders: number;
  /** managers holding the security either quarter that were compared with their previous report */
  compared: number;
  /** the compared managers' net change */
  net: number;
  split: number;
  buyers: Move[];
  sellers: Move[];
  /** every compared manager's change of 1% or more of the company's shares */
  moves: Move[];
}

/** Whether a manager's two reports can be compared: both hold positions, neither a quarter of the other's count. */
export function comparable(before: number, after: number): boolean {
  return before > 0 && after > 0 && after >= 0.25 * before && before >= 0.25 * after;
}

/**
 * A page's quarter: each compared manager's change, the split read from them, the three biggest buyers and sellers,
 * and every change of 1% or more of the company's shares. A security held by fewer than three managers the quarter
 * before has none (its first quarter would read every holder as a buyer), nor one where a manager's change is greater
 * than the company's every share (a split not read: Delcath's of 2017). A position dropped in a report that omits
 * confidential holdings, or taken up in the report after one, is no change.
 */
export function pageQuarter(
  period: string,
  prev: ReadonlyMap<string, Holding>,
  cur: ReadonlyMap<string, Holding>,
  /** each compared manager's report for the quarter: its day and accession, which a sale to nothing still has */
  compared: ReadonlyMap<string, { filedOn: string; accession: string; amended?: boolean }>,
  opts: { sharesOutstanding?: number; sharesBefore?: number; confidentialNow?: ReadonlySet<string>; confidentialBefore?: ReadonlySet<string> } = {},
): PageQuarter | null {
  if (prev.size < 3) return null;
  // a manager whose position either quarter cannot be right is not compared on this security
  const here = new Map([...compared].filter(([f]) => !prev.get(f)?.suspect && !cur.get(f)?.suspect));
  const ratios: number[] = [];
  for (const f of here.keys()) {
    const a = prev.get(f)?.shares ?? 0;
    const b = cur.get(f)?.shares ?? 0;
    if (a > 0 && b > 0) ratios.push(b / a);
  }
  // the holders' own ratios where five or more held through the quarter; else the company's stated counts (Wheels Up's one
  // for twenty of 2026, which few held through), never beside them, as a count stated before a split (NVIDIA's of June
  // 2024) would read a second split the quarter after
  const split = ratios.length >= 5 || !opts.sharesOutstanding || !opts.sharesBefore ? splitFactor(ratios) : simpleRatio(opts.sharesOutstanding / opts.sharesBefore);
  const changes: Move[] = [];
  let comparedHere = 0;
  for (const [f, report] of here) {
    if ((prev.get(f)?.shares ?? 0) > 0 || (cur.get(f)?.shares ?? 0) > 0) comparedHere++;
    const a = Math.round((prev.get(f)?.shares ?? 0) * split);
    const now = cur.get(f);
    const b = now?.shares ?? 0;
    if (a === b) continue;
    if (b === 0 && opts.confidentialNow?.has(f)) continue;
    if (a === 0 && opts.confidentialBefore?.has(f)) continue;
    // the report that gave the position, or for a sale to nothing the manager's report of the quarter
    const at = now ?? report;
    changes.push({ filer: f, delta: b - a, after: b, filedOn: at.filedOn, accession: at.accession, amended: !!at.amended });
  }
  let held = 0;
  for (const h of cur.values()) held += h.shares;
  const basis = shareBasis(opts.sharesOutstanding, held, split);
  if (basis) for (const c of changes) c.bp = Math.round((10_000 * Math.abs(c.delta)) / basis);
  // a change greater than the whole company is a split or an error not read: the quarter reads nothing
  if (basis && changes.some((c) => Math.abs(c.delta) > basis)) return null;
  const byDelta = [...changes].sort((x, y) => y.delta - x.delta || x.filer.localeCompare(y.filer));
  return {
    period,
    holders: cur.size,
    compared: comparedHere,
    net: changes.reduce((s, c) => s + c.delta, 0),
    split,
    buyers: byDelta.filter((c) => c.delta > 0).slice(0, 3),
    sellers: byDelta.filter((c) => c.delta < 0).reverse().slice(0, 3),
    moves: basis ? changes.filter((c) => (c.bp ?? 0) >= 100).sort((x, y) => (y.bp ?? 0) - (x.bp ?? 0)) : [],
  };
}

/** A 1% move as the committed file keeps it; a summary's buyer or seller only its manager and shares, as its row shows no more. */
const MOVE = (m: Move) => [m.filer, m.delta, m.after, m.filedOn, m.accession, m.bp ?? null, m.amended ? 1 : 0];
const SHORT = (m: Move) => [m.filer, m.delta, m.after];
const moveOf = (r: readonly unknown[]): Move => ({ filer: String(r[0]), delta: Number(r[1]), after: Number(r[2]), filedOn: String(r[3] ?? ""), accession: String(r[4] ?? ""), bp: r[5] == null ? undefined : Number(r[5]), amended: r[6] === 1 });
/** A page's quarter as the committed file keeps it: [period, holders, compared, net, split, buyers, sellers, moves]. */
export const quarterRow = (q: PageQuarter) => [q.period, q.holders, q.compared, q.net, q.split, q.buyers.map(SHORT), q.sellers.map(SHORT), q.moves.map(MOVE)];
export const quarterOf = (r: readonly unknown[]): PageQuarter => ({
  period: String(r[0]),
  holders: Number(r[1]),
  compared: Number(r[2]),
  net: Number(r[3]),
  split: Number(r[4]),
  buyers: (r[5] as unknown[][]).map(moveOf),
  sellers: (r[6] as unknown[][]).map(moveOf),
  moves: (r[7] as unknown[][]).map(moveOf),
});

/** The fewest managers a quarter is compared on: the SEC's first data set holds only a few hundred reports of 2013's first half. */
export const MIN_MANAGERS = 1_000;

let cached: { dir: string; filers: Map<string, string>; pages: Map<string, PageQuarter[]> } | null = null;

/** The committed years' quarters by page (ticker), and the managers' names by CIK. */
export function instHoldings(dir = INST_HOLDINGS_DIR): { filers: ReadonlyMap<string, string>; pages: ReadonlyMap<string, readonly PageQuarter[]> } {
  if (cached?.dir === dir) return cached;
  const filers = new Map<string, string>();
  const pages = new Map<string, PageQuarter[]>();
  for (const f of existsSync(dir) ? readdirSync(dir).filter((f) => /^\d{4}\.json\.gz$/.test(f)).sort() : []) {
    const body = JSON.parse(gunzipSync(readFileSync(join(dir, f))).toString("utf8")) as { filers: Record<string, string>; pages: Record<string, unknown[][]> };
    for (const [cik, name] of Object.entries(body.filers)) filers.set(cik, name);
    for (const [ticker, rows] of Object.entries(body.pages)) (pages.get(ticker) ?? pages.set(ticker, []).get(ticker)!).push(...rows.map(quarterOf));
  }
  cached = { dir, filers, pages };
  return cached;
}

const DAY = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  return `${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][m - 1]} ${dd}, ${y}`;
};
const n = (x: number) => Math.abs(x).toLocaleString("en-US");
const signed = (x: number) => `${x > 0 ? "+" : "−"}${n(x)}`;
const pct = (bp: number) => `${(bp / 100).toFixed(bp >= 1_000 ? 0 : 1)}%`;
const accessionUrl = (cik: string, accession: string) => `https://www.sec.gov/Archives/edgar/data/${cik}/${accession.replace(/-/g, "")}/`;
const SPLIT_NOTE = (s: number) => (s === 1 ? "" : s > 1 ? ` (the quarter before read after a ${s}-for-1 split)` : ` (the quarter before read after a 1-for-${Math.round(1 / s)} reverse split)`);
const CAVEAT =
  "A 13F report gives a manager's holdings at a quarter's end, filed within 45 days; a change is the difference from its previous report, not a trade's day or price, and options are left out.";
const LIMIT = 1_200;

/** The page's quarters as timeline events, from `from`: a summary row on each quarter's deadline, and a row for each 1% move on its report's day. */
export function instHoldingsEvents(
  quarters: readonly PageQuarter[],
  filers: ReadonlyMap<string, string>,
  { ticker, from = "", name }: { ticker: string; from?: string; name: string },
): TimelineEvent[] {
  const who = (cik: string) => filers.get(cik) ?? `CIK ${cik}`;
  const rows: TimelineEvent[] = [];
  for (const q of quarters) {
    const deadline = deadlineOf(q.period);
    if (deadline >= from && (q.buyers.length || q.sellers.length)) {
      const top = [q.buyers[0] && `biggest buyer ${who(q.buyers[0].filer)} (${signed(q.buyers[0].delta)} shares)`, q.sellers[0] && `biggest seller ${who(q.sellers[0].filer)} (${signed(q.sellers[0].delta)})`].filter(Boolean).join(", ");
      const list = (ms: Move[]) => ms.map((m) => `${who(m.filer)} ${signed(m.delta)} to ${n(m.after)}`).join("; ");
      const text =
        `${CAVEAT} For the quarter ended ${DAY(q.period)}: ${n(q.holders)} managers reported holding ${name} (${ticker}); of the ${n(q.compared)} that also reported the quarter before, the net change was ${q.net === 0 ? "none" : `${signed(q.net)} shares`}${SPLIT_NOTE(q.split)}.` +
        (q.buyers.length ? ` Biggest buyers: ${list(q.buyers)}.` : "") +
        (q.sellers.length ? ` Biggest sellers: ${list(q.sellers)}.` : "");
      rows.push({
        id: `inst13f-${ticker}-${q.period}`,
        date: deadline,
        type: "filing",
        title: `Big investors' 13F reports for the quarter ended ${DAY(q.period)}: ${top}`,
        description: text.length <= LIMIT ? text : `${text.slice(0, LIMIT - 1).replace(/\s+\S*$/, "")}…`,
        source: "SEC, Form 13F data sets",
        url: "https://www.sec.gov/data-research/sec-markets-data/form-13f-data-sets",
        sourceKey: "inst_13f",
        externalId: `13F ${q.period}`,
        dedupBasis: `inst13f:${ticker}@${q.period}`,
      });
    }
    for (const m of q.moves) {
      if (m.filedOn < from) continue;
      const before = m.after - m.delta;
      rows.push({
        id: `inst13f-${ticker}-${q.period}-${m.filer}`,
        date: m.filedOn,
        type: "filing",
        title: `${who(m.filer)} reported ${m.delta > 0 ? "buying" : "selling"} ${n(m.delta)} ${name} shares in the quarter ended ${DAY(q.period)} (${pct(m.bp ?? 0)} of the company)`,
        description:
          `${CAVEAT} Its ${m.amended ? "amended " : ""}report for the quarter, filed ${DAY(m.filedOn)}: ${n(m.after)} shares at ${DAY(q.period)}, from ${n(before)} at ${DAY(previousPeriod(q.period))}${SPLIT_NOTE(q.split)}` +
          `${m.after === 0 ? ", the whole position sold" : before === 0 ? ", a new position" : ""}.`,
        source: "SEC, Form 13F",
        url: accessionUrl(m.filer, m.accession),
        sourceKey: "inst_13f",
        externalId: m.accession,
        dedupBasis: `inst13f:${ticker}@${q.period}:${m.filer}`,
      });
    }
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}
