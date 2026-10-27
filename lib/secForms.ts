import type { TimelineEvent } from "./types";

/**
 * The forms only a fund registrant files, matched against the label `lib/sec.ts` writes at the
 * end of a filing's title. Its own module so the relevance floor can read it without loading the
 * EDGAR ticker index that `lib/sec.ts` carries.
 */
export const REGISTRANT_FORM = /\((?:N-CSRS?|N-30D|N-CEN|NPORT-P|485APOS|485BPOS|497K?|N-1A)\)$/;

/**
 * The SEC's fixed list of Form 8-K items (the numbering in force since August 2004), each with a
 * plain name, **in order of how much the item tends to matter to the price** — the order is what
 * picks which item names a filing that reports several.
 *
 * Every 8-K title used to read "8-K filing" with the codes underneath as "Items: 5.02,9.01": the
 * one form that announces things — a bankruptcy, a restatement warning, an officer leaving, a deal
 * closing — was the one a reader could not tell apart without looking the numbers up.
 *
 * 2.02 is not here: an 8-K carrying results is typed and titled as an earnings announcement before
 * this list is consulted. 9.01 is last and never leads — it is the exhibit index attached to most
 * 8-Ks, so naming a filing after it would name nearly every filing the same thing.
 */
const EIGHT_K_ITEMS: [code: string, label: string][] = [
  ["1.03", "Bankruptcy or receivership"],
  ["4.02", "Past financial statements no longer reliable"],
  ["5.01", "Change in control"],
  ["3.01", "Delisting notice or listing transfer"],
  ["1.05", "Cybersecurity incident"],
  ["2.04", "Debt obligation accelerated"],
  ["6.04", "Missed required distribution"],
  ["2.01", "Acquisition or sale of assets completed"],
  ["1.01", "Material agreement"],
  ["1.02", "Material agreement ended"],
  ["2.06", "Material impairment"],
  ["2.05", "Exit or restructuring costs"],
  ["4.01", "Auditor change"],
  ["5.02", "Officer or director change"],
  ["2.03", "New debt or financial obligation"],
  ["3.03", "Change to shareholder rights"],
  ["3.02", "Unregistered sale of shares"],
  ["5.06", "Change in shell company status"],
  ["1.04", "Mine safety shutdown or violations"],
  ["5.03", "Bylaws or fiscal year change"],
  ["5.07", "Shareholder vote results"],
  ["5.05", "Code of ethics change or waiver"],
  ["5.04", "Employee plan trading suspended"],
  ["5.08", "Shareholder director nominations"],
  ["6.02", "Servicer or trustee change"],
  ["6.03", "Credit enhancement change"],
  ["6.01", "Asset-backed securities material"],
  ["6.05", "Securities Act updating disclosure"],
  ["6.06", "Static pool information"],
  ["7.01", "Regulation FD disclosure"],
  ["8.01", "Other events"],
  ["9.01", "Financial statements and exhibits"],
];

const ITEM_LABEL = new Map(EIGHT_K_ITEMS);
const ITEM_RANK = new Map(EIGHT_K_ITEMS.map(([code], i) => [code, i]));

