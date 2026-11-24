import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { previousPeriod, simpleRatio, splitFactor } from "./instHoldings";
import type { TimelineEvent } from "./types";

/**
 * Mutual funds' and ETFs' N-PORT holdings changes (batch 180; the owner's call of 2026-11-24, with 13F in batch 179 and
 * insider trades to follow). A fund files Form N-PORT for each month's end, and the report of each fiscal quarter's last
 * month is public on filing, within 60 days; the SEC's N-PORT data sets hold those public reports from 2019's last
 * quarter. No order or trade is public, so a fund's change is the difference between two of its reports about three
 * months apart, by share counts: long positions in stocks, preferreds and funds, never a bond, an option or a swap.
 *
 * A fund's page shows its own reports, a row each where it bought or sold a security worth half a percent or more of its
 * net assets, naming its three biggest purchases and sales (`BIG_SHARE`); a company's page shows each fund whose change
 * equals 1% or more of the company's shares (the 13F rule's, `MOVE_BP`). The committed files are `data/nport/<year>.json.gz`,
 * by report day, written by `npm run sync:nport` (scripts/sync-nport.ts).
 */
export const FUND_HOLDINGS_DIR = join(__dirname, "..", "data", "nport");

/** A fund's public report: its series, the month's end it gives, the day it was filed, and its net assets in dollars. */
export interface FundReport {
  accession: string;
  series: string;
  seriesName: string;
  cik: string;
  reportDate: string;
  filedOn: string;
  amended: boolean;
  netAssets: number;
  /** the data set zip it was read from */
  window: string;
}

/** A stage-1 submission row, [report day, filing day, form, registrant CIK, series id, series name, net assets], or null for one no series names. */
export function reportOf(accession: string, row: readonly unknown[], window: string): FundReport | null {
  const [reportDate, filedOn, form, cik, series, seriesName, netAssets] = row.map((x) => (x == null ? "" : x));
  if (!/^S\d{9}$/.test(String(series)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(reportDate)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(filedOn))) return null;
  if (!/^NPORT-P(?:\/A)?$/.test(String(form))) return null;
  return {
    accession,
    series: String(series),
    seriesName: String(seriesName).trim(),
    cik: String(cik).replace(/^0+/, ""),
    reportDate: String(reportDate),
    filedOn: String(filedOn),
    amended: String(form).endsWith("/A"),
    netAssets: Number(netAssets) || 0,
    window,
  };
}

/**
 * Each fund's reports in order of their month's end: for a month, the report filed last (an amendment restates the whole
 * report), on a tie the later accession.
 */
export function effectiveReports(reports: Iterable<FundReport>): Map<string, FundReport[]> {
  const byKey = new Map<string, FundReport>();
  for (const r of reports) {
    const k = `${r.series}|${r.reportDate}`;
    const had = byKey.get(k);
    if (!had || r.filedOn > had.filedOn || (r.filedOn === had.filedOn && r.accession > had.accession)) byKey.set(k, r);
  }
  const out = new Map<string, FundReport[]>();
  for (const r of byKey.values()) (out.get(r.series) ?? out.set(r.series, []).get(r.series)!).push(r);
  for (const list of out.values()) list.sort((a, b) => a.reportDate.localeCompare(b.reportDate));
  return out;
}

/** Whole months from one month's end to another's. */
export const monthsBetween = (a: string, b: string) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));

/** Whether two reports of a fund are compared: two to four months apart (a fiscal quarter, or one a changed fiscal year moved). */
export const pairable = (before: string, after: string) => {
  const m = monthsBetween(before, after);
  return m >= 2 && m <= 4;
};

/** A fund's position in a security at a report's month end: its shares, their value in dollars as stated, and its name as given. */
export interface Position {
  shares: number;
  value?: number;
  name?: string;
  /** a position whose stated value gives a price no other fund's does (`markSuspect`) */
  suspect?: boolean;
}

/**
 * Marks the positions of a security at a month's end whose shares cannot be right: the price their stated value gives is
 * more than five times off the funds' median (a count given in thousands, a fund's typing slip). Fewer than five priced
 * positions mark none.
 */
