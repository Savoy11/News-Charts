import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import type { TimelineEvent } from "./types";

/**
 * Insiders' open-market trades in their own company's stock (batch 181; the owner's call of 2026-11-24, "Insider trades,
 * Form 4", reversing the call of 2026-10-18 to leave insider forms out). An officer, a director or a 10% owner reports a
 * trade on Form 4 within two business days, and a late or exempt one on Form 5; the SEC's insider transactions data sets
 * hold every such filing's table from 2006. Only open-market purchases (code P) and sales (code S) of the company's own
 * shares are kept, never a derivative: grants, option exercises, tax withholding, gifts, conversions and the rest are
 * the plan's or the law's, not the insider's choice to buy or sell, and filed so often they would bury a timeline (the
 * reason of 2026-10-18).
 *
 * One row a company a day whose trades come to $1 million or more together (`MIN_DAY_VALUE`, batch 182), on the day
 * the filings were filed, naming each insider's purchases and sales with their
 * shares, value and trade days. The committed files are `data/insiders/<year>.json.gz`, by filing day, written by `npm
 * run sync:insiders` (scripts/sync-insiders.ts).
 */
export const INSIDER_TRADES_DIR = join(__dirname, "..", "data", "insiders");

/** A reporting owner's relationship to the issuer, as bits: the data sets' "Director,Officer,TenPercentOwner,Other". */
export const REL = { director: 1, officer: 2, tenPercent: 4, other: 8 } as const;
export function relOf(text: string): number {
  let r = 0;
  for (const part of text.split(",").map((p) => p.trim().toLowerCase())) {
    if (part === "director") r |= REL.director;
    else if (part === "officer") r |= REL.officer;
    else if (part === "tenpercentowner") r |= REL.tenPercent;
    else if (part === "other") r |= REL.other;
  }
  return r;
}
/** Whether an owner is an insider the rule keeps: an officer, a director or a 10% owner ("Other" alone is none). */
export const isInsider = (rel: number) => (rel & (REL.director | REL.officer | REL.tenPercent)) !== 0;

const MONTHS: Record<string, string> = { JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06", JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12" };
/** The data sets' "26-SEP-2024" as 2024-09-26; "" where it is no day. */
export function dayOf(s: string): string {
  const m = /^(\d{2})-([A-Z]{3})-(\d{4})$/.exec(s.trim().toUpperCase());
  return m && MONTHS[m[2]] ? `${m[3]}-${MONTHS[m[2]]}-${m[1]}` : "";
}

/** One filing's open-market trades, by its first reporting owner (a joint filing's others counted, as they report the same shares). */
export interface Filing {
  accession: string;
  filedOn: string;
  form: string;
  issuerCik: number;
  issuerName: string;
  period: string;
  /** the filing's box for a trade under a Rule 10b5-1 plan, which the form has had since 2023 */
  plan: boolean;
  ownerCik: string;
  owner: string;
  /** the relationship bits of every reporting owner */
  rel: number;
  title?: string;
  /** the reporting owners beside the first */
  joint: number;
  trades: Trade[];
}

export interface Trade {
  code: "P" | "S";
  shares: number;
  /** shares times the price per share, in whole dollars, where a price is given */
  value?: number;
  day: string;
}

/**
 * The filings as read: an amendment (4/A, 5/A) restates the last filing before it by the same owner for the same issuer
 * and period, which keeps its day, as the trades were public from it; an amendment with none before it is its own.
 */
export function effectiveFilings(filings: readonly Filing[]): (Filing & { amended?: true })[] {
  const out: (Filing & { amended?: true })[] = [];
  const last = new Map<string, number>();
  for (const f of [...filings].sort((a, b) => a.filedOn.localeCompare(b.filedOn) || a.accession.localeCompare(b.accession))) {
    const k = `${f.issuerCik}|${f.ownerCik}|${f.period}`;
    const at = last.get(k);
    if (f.form.endsWith("/A") && at !== undefined) {
      out[at] = { ...out[at], trades: f.trades, plan: f.plan || out[at].plan, amended: true };
      continue;
    }
    last.set(k, out.length);
    out.push(f);
  }
  return out.filter((f) => f.trades.length);
}

/** An insider's purchases or sales on a company's filing day. */
export interface Entry {
  owner: string;
  rel: number;
  title?: string;
  code: "P" | "S";
  shares: number;
  /** whole dollars, where every trade gave a price */
  value?: number;
  first: string;
  last: string;
  plan: boolean;
  amended: boolean;
  joint: number;
}

/** A company's filing day: its name as the filings gave it, the filing with the largest trade, and each insider's entries. */
export interface InsiderDay {
  day: string;
  issuerName: string;
  accession: string;
  entries: Entry[];
}

/**
 * The smallest day a page shows, in whole dollars: the owner's call of 2026-11-24 ("Add the $1 million minimum"), as every
 * open-market trade made a large company's page busy (Meta's 1,264 days, a few hundred shares a week under a trading
 * plan). A day's purchases and sales are added; a trade the filing gives no price for adds nothing.
 */
