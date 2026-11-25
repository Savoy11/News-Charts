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
  /** the shares the owner holds after the trade, as the filing states them */
  after?: number;
  /** whether the owner holds the shares directly ("D"), not through a fund, trust or company ("I") */
  direct?: boolean;
  /** a stated price read as the trade's total (`readPrices`), or set aside as no share's price */
  read?: "total" | "aside";
}

/**
 * Whether a security title names the company's own shares: common or ordinary shares, units, ADSs, never a preferred
 * share, a note, a debenture, a warrant, an option or a right (batch 184: an insurer's 40,000,000 "shares" of a closed-end
 * fund at $40,000,000 each were its notes, the principal in both columns). A title's attached rights are not its own
 * ("Common Stock (including associated preferred stock purchase rights)").
 */
export function ownShares(title: string): boolean {
  const head = title.toLowerCase().split(/\(| and associated| and attached| with associated| with attached| including| together with/)[0];
  return !/prefer|\bpref\b|preference|\bnotes?\b|debenture|\bbonds?\b|\bloans?\b|warrant|\boptions?\b|\brights?\b|\bswaps?\b|auction|capital securities|trust securities/.test(head);
}

/**
 * The filings as read: an amendment (4/A, 5/A) restates the last filing before it by the same owner for the same issuer
 * and period, which keeps its day, as the trades were public from it; an amendment with none before it is its own. An
 * amendment's trades dated after that filing's day, which it could not have reported, are a filing of their own on the
 * amendment's day (batch 184: Seeger's 4/A for Becton Dickinson's filing of 2022-02-02 adds trades of 2022-02-08).
 */
export function effectiveFilings(filings: readonly Filing[]): (Filing & { amended?: true })[] {
  const out: (Filing & { amended?: true })[] = [];
  const last = new Map<string, number>();
  for (const f of [...filings].sort((a, b) => a.filedOn.localeCompare(b.filedOn) || a.accession.localeCompare(b.accession))) {
    const k = `${f.issuerCik}|${f.ownerCik}|${f.period}`;
    const at = last.get(k);
    if (f.form.endsWith("/A") && at !== undefined) {
      const was = out[at];
      const late = f.trades.filter((t) => t.day > was.filedOn);
      out[at] = { ...was, trades: f.trades.filter((t) => !(t.day > was.filedOn)), plan: f.plan || was.plan, amended: true };
      if (late.length) out.push({ ...f, trades: late, amended: true });
      continue;
    }
    last.set(k, out.length);
    out.push(f);
  }
  return out.filter((f) => f.trades.length);
}

/**
 * A trade's price is compared with the same company's other filings' prices of the 10 days either side, else of the
 * year either side (batch 184, the audit's finding 1): a filer can put the trade's total in the price column (Mubadala's
 * 40,000,000 AMD shares "at $525,600,000.00 a share", 2017-08-04). A price five times the near median, or fifty times
 * the year's, is read as the trade's total where that total gives a share's price within half again of the median, and
 * is set aside otherwise; with no three other prices to compare, a price over $1,000,000 a share or a trade over $5
 * billion is set aside (no company that trades so seldom sees one), and so is a price a hundred times the median of the
 * company's whole record of four or more,
 * which a year of slips cannot move (Workhorse's of 2014–2016). A price identical to the trade's is no comparison (a
 * group's filers repeat one slip), nor one of the same filing. A price too low is left as stated: it can only leave a
 * day out.
 */
export const NEAR_DAYS = 10;
export const YEAR_DAYS = 365;
export const MAX_PRICE = 1_000_000;
export const MAX_TRADE = 5_000_000_000;

export function readPrices<F extends Filing>(filings: readonly F[]): F[] {
  const out = filings.map((f) => ({ ...f, trades: f.trades.map((t) => ({ ...t })) }));
  type Item = { at: number; price: number; f: number; t: number };
  const byIssuer = new Map<number, Item[]>();
  out.forEach((f, fi) =>
    f.trades.forEach((t, ti) => {
      if (t.value === undefined || !(t.shares > 0)) return;
      const at = Math.floor(Date.parse(t.day || f.filedOn) / 86_400_000);
      if (!Number.isFinite(at)) return;
      (byIssuer.get(f.issuerCik) ?? byIssuer.set(f.issuerCik, []).get(f.issuerCik)!).push({ at, price: t.value / t.shares, f: fi, t: ti });
    }),
  );
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  };
  for (const items of byIssuer.values()) {
    items.sort((a, b) => a.at - b.at);
    const whole = items.length >= 4 ? median(items.map((x) => x.price)) : undefined;
    const ats = items.map((x) => x.at);
    const from = (d: number) => {
      let lo = 0;
      let hi = ats.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (ats[mid] < d) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    };
    const others = (x: Item, days: number) => {
      const acc = out[x.f].accession;
      const prices: number[] = [];
      for (let k = from(x.at - days); k < items.length && items[k].at <= x.at + days; k++) {
        const y = items[k];
        if (out[y.f].accession !== acc && Math.abs(y.price - x.price) > 1e-9 * x.price) prices.push(y.price);
      }
      return prices;
    };
    for (const x of items) {
      const near = others(x, NEAR_DAYS);
      const year = near.length >= 3 ? near : others(x, YEAR_DAYS);
      const ref = year.length >= 3 ? median(year) : undefined;
      const t = out[x.f].trades[x.t];
      const suspect = ref !== undefined ? x.price > (near.length >= 3 ? 5 : 50) * ref : x.price > MAX_PRICE || t.value! > MAX_TRADE;
      const offRecord = whole !== undefined && x.price > 100 * whole;
      if (!suspect && !offRecord) continue;
      const each = x.price / t.shares;
      if (suspect && ref !== undefined && each >= ref / 1.5 && each <= ref * 1.5) {
        t.value = Math.round(x.price);
        t.read = "total";
      } else {
        t.value = undefined;
        t.read = "aside";
      }
    }
  }
  return out;
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
  /** whole dollars, the trades with a price, where some gave none (batch 184) */
  priced?: number;
  first: string;
  last: string;
  plan: boolean;
  amended: boolean;
  joint: number;
  /** the other filers who reported the same shares (batch 184, `companyDays`) */
  also?: string[];
  /** a price the filing gives read as the trade's total, or set aside (`readPrices`) */
  total?: boolean;
  setAside?: boolean;
  /** the holdings after each of its trades, added, and whether any of its shares are held directly: read only to find a block reported twice */
  after?: number;
  direct?: boolean;
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
export const dayValue = (d: Pick<InsiderDay, "entries">) => d.entries.reduce((s, e) => s + (e.value ?? e.priced ?? 0), 0);

/** Whether a company's filing day is shown: its trades worth $1 million or more together (`MIN_DAY_VALUE`). */
export const bigEnough = (d: Pick<InsiderDay, "entries">) => dayValue(d) >= MIN_DAY_VALUE;

/**
 * Each company's filing days, by issuer CIK: one row a company a day, an insider's purchases and sales each one entry.
 * Entries of one day with the same code, shares, trade days and value, and holdings after within a ten-thousandth (a
 * group's filers round their parts), are one block its owners each reported (batch 184, the audit's finding 2: Antero
 * Resources Investment LLC's 12,000,000 shares of 2014-05-21, held through it by twelve other filers, each of whom filed
 * them) where at most one holds them directly, or where the holdings after are more than the trade and not nothing, which
 * two owners hold alike only as one (a husband and wife, each "direct", Reitzel's of 2006): the one held directly, else
 * the first, keeps it, naming the others (`also`), and the block counts once. Two who each sold out or each made a first
 * purchase alike, both directly, stay two.
 */
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
        if (!e) {
          const fresh: Entry = { owner: f.owner, rel: f.rel, title: f.title, code: t.code, shares: t.shares, value: t.value, first: t.day, last: t.day, plan: f.plan, amended: !!f.amended, joint: f.joint, after: t.after, direct: t.direct === true };
          if (t.value === undefined) fresh.priced = 0;
          if (t.read === "total") fresh.total = true;
          if (t.read === "aside") fresh.setAside = true;
          entries.set(k, fresh);
        } else {
          e.shares += t.shares;
          if (e.value !== undefined && t.value !== undefined) e.value += t.value;
          else {
            e.priced = (e.priced ?? e.value ?? 0) + (t.value ?? 0);
            e.value = undefined;
          }
          if (t.day && (!e.first || t.day < e.first)) e.first = t.day;
          if (t.day > e.last) e.last = t.day;
          // added, as a filing lists its holdings in any order (Blackstone's three of Hilton's 2017-03-17)
          e.after = e.after === undefined || t.after === undefined ? undefined : e.after + t.after;
          e.direct ||= t.direct === true;
          e.plan ||= f.plan;
          e.amended ||= !!f.amended;
          if (t.read === "total") e.total = true;
          if (t.read === "aside") e.setAside = true;
        }
        const size = t.value ?? t.shares;
        if (!top || size > top.size) top = { accession: f.accession, size };
      }
    const first = fs[0];
    const order = (a: Entry, b: Entry) => (b.value ?? b.priced ?? 0) - (a.value ?? a.priced ?? 0) || b.shares - a.shares || a.owner.localeCompare(b.owner);
    const blocks = new Map<string, Entry[]>();
    const list: Entry[] = [];
    for (const e of [...entries.values()].sort(order)) {
      if (!e.priced) delete e.priced;
      if (e.after === undefined) {
        list.push(e);
        continue;
      }
      const k = [e.code, e.shares, e.first, e.last, e.value ?? "", e.priced ?? ""].join("|");
      (blocks.get(k) ?? blocks.set(k, []).get(k)!).push(e);
    }
    const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(2, 1e-4 * Math.max(a, b));
    const clusters: Entry[][] = [];
    for (const g of blocks.values()) {
      let at: Entry[] | null = null;
      for (const e of [...g].sort((a, b) => a.after! - b.after! || order(a, b))) {
        if (at && near(at[0].after!, e.after!)) at.push(e);
        else clusters.push((at = [e]));
      }
    }
    for (const g of clusters) {
      const held = g[0].after!;
      const alike = held > 0 && !near(held, g[0].shares);
      if (g.length === 1 || (g.filter((e) => e.direct).length > 1 && !alike)) {
        list.push(...g);
        continue;
      }
      const lead = g.find((e) => e.direct) ?? g[0];
      const rest = g.filter((e) => e !== lead);
      list.push({ ...lead, also: rest.map((e) => e.owner), plan: g.some((e) => e.plan), amended: g.some((e) => e.amended), ...(g.some((e) => e.total) ? { total: true } : {}), ...(g.some((e) => e.setAside) ? { setAside: true } : {}) });
    }
    list.sort(order);
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