export function markSuspect(positions: readonly Position[]): void {
  const prices = positions.filter((p) => p.shares > 0 && (p.value ?? 0) > 0).map((p) => p.value! / p.shares).sort((a, b) => a - b);
  if (prices.length < 5) return;
  const median = prices[Math.floor(prices.length / 2)];
  for (const p of positions) {
    if (!(p.shares > 0 && (p.value ?? 0) > 0)) continue;
    const r = p.value! / p.shares / median;
    if (r < 0.2 || r > 5) p.suspect = true;
  }
}

/**
 * Whether a price moved the other way from a split of `f`, as a split moves it: within a fifth for three for two or two
 * for one, a third up to five for one, half beyond (a microcap's one for twenty in a falling market).
 */
export function priceAgrees(priceRatio: number, f: number): boolean {
  const l = Math.abs(Math.log(f));
  const tol = l < Math.log(2.5) ? 0.2 : l < Math.log(6) ? 0.35 : 0.5;
  return priceRatio > 0 && Math.abs(Math.log(priceRatio * f)) <= Math.log(1 + tol);
}

/** The later price over the earlier, by the stated values, where both are stated. */
const priceRatioOf = (before: Position, now: Position) =>
  before.shares > 0 && now.shares > 0 && (before.value ?? 0) > 0 && (now.value ?? 0) > 0 ? now.value! / now.shares / (before.value! / before.shares) : undefined;

/**
 * The split one fund's two positions show where fewer than five funds held the security through the same two months: a
 * simple ratio of its shares (`simpleRatio`) whose price, by the stated values, moved the other way (`priceAgrees`: a fund
 * that doubled its shares as the price halved held through a two-for-one split); else 1, and 1 where a value is missing.
 */
export function heldSplit(before: Position, now: Position): number {
  const pr = priceRatioOf(before, now);
  if (pr === undefined) return 1;
  const f = simpleRatio(now.shares / before.shares);
  return f !== 1 && priceAgrees(pr, f) ? f : 1;
}

/** Whether a split the 13F holders read (batch 179) fell in a quarter that overlaps the months from `before` to `after`. */
export function quarterSplitsIn(splits: readonly { period: string; split: number }[], before: string, after: string): number[] {
  return splits.filter((q) => q.split !== 1 && q.period > before && previousPeriod(q.period) < after).map((q) => q.split);
}

const nameKey = (name = "") => name.toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * A fund's later positions keyed as its earlier ones where a security took a new CUSIP between them (a reverse split's,
 * a redomicile's): a position gone and a position new under one issuer name, the only two of that name, are one security.
 */
export function rekeyRenamed(
  before: ReadonlyMap<string, Position>,
  now: ReadonlyMap<string, Position>,
  nameOf: (key: string, p: Position) => string | undefined = (_, p) => p.name,
): ReadonlyMap<string, Position> {
  const gone = new Map<string, string[]>();
  for (const [k, p] of before) {
    const n = nameKey(nameOf(k, p));
    if (!now.has(k) && n) (gone.get(n) ?? gone.set(n, []).get(n)!).push(k);
  }
  if (!gone.size) return now;
  const fresh = new Map<string, string[]>();
  for (const [k, p] of now) {
    const n = nameKey(nameOf(k, p));
    if (!before.has(k) && gone.has(n)) (fresh.get(n) ?? fresh.set(n, []).get(n)!).push(k);
  }
  if (!fresh.size) return now;
  const out = new Map(now);
  for (const [name, ks] of fresh) {
    const was = gone.get(name)!;
    if (ks.length !== 1 || was.length !== 1) continue;
    out.set(was[0], out.get(ks[0])!);
    out.delete(ks[0]);
  }
  return out;
}

/** A fund's change in a security between two reports: shares bought (+) or sold (−), what it held after, and the change's value at the later report's price. */
export interface Change {
  key: string;
  name: string;
  ticker?: string;
  delta: number;
  after: number;
  /** |delta| at the later report's price, in dollars, where a price is stated */
  usd: number;
  split: number;
  /** a new or closed position beside a split not read: shown on the fund's page, but its share of the company not known */
  noMove?: true;
}