export const MIN_DAY_VALUE = 1_000_000;

/** A filing day's purchases and sales together, in whole dollars, the trades with a price. */
export const dayValue = (d: Pick<InsiderDay, "entries">) => d.entries.reduce((s, e) => s + (e.value ?? 0), 0);

/** Whether a company's filing day is shown: its trades worth $1 million or more together (`MIN_DAY_VALUE`). */
export const bigEnough = (d: Pick<InsiderDay, "entries">) => dayValue(d) >= MIN_DAY_VALUE;

/** Each company's filing days, by issuer CIK: one row a company a day, an insider's purchases and sales each one entry. */
export function companyDays(filings: readonly (Filing & { amended?: true })[]): Map<number, InsiderDay[]> {
  const byDay = new Map<string, (Filing & { amended?: true })[]>();
  for (const f of filings) {
    const k = `${f.issuerCik}|${f.filedOn}`;
    (byDay.get(k) ?? byDay.set(k, []).get(k)!).push(f);
  }
  const out = new Map<number, InsiderDay[]>();
  for (const fs of byDay.values()) {
    const entries = new Map<string, Entry>();
    let top: { accession: string; size: number } | null = null;
    for (const f of fs)
      for (const t of f.trades) {
        const k = `${f.ownerCik}|${t.code}`;
        const e = entries.get(k);
        if (!e) entries.set(k, { owner: f.owner, rel: f.rel, title: f.title, code: t.code, shares: t.shares, value: t.value, first: t.day, last: t.day, plan: f.plan, amended: !!f.amended, joint: f.joint });
        else {
          e.shares += t.shares;
          e.value = e.value === undefined || t.value === undefined ? undefined : e.value + t.value;
          if (t.day && (!e.first || t.day < e.first)) e.first = t.day;
          if (t.day > e.last) e.last = t.day;
          e.plan ||= f.plan;
          e.amended ||= !!f.amended;
        }
        const size = t.value ?? t.shares;
        if (!top || size > top.size) top = { accession: f.accession, size };
      }
    const first = fs[0];
    const list = [...entries.values()].sort((a, b) => (b.value ?? 0) - (a.value ?? 0) || b.shares - a.shares || a.owner.localeCompare(b.owner));
    (out.get(first.issuerCik) ?? out.set(first.issuerCik, []).get(first.issuerCik)!).push({ day: first.filedOn, issuerName: first.issuerName, accession: top!.accession, entries: list });
  }
  for (const days of out.values()) days.sort((a, b) => a.day.localeCompare(b.day));
  return out;
}

/** A year's committed file: owners' names and titles once each, and each company's days by issuer CIK. */
export interface InsiderYear {
  owners: string[];
  titles: string[];
  pages: Record<string, unknown[][]>;
}

export function newYear(): InsiderYear & { ownerAt: Map<string, number>; titleAt: Map<string, number> } {
  return { owners: [], titles: [], pages: {}, ownerAt: new Map(), titleAt: new Map() };
}

/** Adds a company's day to its year: [day, issuer name, accession, entries], each entry [owner, rel, title, code, shares, value, first, last, plan, amended, joint]. */
export function addDay(year: ReturnType<typeof newYear>, cik: number, d: InsiderDay): void {
  const at = (m: Map<string, number>, list: string[], s: string) => m.get(s) ?? (list.push(s), m.set(s, list.length - 1).get(s)!);
  (year.pages[cik] ??= []).push([
    d.day,
    d.issuerName,
    d.accession,
    d.entries.map((e) => [at(year.ownerAt, year.owners, e.owner), e.rel, e.title ? at(year.titleAt, year.titles, e.title) : -1, e.code, e.shares, e.value ?? null, e.first, e.last, e.plan ? 1 : 0, e.amended ? 1 : 0, e.joint]),
  ]);
}

let cached: { dir: string; pages: Map<number, InsiderDay[]> } | null = null;