/** The item codes EDGAR lists for an 8-K ("5.02,9.01"), in the order it lists them. */
export function eightKItems(items: string): string[] {
  return items
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Whether an 8-K reports results — EDGAR's item 2.02 — which makes it an earnings event. */
export function reportsResults(items: string): boolean {
  return eightKItems(items).includes("2.02");
}

/**
 * The item that names an 8-K: the most material one it reports, never 9.01. Null when no code is
 * in the current list — an 8-K filed before August 2004 used the old item numbers ("5", "7"),
 * which mean different things, and a guess at them would be a wrong title rather than a vague one.
 */
export function leadItem(items: string): { code: string; label: string } | null {
  let best: string | null = null;
  for (const code of eightKItems(items)) {
    if (code === "9.01" || !ITEM_RANK.has(code)) continue;
    if (best === null || ITEM_RANK.get(code)! < ITEM_RANK.get(best)!) best = code;
  }
  return best === null ? null : { code: best, label: ITEM_LABEL.get(best)! };
}

/**
 * Every item an 8-K reports, codes kept and named where the list knows them —
 * "Items 5.02 Officer or director change · 9.01 Financial statements and exhibits". The codes stay
 * so a reader can trace the title back to EDGAR; a code outside the list is shown bare.
 */
export function describeItems(items: string): string | undefined {
  const codes = eightKItems(items);
  if (!codes.length) return undefined;
  const named = codes.map((c) => {
    const label = c === "2.02" ? "Results of operations" : ITEM_LABEL.get(c);
    return label ? `${c} ${label}` : c;
  });
  return `${codes.length > 1 ? "Items" : "Item"} ${named.join(" · ")}`;
}

/**
 * The material forms a company files beyond its periodic reports — corrections, mergers, large
 * stakes, offerings and exits — chosen by the owner on 2026-10-18 (proposal 2). They were already
 * in every submissions record the scheduler downloads, and the form filter dropped them: roughly
 * three rows in four of Ford's record never reached the database.
 *
 * Insider-trade forms (3, 4, 5 and 144) are left out on the owner's call: they are likely the
 * largest pile of what is discarded, and insiders file them so often they would bury a timeline.
 * 8-K/A is not here — it takes the 8-K's item naming — and nor are 424B prospectuses, which are
 * grouped by day (`PROSPECTUS`).
 */
export const MATERIAL_FORMS: Record<string, { label: string; earnings?: true }> = {
  // corrections — a 10-K/A is often a restatement
  "10-K/A": { label: "Amended annual report" },
  "10-Q/A": { label: "Amended quarterly report" },
  "20-F/A": { label: "Amended annual report" },
  "40-F/A": { label: "Amended annual report" },
  // the annual report's own form until 2002, which the older shards reach
  "10-K405": { label: "Annual report", earnings: true },
  // mergers and buyouts
  "S-4": { label: "Merger or exchange registration" },
  DEFM14A: { label: "Merger vote proxy" },
  "SC TO-T": { label: "Tender offer by an outside bidder" },
  "SC 14D9": { label: "Board's response to a tender offer" },
  // the rest of the 2026-10-18 list's gaps, counted and picked by the owner on 2026-10-26 (batch 65)
  "F-4": { label: "Merger or exchange registration" },
  "SC TO-T/A": { label: "Update to a tender offer by an outside bidder" },
  "SC TO-I": { label: "The company's own tender or exchange offer" },
  // late-filing notices, which tend to come before a restatement: Apple's of 2006, NVIDIA's of 2002
  "NT 10-K": { label: "Notice that the annual report will be late" },
  "NT 10-Q": { label: "Notice that the quarterly report will be late" },
  "NT 20-F": { label: "Notice that the annual report will be late" },
  // proxy fights: Disney's of 2023 and 2024, GM's of 2017
  PREC14A: { label: "Proxy fight: preliminary proxy statement" },
  DEFC14A: { label: "Proxy fight: proxy statement" },
  DFAN14A: { label: "Proxy material from outside the company" },
  // large stakes — the SEC renamed these "SCHEDULE 13D/G" in December 2024; both spellings occur
  "SC 13D": { label: "Investor stake over 5%" },
  "SC 13D/A": { label: "Change to a 5%+ investor stake" },
  "SC 13G": { label: "Passive investor stake over 5%" },
  "SC 13G/A": { label: "Change to a passive 5%+ stake" },
  "SCHEDULE 13D": { label: "Investor stake over 5%" },
  "SCHEDULE 13D/A": { label: "Change to a 5%+ investor stake" },
  "SCHEDULE 13G": { label: "Passive investor stake over 5%" },
  "SCHEDULE 13G/A": { label: "Change to a passive 5%+ stake" },
  // offerings — a large seasoned issuer shelves on the automatic S-3ASR, a foreign one on F-3
  "S-3": { label: "Shelf registration for new securities" },
  "S-3ASR": { label: "Shelf registration for new securities" },
  "F-3": { label: "Shelf registration for new securities" },
  "F-3ASR": { label: "Shelf registration for new securities" },
  "F-10": { label: "Registration for new securities (Canadian company)" },
  // a foreign company's listing: ARM's of 2023, Alibaba's of 2014
  "F-1": { label: "Registration to sell shares (foreign company)" },
  // exits
  "25": { label: "Delisting notice" },
  "25-NSE": { label: "Removed from an exchange" },
  "15-12B": { label: "Deregistration — stops SEC reporting" },
  "15-12G": { label: "Deregistration — stops SEC reporting" },
};

/**
 * Forms a company files about another company as well as ones about itself: its own tender offer
 * for another company's shares, its proxy fight at another company. Its record lists both. One
 * about the company carries the company's own file number (Disney's 134 DFAN14As, 001-38842); one
 * it made about another company carries none there (all 46 of Pfizer's SC TO-T and SC TO-T/A
 * filings, among them its offers for Array, Medivation and King) — the rule the large-stake
 * schedules follow (`STAKE_FORM`, lib/sec.ts). Read with the default label, Pfizer's own bids read
 * "Tender offer by an outside bidder" on its page (batch 65).
 */
export const DEAL_FORM = /^(?:SC TO-T(?:\/A)?|PREC14A|DEFC14A|DFAN14A)$/;

/** Their labels when the company made them about another company. */
export const FOR_ANOTHER_COMPANY: Record<string, string> = {
  "SC TO-T": "Its tender offer for another company's shares",
  "SC TO-T/A": "Update to its tender offer for another company's shares",
  PREC14A: "Its proxy fight at another company: preliminary proxy statement",
  DEFC14A: "Its proxy fight at another company: proxy statement",
  DFAN14A: "Its proxy material in a vote at another company",
};

/**
 * Forms filed many times a month while a fight or an offer runs: Disney's DFAN14As, 58 in March
 * 2024; Pfizer's tender-offer updates, eight in July 2019. Grouped a row a month, as busy
 * prospectus months are (`pageFilings`).
 */
export const MONTHLY_FORM = /^(?:DFAN14A|SC TO-T\/A)$/;

/**
 * Prospectuses for new securities. Kept, but grouped into one row per form per day: a bank files
 * dozens of 424B2 structured-note supplements in a day, and one row each would bury its page and
 * multiply its rows in the database for no extra meaning.
 */
export const PROSPECTUS = /^424B[1-8]$/;

/** The large-stake schedules, 13D and 13G, under both of the SEC's spellings, and their amendments. */
export const STAKE_FORM = /^(?:SC 13[DG]|SCHEDULE 13[DG])(?:\/A)?$/;

/** A month with a prospectus form on at least this many days is routine issuance, not an offering. */
export const BUSY_PROSPECTUS_DAYS = 5;

const PROSPECTUS_ROW = /^(.*): Prospectus(?:es ×(\d+))? \((424B[1-8])\)$/;
const MONTHLY_ROW = /^(.*): (.+) \((DFAN14A|SC TO-T\/A)\)$/;

/**
 * A company page's filing rows, as the page should carry them (audit 2026-10-21 #4).
 *
 * Banks file prospectus supplements for structured notes nearly every business day: JPMorgan's
 * record holds 5,022 days of 424B2s, one grouped row each, and with its own stakes in other
 * companies (now left out at ingest, `lib/sec.ts`) they made 11,637 filing rows. Its page data
 * came to 5.4 MB, over the 2 MB Next will cache, so the 15-minute page cache (NC-159) never
 * applied to the site's heaviest pages — and every visitor downloaded all of it.
 *
 * A month in which one prospectus form was filed on `BUSY_PROSPECTUS_DAYS` or more days becomes
 * one month-precision row carrying the month's total. A company raising money files on a day or
 * two, and keeps its dated rows; a note programme is routine, and a row a day is noise. Done when
 * the page is read, not at ingest, so what is already stored is covered and the database keeps
 * each day's row.
 */
export function pageFilings(events: TimelineEvent[], cik: string | null): TimelineEvent[] {
  const months = new Map<string, TimelineEvent[]>();
  const busy = new Map<string, TimelineEvent[]>();
  const kept: TimelineEvent[] = [];
  for (const e of events) {
    const prospectus = e.type === "filing" ? PROSPECTUS_ROW.exec(e.title) : null;
    if (prospectus) {
      const key = `${prospectus[3]}|${e.date.slice(0, 7)}`;
      months.set(key, [...(months.get(key) ?? []), e]);
      continue;
    }
    const monthly = e.type === "filing" ? MONTHLY_ROW.exec(e.title) : null;
    if (monthly) {
      // the label is part of the key: a company's own proxy material and a dissident's are two rows
      const key = `${monthly[3]}|${e.date.slice(0, 7)}|${monthly[2]}`;
      busy.set(key, [...(busy.get(key) ?? []), e]);
      continue;
    }
    kept.push(e);
  }
  for (const [key, rows] of busy) {
    if (rows.length < 2) {
      kept.push(...rows);
      continue;
    }
    const [form, month] = key.split("|");
    const [, name, label] = MONTHLY_ROW.exec(rows[0].title)!;
    const last = rows.reduce((d, r) => (r.date > d ? r.date : d), rows[0].date);
    kept.push({
      id: `sec-${form.replace(/\W+/g, "")}-${month}-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`,
      date: `${month}-01`,
      precision: "month",
      type: "filing",
      title: `${name}: ${label} ×${rows.length} (${form})`,
      source: "SEC EDGAR",
      url: cik
        ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=${encodeURIComponent(form)}&dateb=${last.replace(/-/g, "")}&owner=include&count=40`
        : rows[0].url,
      description: `${rows.length} filings under ${form} this month, grouped into one row for the month.`,
      sourceKey: "sec_edgar",
    });
  }
  for (const [key, rows] of months) {
    if (rows.length < BUSY_PROSPECTUS_DAYS) {
      kept.push(...rows);
      continue;
    }
    const [form, month] = key.split("|");
    const [, name] = PROSPECTUS_ROW.exec(rows[0].title)!;
    const total = rows.reduce((n, r) => n + Number(PROSPECTUS_ROW.exec(r.title)?.[2] ?? 1), 0);
    const last = rows.reduce((d, r) => (r.date > d ? r.date : d), rows[0].date);
    kept.push({
      id: `sec-prospectus-${form}-${month}`,
      date: `${month}-01`,
      precision: "month",
      type: "filing",
      title: `${name}: Prospectuses ×${total.toLocaleString("en-US")} on ${rows.length} days (${form})`,
      source: "SEC EDGAR",
      url: cik
        ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=${encodeURIComponent(form)}&dateb=${last.replace(/-/g, "")}&owner=include&count=40`
        : rows[0].url,
      description: `${total.toLocaleString("en-US")} offering documents for new securities, filed on ${rows.length} days this month under ${form}: routine issuance, grouped into one row for the month.`,
      sourceKey: "sec_edgar",
    });
  }
  return kept.sort((a, b) => a.date.localeCompare(b.date));
}