/** The fund's two reports a change is read between. */
export interface FundPair {
  series: string;
  cik: string;
  reportDate: string;
  priorDate: string;
  filedOn: string;
  accession: string;
  amended: boolean;
  netAssets: number;
}

/** The smallest change a fund's page names: half a percent of the fund's net assets, in dollars at the later report's price. */
export const BIG_SHARE = 0.005;
/** The smallest change a company's page shows: 1% of the company's shares, in hundredths of a percent (the 13F rule's). */
export const MOVE_BP = 100;

/**
 * The company's stated share counts in the frames of a pair's two reports' quarters, and of the quarter after where the
 * frames reach it (data.sec.gov's, batch 179).
 */
export interface StatedCounts {
  now?: number;
  before?: number;
  /** the quarter after the later report's, where its frame is read; a frame read without the company is a count missing */
  next?: number | null;
}

/**
 * The count a 1% move is measured against: the stated count of the later report's quarter, where the earlier quarter's
 * agrees with it (a count off by a hundred times, Holley's 1,093,750 of 2023's third quarter, or stated after a reverse
 * split the funds' reports precede, is no count), in the split's later unit where both were stated before it; or where
 * * the two differ by the split the funds show, the later. The quarter after must agree too where its frame is read (NRx's
 * of 2021, its blank-check company's 2,688,242 shares stated before the merger in both, and 58,810,338 after).
 */
export function basisOf(counts: StatedCounts | undefined, split: number): number | undefined {
  if (!counts?.now || !counts.before) return undefined;
  const near = (x: number) => x > 0.72 && x < 1.4;
  const r = counts.now / counts.before;
  const basis = near(r) ? counts.now * split : split !== 1 && near(r / split) ? counts.now : undefined;
  if (basis === undefined || counts.next === undefined) return basis;
  return counts.next !== null && near(counts.next / basis) ? basis : undefined;
}