/** The committed years' days by issuer CIK. */
export function insiderTrades(dir = INSIDER_TRADES_DIR): ReadonlyMap<number, readonly InsiderDay[]> {
  if (cached?.dir === dir) return cached.pages;
  const pages = new Map<number, InsiderDay[]>();
  for (const f of existsSync(dir) ? readdirSync(dir).filter((f) => /^\d{4}\.json\.gz$/.test(f)).sort() : []) {
    const body = JSON.parse(gunzipSync(readFileSync(join(dir, f))).toString("utf8")) as InsiderYear;
    for (const [cik, rows] of Object.entries(body.pages))
      (pages.get(Number(cik)) ?? pages.set(Number(cik), []).get(Number(cik))!).push(
        ...rows.map((r) => ({
          day: String(r[0]),
          issuerName: String(r[1]),
          accession: String(r[2]),
          entries: (r[3] as unknown[][]).map((e) => ({
            owner: body.owners[Number(e[0])] ?? "",
            rel: Number(e[1]),
            title: Number(e[2]) >= 0 ? body.titles[Number(e[2])] : undefined,
            code: e[3] === "P" ? ("P" as const) : ("S" as const),
            shares: Number(e[4]),
            value: e[5] == null ? undefined : Number(e[5]),
            first: String(e[6] ?? ""),
            last: String(e[7] ?? ""),
            plan: e[8] === 1,
            amended: e[9] === 1,
            joint: Number(e[10] ?? 0),
          })),
        })),
      );
  }
  cached = { dir, pages };
  return pages;
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${dd}, ${y}`;
};
const n = (x: number) => Math.round(Math.abs(x)).toLocaleString("en-US");
const usd = (x: number) =>
  x >= 1e9 ? `$${(x / 1e9).toFixed(1).replace(/\.0$/, "")} billion` : x >= 1e6 ? `$${(x / 1e6).toFixed(1).replace(/\.0$/, "")} million` : `$${Math.round(x).toLocaleString("en-US")}`;
/** An insider's role as a row says it: the officer's title the filing gives, else "director", "10% owner" or "officer". */
export function roleOf(e: Pick<Entry, "rel" | "title">): string {
  const roles: string[] = [];
  if (e.rel & REL.officer) roles.push(e.title?.trim() || "officer");
  if (e.rel & REL.director) roles.push("director");
  if (e.rel & REL.tenPercent) roles.push("10% owner");
  return roles.join(", ");
}
const days = (e: Entry) => (!e.first ? "" : e.first === e.last ? ` on ${DAY(e.first)}` : ` from ${DAY(e.first)} to ${DAY(e.last)}`);
const CAVEAT =
  "An officer, a director or a 10% owner reports a trade in the company's stock on Form 4 within two business days; only purchases and sales in the open market or in private deals for cash are shown (codes P and S), never grants, option exercises, tax withholding or gifts.";
const LIMIT = 1_200;

/** A company page's insider days under one issuer CIK (its own, or a predecessor's) as timeline events, from `from`: a row a filing day. */
export function insiderEvents(list: readonly InsiderDay[], { ticker, cik, from = "" }: { ticker: string; cik: number | string; from?: string }): TimelineEvent[] {
  const rows: TimelineEvent[] = [];
  for (const day of list) {
    if (day.day < from || !day.entries.length) continue;
    // EDGAR's state of incorporation off the name ("OCCIDENTAL PETROLEUM CORP /DE/")
    const d = { ...day, issuerName: day.issuerName.replace(/\s+\/[A-Z]{2,3}\/?$/, "") };
    const who = (e: Entry) => `${e.owner}${e.joint ? ` and ${e.joint} joint filer${e.joint > 1 ? "s" : ""}` : ""}`;
    const verb = (c: "P" | "S") => (c === "P" ? "bought" : "sold");
    let title: string;
    if (d.entries.length === 1) {
      const e = d.entries[0];
      const role = roleOf(e);
      title = `${who(e)}${role ? ` (${role})` : ""} ${verb(e.code)} ${n(e.shares)} ${d.issuerName} shares${e.value ? `, about ${usd(e.value)}` : ""}`;
    } else {
      const part = (c: "P" | "S") => {
        const es = d.entries.filter((e) => e.code === c);
        if (!es.length) return "";
        const shares = es.reduce((s, e) => s + e.shares, 0);
        const value = es.every((e) => e.value !== undefined) ? es.reduce((s, e) => s + (e.value ?? 0), 0) : undefined;
        return `${es.length === 1 ? "one" : es.length} ${verb(c)} ${n(shares)} shares${value ? ` (about ${usd(value)})` : ""}`;
      };
      title = `Insiders' trades in ${d.issuerName}: ${[part("S"), part("P")].filter(Boolean).join("; ")}, led by ${d.entries[0].owner}`;
    }
    const lines = d.entries.map((e) => {
      const role = roleOf(e);
      const price = e.value && e.shares ? ` at about $${(e.value / e.shares).toFixed(2)} a share` : "";
      return `${who(e)}${role ? `, ${role}` : ""}: ${verb(e.code)} ${n(e.shares)} shares${days(e)}${price}${e.value ? ` (about ${usd(e.value)})` : ""}${e.plan ? ", under a Rule 10b5-1 trading plan" : ""}${e.amended ? ", as amended" : ""}`;
    });
    const text = `${CAVEAT} Filed ${DAY(d.day)}: ${lines.join("; ")}.`;
    rows.push({
      id: `insider-${ticker}-${Number(cik)}-${d.day}`,
      date: d.day,
      type: "filing",
      title,
      description: text.length <= LIMIT ? text : `${text.slice(0, LIMIT - 1).replace(/\s+\S*$/, "")}…`,
      source: "SEC, Forms 4 and 5",
      url: `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${d.accession.replace(/-/g, "")}/`,
      sourceKey: "insider_trades",
      externalId: d.accession,
      dedupBasis: `insider:${ticker}:${Number(cik)}@${d.day}`,
    });
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}