/**
 * Adds a company's day to its year: [day, issuer name, accession, entries], each entry [owner, rel, title, code, shares,
 * value, first, last, plan, amended, joint, priced, also, read], `also` the other filers' owner indices and `read` 1 where
 * a price was read as the total, 2 where one was set aside (batch 184).
 */
export function addDay(year: ReturnType<typeof newYear>, cik: number, d: InsiderDay): void {
  const at = (m: Map<string, number>, list: string[], s: string) => m.get(s) ?? (list.push(s), m.set(s, list.length - 1).get(s)!);
  (year.pages[cik] ??= []).push([
    d.day,
    d.issuerName,
    d.accession,
    d.entries.map((e) => [
      at(year.ownerAt, year.owners, e.owner),
      e.rel,
      e.title ? at(year.titleAt, year.titles, e.title) : -1,
      e.code,
      e.shares,
      e.value ?? null,
      e.first,
      e.last,
      e.plan ? 1 : 0,
      e.amended ? 1 : 0,
      e.joint,
      e.priced ?? null,
      (e.also ?? []).map((o) => at(year.ownerAt, year.owners, o)),
      (e.total ? 1 : 0) | (e.setAside ? 2 : 0),
    ]),
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
            ...(e[11] == null ? {} : { priced: Number(e[11]) }),
            ...(Array.isArray(e[12]) && e[12].length ? { also: (e[12] as number[]).map((o) => body.owners[o] ?? "") } : {}),
            ...(Number(e[13]) & 1 ? { total: true } : {}),
            ...(Number(e[13]) & 2 ? { setAside: true } : {}),
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
    const names = (xs: string[]) => {
      const list = xs.length <= 3 ? xs : [...xs.slice(0, 3), `${xs.length - 3} more`];
      return list.length === 1 ? list[0] : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
    };
    const alsoBy = (e: Entry) => (e.also?.length ? `, the same shares reported also by ${names(e.also)}` : "");
    const verb = (c: "P" | "S") => (c === "P" ? "bought" : "sold");
    let title: string;
    if (d.entries.length === 1) {
      const e = d.entries[0];
      const role = roleOf(e);
      const others = e.also?.length ? `, reported also by ${e.also.length} other filer${e.also.length > 1 ? "s" : ""},` : "";
      title = `${who(e)}${role ? ` (${role})` : ""}${others} ${verb(e.code)} ${n(e.shares)} ${d.issuerName} shares${e.value ? `, about ${usd(e.value)}` : ""}`;
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
      const worth = e.value ? ` (about ${usd(e.value)})` : e.priced ? ` (about ${usd(e.priced)} for the trades with a price)` : "";
      const read = `${e.total ? ", a price the filing gives read as the trade's total" : ""}${e.setAside ? ", a price the filing gives set aside as no share's price" : ""}`;
      return `${who(e)}${role ? `, ${role}` : ""}${alsoBy(e)}: ${verb(e.code)} ${n(e.shares)} shares${days(e)}${price}${worth}${read}${e.plan ? ", under a Rule 10b5-1 trading plan" : ""}${e.amended ? ", as amended" : ""}`;
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