const median = (xs: readonly number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/**
 * A month's comparisons: each fund reporting at its end whose previous report is two to four months before and holds
 * positions of like size (`comparable`). A security's split is the one the funds that held it through the same two months
 * show, five or more, where their median price moved the other way (`splitFactor`, `priceAgrees`: funds that all grew a
 * stake by half in an offering read none), and the fund's own price does not disagree; else the fund's own (`heldSplit`).
 * A position held through is not compared where the 13F holders read a split in an overlapping quarter, or the company's
 * stated counts show one, that these funds do not (`uncertain`); a suspect position either side is not compared for that
 * fund, and a security whose change is more than the company's shares not at all. A new position is the whole as a
 * purchase, a position gone the whole as a sale, in the shares the earlier report gave.
 */
export function compareMonth(
  pairs: readonly { pair: FundPair; before: ReadonlyMap<string, Position>; now: ReadonlyMap<string, Position> }[],
  opts: {
    /** a security's page ticker, by CUSIP (`lib/cusipMap.ts`) */
    tickerOf?: (key: string) => string | undefined;
    /** the 13F splits of a ticker's quarters overlapping two month ends (`quarterSplitsIn`) */
    splitsOf?: (ticker: string, before: string, after: string) => readonly number[];
    /** the company's stated share counts in the frames of the two reports' quarters, where known */
    sharesOf?: (ticker: string, before: string, after: string) => StatedCounts | undefined;
    /** a security's name where its positions carry none */
    nameOf?: (key: string) => string | undefined;
  } = {},
): { pair: FundPair; compared: number; changes: Change[]; moves: (Change & { bp: number })[] }[] {
  const nameOf = (k: string, p?: Position) => p?.name || opts.nameOf?.(k);
  pairs = pairs.map((p) => ({ ...p, now: rekeyRenamed(p.before, p.now, nameOf) }));
  // the funds' share and price ratios for each security between the same two months (a month's last day or its last trading day)
  const groups = new Map<string, Map<string, { ratios: number[]; prices: number[] }>>();
  for (const { pair, before, now } of pairs) {
    const m = pair.priorDate.slice(0, 7);
    const byKey = groups.get(m) ?? groups.set(m, new Map()).get(m)!;
    for (const [k, b] of before) {
      const a = now.get(k);
      if (!a || a.suspect || b.suspect || !(a.shares > 0 && b.shares > 0)) continue;
      const g = byKey.get(k) ?? byKey.set(k, { ratios: [], prices: [] }).get(k)!;
      g.ratios.push(a.shares / b.shares);
      const pr = priceRatioOf(b, a);
      if (pr !== undefined) g.prices.push(pr);
    }
  }
  // each group's split and median price move, read once
  const groupRead = new Map<string, { split: number | undefined; move: number | undefined }>();
  const groupOf = (k: string, priorDate: string) => {
    const at = `${k}|${priorDate.slice(0, 7)}`;
    const had = groupRead.get(at);
    if (had) return had;
    const g = groups.get(priorDate.slice(0, 7))?.get(k);
    const move = g?.prices.length ? median(g.prices) : undefined;
    const f = g && g.ratios.length >= 5 ? splitFactor(g.ratios) : undefined;
    const split = f === undefined ? undefined : f !== 1 && (g?.prices.length ?? 0) >= 3 && priceAgrees(move!, f) ? f : 1;
    return groupRead.set(at, { split, move }).get(at)!;
  };
  const groupSplit = (k: string, priorDate: string) => groupOf(k, priorDate).split;
  // the funds' median price move: two and a half times up, or to under a third, with no split read, is a split not read
  const jumped = (k: string, priorDate: string) => {
    const mr = groupOf(k, priorDate).move;
    return mr !== undefined && (mr >= 2.5 || mr <= 0.3);
  };
  const uncertain = new Set<string>();
  const out: { pair: FundPair; compared: number; changes: Change[] }[] = [];
  for (const { pair, before, now } of pairs) {
    const changes: Change[] = [];
    let compared = 0;
    for (const k of new Set([...before.keys(), ...now.keys()])) {
      const b = before.get(k);
      const a = now.get(k);
      if (b?.suspect || a?.suspect) continue;
      const g = `${k}|${pair.priorDate.slice(0, 7)}`;
      const gs = groupSplit(k, pair.priorDate);
      let split = gs && gs !== 1 ? gs : 1;
      if (b && a) {
        // the funds' split where the fund's own price does not disagree, else the fund's own exact evidence
        const pr = priceRatioOf(b, a);
        split = gs !== undefined && gs !== 1 && (pr === undefined || priceAgrees(pr, gs)) ? gs : heldSplit(b, a);
      }
      const ticker = opts.tickerOf?.(k);
      const read = ticker ? (opts.splitsOf?.(ticker, pair.priorDate, pair.reportDate) ?? []) : [];
      const counts = ticker ? opts.sharesOf?.(ticker, pair.priorDate, pair.reportDate) : undefined;
      const stated = counts?.now && counts.before ? simpleRatio(counts.now / counts.before) : 1;
      const unread = (read.length > 0 && !read.includes(split)) || (stated !== 1 && stated !== split) || (split === 1 && jumped(k, pair.priorDate));
      // a position held through on a split not read is no change; a new or a closed one is, in its report's own shares, but
      // its share of the company is not known
      if (b && a && unread) {
        uncertain.add(g);
        continue;
      }
      compared++;
      const was = Math.round((b?.shares ?? 0) * split);
      const after = a?.shares ?? 0;
      if (was === after) continue;
      const price = a && a.shares > 0 && (a.value ?? 0) > 0 ? a.value! / a.shares : b && b.shares > 0 && (b.value ?? 0) > 0 ? b.value! / b.shares / split : 0;
      changes.push({ key: k, name: nameOf(k, a) || nameOf(k, b) || k, ticker, delta: after - was, after, usd: Math.round(Math.abs(after - was) * price), split, ...(unread ? { noMove: true as const } : {}) });
    }
    out.push({ pair, compared, changes });
  }
  // a change greater than the company's every share is a split or an error not read: the security reads nothing that month
  const basis = (c: Change, pair: FundPair) => (c.ticker && opts.sharesOf ? basisOf(opts.sharesOf(c.ticker, pair.priorDate, pair.reportDate), c.split) : undefined);
  const tooBig = new Set<string>();
  for (const { pair, changes } of out)
    for (const c of changes) {
      const n = basis(c, pair);
      if (n && Math.abs(c.delta) > n) tooBig.add(c.key);
    }
  return out.map(({ pair, compared, changes }) => {
    const kept = changes.filter((c) => !tooBig.has(c.key) && !uncertain.has(`${c.key}|${pair.priorDate.slice(0, 7)}`));
    const moves: (Change & { bp: number })[] = [];
    for (const c of kept) {
      const n = c.noMove ? undefined : basis(c, pair);
      if (!n) continue;
      const bp = Math.round((10_000 * Math.abs(c.delta)) / n);
      if (bp >= MOVE_BP) moves.push({ ...c, bp });
    }
    return { pair, compared, changes: kept, moves };
  });
}

/** A fund's three biggest purchases and sales by value, each half a percent or more of its net assets (`BIG_SHARE`). */
export function biggest(changes: readonly Change[], netAssets: number): { buys: Change[]; sells: Change[] } {
  const big = changes.filter((c) => netAssets > 0 && c.usd >= BIG_SHARE * netAssets).sort((x, y) => y.usd - x.usd || x.key.localeCompare(y.key));
  return { buys: big.filter((c) => c.delta > 0).slice(0, 3), sells: big.filter((c) => c.delta < 0).slice(0, 3) };
}

/** A fund's report as the committed file keeps it. */
export interface FundQuarter {
  reportDate: string;
  priorDate: string;
  filedOn: string;
  accession: string;
  amended: boolean;
  compared: number;
  netAssets: number;
  buys: Change[];
  sells: Change[];
}

/** A company's page's move as the committed file keeps it. */
export interface FundMove {
  reportDate: string;
  priorDate: string;
  series: string;
  delta: number;
  after: number;
  filedOn: string;
  accession: string;
  bp: number;
  amended: boolean;
  split: number;
}

/** A year's committed file, written from its months' comparisons: funds by series id ([name, CIK]), security names, fund reports and company moves. */
export interface FundYear {
  funds: Record<string, [string, string]>;
  names: string[];
  series: Record<string, unknown[][]>;
  pages: Record<string, unknown[][]>;
}

export function newYear(): FundYear & { nameAt: Map<string, number> } {
  return { funds: {}, names: [], series: {}, pages: {}, nameAt: new Map() };
}

/** Adds a month's comparisons to its year: each fund page's report with a big change, and each company's 1% moves. */
export function addMonth(
  year: FundYear & { nameAt: Map<string, number> },
  compared: ReturnType<typeof compareMonth>,
  fundName: (series: string) => string,
  isPage: (series: string) => boolean,
): void {
  const nameIndex = (name: string) => year.nameAt.get(name) ?? (year.names.push(name), year.nameAt.set(name, year.names.length - 1).get(name)!);
  const CHANGE = (c: Change) => [nameIndex(c.name), c.ticker ?? null, c.delta, c.after, c.usd, c.split];
  for (const { pair, compared: n, changes, moves } of compared) {
    const { buys, sells } = biggest(changes, pair.netAssets);
    const use = (isPage(pair.series) && (buys.length || sells.length)) || moves.length;
    if (!use) continue;
    year.funds[pair.series] = [fundName(pair.series), pair.cik];
    if (isPage(pair.series) && (buys.length || sells.length))
      (year.series[pair.series] ??= []).push([pair.reportDate, pair.priorDate, pair.filedOn, pair.accession, pair.amended ? 1 : 0, n, Math.round(pair.netAssets), buys.map(CHANGE), sells.map(CHANGE)]);
    for (const m of moves) (year.pages[m.ticker!] ??= []).push([pair.reportDate, pair.priorDate, pair.series, m.delta, m.after, pair.filedOn, pair.accession, m.bp, pair.amended ? 1 : 0, m.split]);
  }
}

const changeOf = (names: readonly string[], r: readonly unknown[]): Change => ({
  key: "",
  name: names[Number(r[0])] ?? "",
  ticker: r[1] == null ? undefined : String(r[1]),
  delta: Number(r[2]),
  after: Number(r[3]),
  usd: Number(r[4]),
  split: Number(r[5] ?? 1),
});

let cached: { dir: string; funds: Map<string, [string, string]>; series: Map<string, FundQuarter[]>; pages: Map<string, FundMove[]> } | null = null;

/** The committed years: each fund's name and CIK by series id, each fund page's reports, and each company page's moves. */
export function fundHoldings(dir = FUND_HOLDINGS_DIR): {
  funds: ReadonlyMap<string, readonly [string, string]>;
  series: ReadonlyMap<string, readonly FundQuarter[]>;
  pages: ReadonlyMap<string, readonly FundMove[]>;
} {
  if (cached?.dir === dir) return cached;
  const funds = new Map<string, [string, string]>();
  const series = new Map<string, FundQuarter[]>();
  const pages = new Map<string, FundMove[]>();
  for (const f of existsSync(dir) ? readdirSync(dir).filter((f) => /^\d{4}\.json\.gz$/.test(f)).sort() : []) {
    const body = JSON.parse(gunzipSync(readFileSync(join(dir, f))).toString("utf8")) as FundYear;
    for (const [id, v] of Object.entries(body.funds)) funds.set(id, v);
    for (const [id, rows] of Object.entries(body.series))
      (series.get(id) ?? series.set(id, []).get(id)!).push(
        ...rows.map((r) => ({
          reportDate: String(r[0]),
          priorDate: String(r[1]),
          filedOn: String(r[2]),
          accession: String(r[3]),
          amended: r[4] === 1,
          compared: Number(r[5]),
          netAssets: Number(r[6]),
          buys: (r[7] as unknown[][]).map((c) => changeOf(body.names, c)),
          sells: (r[8] as unknown[][]).map((c) => changeOf(body.names, c)),
        })),
      );
    for (const [ticker, rows] of Object.entries(body.pages))
      (pages.get(ticker) ?? pages.set(ticker, []).get(ticker)!).push(
        ...rows.map((r) => ({
          reportDate: String(r[0]),
          priorDate: String(r[1]),
          series: String(r[2]),
          delta: Number(r[3]),
          after: Number(r[4]),
          filedOn: String(r[5]),
          accession: String(r[6]),
          bp: Number(r[7]),
          amended: r[8] === 1,
          split: Number(r[9] ?? 1),
        })),
      );
  }
  cached = { dir, funds, series, pages };
  return cached;
}

const DAY = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  return `${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][m - 1]} ${dd}, ${y}`;
};
const n = (x: number) => Math.abs(x).toLocaleString("en-US");
const signed = (x: number) => `${x > 0 ? "+" : "−"}${n(x)}`;
const pct = (bp: number) => `${(bp / 100).toFixed(bp >= 1_000 ? 0 : 1)}%`;
/** Dollars as a row says them: "$1.4 trillion", "$2.3 million", "$840,000". */
export const usdText = (x: number) =>
  x >= 1e12 ? `$${(x / 1e12).toFixed(1).replace(/\.0$/, "")} trillion` : x >= 1e9 ? `$${(x / 1e9).toFixed(1).replace(/\.0$/, "")} billion` : x >= 1e6 ? `$${(x / 1e6).toFixed(1).replace(/\.0$/, "")} million` : `$${Math.round(x).toLocaleString("en-US")}`;
const accessionUrl = (cik: string, accession: string) => `https://www.sec.gov/Archives/edgar/data/${cik}/${accession.replace(/-/g, "")}/`;
const SPLIT_NOTE = (s: number) => (s === 1 ? "" : s > 1 ? ` (the report before read after a ${s}-for-1 split)` : ` (the report before read after a 1-for-${Math.round(1 / s)} reverse split)`);
const CAVEAT =
  "A fund's N-PORT report gives its holdings at a month's end, and its report for each fiscal quarter's last month is public, filed within 60 days; a change is the difference from its previous public report, not a trade's day or price, and bonds, options and swaps are left out.";
const LIMIT = 1_200;
const security = (c: Change) => (c.ticker ? `${c.name} (${c.ticker})` : c.name);

/** A fund page's reports as timeline events, from `from`: a row on each report's filing day naming its biggest purchases and sales. */
export function fundReportEvents(quarters: readonly FundQuarter[], { series, name, cik, from = "" }: { series: string; name: string; cik: string; from?: string }): TimelineEvent[] {
  const rows: TimelineEvent[] = [];
  for (const q of quarters) {
    if (q.filedOn < from || !(q.buys.length || q.sells.length)) continue;
    const top = [q.buys[0] && `biggest purchase ${security(q.buys[0])} (${signed(q.buys[0].delta)} shares)`, q.sells[0] && `biggest sale ${security(q.sells[0])} (${signed(q.sells[0].delta)})`].filter(Boolean).join(", ");
    const list = (cs: Change[]) => cs.map((c) => `${security(c)} ${signed(c.delta)} to ${n(c.after)} shares, about ${usdText(c.usd)}${SPLIT_NOTE(c.split)}`).join("; ");
    const text =
      `${CAVEAT} Between its reports of ${DAY(q.priorDate)} and ${DAY(q.reportDate)}, ${n(q.compared)} positions compared, net assets ${usdText(q.netAssets)}; a change named is half a percent of them or more, valued at the later report's prices.` +
      (q.buys.length ? ` Biggest purchases: ${list(q.buys)}.` : "") +
      (q.sells.length ? ` Biggest sales: ${list(q.sells)}.` : "");
    rows.push({
      id: `nport-${series}-${q.reportDate}`,
      date: q.filedOn,
      type: "filing",
      title: `${name}'s ${q.amended ? "amended " : ""}N-PORT report for ${DAY(q.reportDate)}: ${top}`,
      description: text.length <= LIMIT ? text : `${text.slice(0, LIMIT - 1).replace(/\s+\S*$/, "")}…`,
      source: "SEC, Form N-PORT",
      url: accessionUrl(cik, q.accession),
      sourceKey: "fund_nport",
      externalId: q.accession,
      dedupBasis: `nport:${series}@${q.reportDate}`,
    });
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

/** A company page's funds' 1% moves as timeline events, from `from`, each on its report's filing day. */
export function fundMoveEvents(moves: readonly FundMove[], funds: ReadonlyMap<string, readonly [string, string]>, { ticker, name, from = "" }: { ticker: string; name: string; from?: string }): TimelineEvent[] {
  const rows: TimelineEvent[] = [];
  for (const m of moves) {
    if (m.filedOn < from) continue;
    const [fund, cik] = funds.get(m.series) ?? [`Series ${m.series}`, ""];
    const before = m.after - m.delta;
    rows.push({
      id: `nport-${ticker}-${m.reportDate}-${m.series}`,
      date: m.filedOn,
      type: "filing",
      title: `${fund} reported ${m.delta > 0 ? "buying" : "selling"} ${n(m.delta)} ${name} shares between ${DAY(m.priorDate)} and ${DAY(m.reportDate)} (${pct(m.bp)} of the company)`,
      description:
        `${CAVEAT} Its ${m.amended ? "amended " : ""}report for ${DAY(m.reportDate)}, filed ${DAY(m.filedOn)}: ${n(m.after)} shares, from ${n(Math.round(before))} at ${DAY(m.priorDate)}${SPLIT_NOTE(m.split)}` +
        `${m.after === 0 ? ", the whole position sold" : before === 0 ? ", a new position" : ""}.`,
      source: "SEC, Form N-PORT",
      url: cik ? accessionUrl(cik, m.accession) : "https://www.sec.gov/data-research/sec-markets-data/form-n-port-data-sets",
      sourceKey: "fund_nport",
      externalId: m.accession,
      dedupBasis: `nport:${ticker}@${m.reportDate}:${m.series}`,
    });
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

