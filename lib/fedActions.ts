import type { FetchResult, TimelineEvent } from "./types";

/**
 * The Federal Reserve Board's enforcement actions against a listed bank, from 1989 (batch 69, the
 * 2026-10-26 proposal 7, a source the owner approved).
 *
 * Carmakers and drug, device and food makers have their own regulator's actions on their pages;
 * banks had none of theirs. Wells Fargo's cease-and-desist order of 2018-02-02, the one that capped
 * its assets, was on no page; nor JPMorgan's $200 million penalty of 2013-09-18.
 *
 * Read from the two keyless files behind the Board's enforcement-action search: actions from
 * 1989-09-25 to 2018-12-26, a closed file, and those since 2019-01-18. Each row has its day, the
 * Board's words for what it did, the organisation or the person it acted against, the day it ended
 * and a press release. "Unless otherwise indicated, information on Board's website is in the public
 * domain and may be copied and distributed without permission. Please cite to the Board as the
 * source of the information" (federalreserve.gov/disclaimer.htm, read 2026-10-26).
 *
 * Only an action against the firm is the firm's: one against a person — an officer barred from
 * banking — names the bank only as where they worked. A bank reaches a page only through the
 * hand-checked map below, and a day's actions against it are one event: a cease-and-desist order and
 * the penalty that came with it are one case.
 */

const BASE = "https://www.federalreserve.gov";
export const FED_FILES = [`${BASE}/supervisionreg/ea-old.json`, `${BASE}/supervisionreg/files/ea-cms-recent.json`] as const;
// The same contact the other federal requests carry (lib/recalls.ts).
const UA = { "User-Agent": "News Charts Research marcusowens94@gmail.com" };
const TIMEOUT_MS = 30_000;

export interface FedOrg {
  /** Matches the Board's name for an organisation that is the company's (its city, where a namesake has another). */
  match: RegExp;
  /** The first day an action against it is the company's (YYYY-MM-DD). */
  from?: string;
  /** The last day it is. */
  to?: string;
  /** Why it is the company's, and why from or to that day. */
  why: string;
}

/**
 * Which organisations the Board acts against are which listed company's, by CIK. Checked by hand
 * against every row of both files (2026-10-27), never matched by name alone: "Citizens Bancshares
 * Co., Chillicothe, Missouri" is not Citizens Financial, and "Huntington Bancshares, Inc.,
 * Huntington, Texas" is not Huntington. A bank with no action yet is mapped by its own legal name
 * and its home city.
 *
 * The rule is the one recalls and news names follow (lib/fdaRecalls.ts): a company's own history
 * counts, an acquisition's past never does. SunTrust's orders of 2011 to 2019 are SunTrust's, not
 * Truist's; AmSouth's of 2004 are not Regions'; The Bank of New York's before the 2007 merger are not
 * BNY's, as its filings are not. A unit the company sold stops counting the day it left.
 */
export const FED_BANKS: Readonly<Record<number, { ticker: string; orgs: readonly FedOrg[] }>> = {
  19617: {
    ticker: "JPM",
    orgs: [{ match: /\bJ\.?\s?P\.?\s?Morgan\s?Chase\s?&\s?Co\b/i, why: "the company, J.P. Morgan Chase & Co. until 2004, on its own record since Chase Manhattan's" }],
  },
  70858: { ticker: "BAC", orgs: [{ match: /\bBank of America Corporation\b/i, why: "the company" }] },
  831001: { ticker: "C", orgs: [{ match: /\bCitigroup,? Inc\b/i, why: "the company, with its CitiFinancial unit where the Board names both" }] },
  72971: { ticker: "WFC", orgs: [{ match: /\bWells Fargo & Company\b/i, why: "the company, with Wells Fargo Financial where the Board names both" }] },
  886982: {
    ticker: "GS",
    orgs: [{ match: /\bGoldman Sachs (?:Group|Bank USA)\b/i, why: "the company and its bank, Goldman Sachs Bank USA" }],
  },
  895421: { ticker: "MS", orgs: [{ match: /^Morgan Stanley\b/i, why: "the company" }] },
  36104: { ticker: "USB", orgs: [{ match: /\bU\.?\s?S\.?\s?Bancorp/i, why: "the company, with USB Americas Holding Company where the Board names both" }] },
  713676: { ticker: "PNC", orgs: [{ match: /\bPNC Financial Services Group\b/i, why: "the company" }] },
  92230: {
    ticker: "TFC",
    orgs: [
      { match: /\bBB&T Corporation\b/i, to: "2019-12-05", why: "the company's name until it became Truist on 2019-12-06, on the same record" },
      { match: /\bTruist Financial Corporation\b/i, from: "2019-12-06", why: "the company since 2019-12-06" },
    ],
  },
  927628: { ticker: "COF", orgs: [{ match: /\bCapital One Financial Corporation\b/i, why: "the company; Discover's actions before Capital One bought it are Discover's" }] },
  1390777: {
    ticker: "BNY",
    orgs: [{ match: /\bBank of New York Mellon\b|\bBNY Mellon\b/i, from: "2007-07-01", why: "the company, formed by the merger of 2007-07-01" }],
  },
  93751: { ticker: "STT", orgs: [{ match: /\bState Street Corporation\b/i, why: "the company, with its bank where the Board names both" }] },
  4962: {
    ticker: "AXP",
    orgs: [
      { match: /\bAmerican Express Company\b/i, why: "the company, with its card unit where the Board names both" },
      {
        match: /\bAmerican Express Bank International\b/i,
        to: "2008-02-28",
        why: "a unit of American Express Bank Ltd., sold to Standard Chartered 2008-02-29 (the company's 8-K of that day)",
      },
    ],
  },
  35527: { ticker: "FITB", orgs: [{ match: /\bFifth Third Bancorp\b/i, why: "the company, with its bank where the Board names both" }] },
  1281761: { ticker: "RF", orgs: [{ match: /\bRegions (?:Bank|Financial Corporation),? Birmingham\b/i, why: "the company's bank" }] },
  36270: {
    ticker: "MTB",
    orgs: [{ match: /\bM&T Bank\b[^;]*\bBuffalo\b/i, why: "the company and its bank, Manufacturers & Traders Trust, both of Buffalo" }],
  },
  49196: {
    ticker: "HBAN",
    orgs: [{ match: /\bHuntington Bancshares,? Inc(?:orporated|\.)?,? Columbus\b/i, why: "the company, of Columbus, Ohio, not the bank of Huntington, Texas" }],
  },
  40729: { ticker: "ALLY", orgs: [{ match: /\bAlly Financial,? Inc\b/i, why: "the company, with Ally Bank and its mortgage units where the Board names them" }] },
  // no action yet: each by its own legal name and home city
  759944: { ticker: "CFG", orgs: [{ match: /\bCitizens Financial Group,? Inc\.?,? Providence\b/i, why: "the company, of Providence; every other Citizens bank in the files is another" }] },
  91576: { ticker: "KEY", orgs: [{ match: /\bKeyCorp,? Cleveland\b/i, why: "the company" }] },
  316709: { ticker: "SCHW", orgs: [{ match: /\bCharles Schwab Corporation\b/i, why: "the company" }] },
  1601712: { ticker: "SYF", orgs: [{ match: /\bSynchrony Financial,? Stamford\b/i, why: "the company" }] },
  73124: { ticker: "NTRS", orgs: [{ match: /\bNorthern Trust Corporation,? Chicago\b/i, why: "the company" }] },
  109380: { ticker: "ZION", orgs: [{ match: /\bZions Bancorporation\b[^;]*\bSalt Lake City\b/i, why: "the company" }] },
  36966: { ticker: "FHN", orgs: [{ match: /\bFirst Horizon (?:Corporation|National Corporation)\b[^;]*\bMemphis\b/i, why: "the company" }] },
  // The foreign banks with a page here (batch 74, the 2026-10-28 proposal 2): the bank itself, its
  // US holding company and branches, and a US bank it bought from the day it did. Checked by hand
  // against every row of both files (2026-10-30).
  1089113: {
    ticker: "HSBC",
    orgs: [
      { match: /\bHSBC (?:Holdings|North America Holdings|USA,? Inc|Bank USA)\b/i, why: "the company, its US holding company and its US bank, Marine Midland until 1999" },
      {
        match: /\bHSBC Finance Corporation\b|\bHousehold International\b/i,
        from: "2003-03-28",
        why: "Household International, HSBC Finance from 2004, bought 2003-03-28 (\"the date we were acquired by HSBC\", HSBC's 6-K of 2009-08-03)",
      },
    ],
  },
  1159508: {
    ticker: "DB",
    orgs: [
      { match: /\bDeutsche Bank (?:AG|Aktiengesellschaft)\b|\bDB USA Corporation\b/i, why: "the company, its New York branch and its US holding company" },
      {
        match: /\bDeutsche Bank Trust (?:Company Americas|Corporation)\b|\bBankers Trust (?:Company|Corporation|New York Corporation)\b[^;]*\bNew York\b/i,
        from: "1999-06-04",
        why: "Bankers Trust of New York, Deutsche Bank Trust from 2002, bought 1999-06-04 (its 20-F filed 2003-03-27): its agreement of 1994 is not Deutsche Bank's, nor the Des Moines Bankers Trust's of 1991",
      },
    ],
  },
  891478: {
    ticker: "SAN",
    orgs: [
      { match: /^Banco Santander(?:,? S\.A\.)?,? (?:Spain|Madrid|Santander|Boadilla)/i, why: "the company" },
      {
        match: /\bSantander Holdings USA\b|\bSovereign Bancorp\b/i,
        from: "2009-01-30",
        why: "Sovereign Bancorp, Santander Holdings USA from 2010, wholly the company's from 2009-01-30 (its 6-K of that day); it held a quarter before",
      },
    ],
  },
  1610520: {
    ticker: "UBS",
    orgs: [
      { match: /^UBS,? (?:Group )?AG\b/i, why: "the company and its bank, UBS AG, which was the listed company until UBS Group AG took its place in the exchange offer of November 2014 (its 20-F filed 2015-03-13)" },
      {
        match: /^Credit Suisse\b/i,
        from: "2023-06-12",
        why: "Credit Suisse, bought 2023-06-12 (Credit Suisse AG's 6-K of 2023-09-29): its actions of 2009, 2014 and 2020 are Credit Suisse's",
      },
    ],
  },
  844150: {
    ticker: "NWG",
    orgs: [{ match: /\bRoyal Bank of Scotland (?:Group )?plc\b|\bNatWest (?:Group|Markets)\b/i, why: "the company, The Royal Bank of Scotland Group plc until 2020-07-22 (its 6-K of that day), on the same record" }],
  },
  312069: { ticker: "BCS", orgs: [{ match: /\bBarclays (?:Bank )?PLC\b/i, why: "the company and its bank, Barclays Bank PLC, with its New York branch" }] },
  1022837: {
    ticker: "SMFG",
    orgs: [{ match: /\bSumitomo Mitsui (?:Banking Corporation|Financial Group)\b/i, why: "the company and its bank, whose holding company it became on 2002-12-02 (its 20-F filed 2011-07-29)" }],
  },
  67088: {
    ticker: "MUFG",
    orgs: [
      { match: /\bMitsubishi UFJ Financial Group\b|\bBank of Tokyo-Mitsubishi\b|\bMUFG (?:Bank|Americas)\b/i, why: "the company and its bank, The Bank of Tokyo-Mitsubishi (UFJ)" },
      {
        match: /\bUnion Bank of California\b|\bMUFG Union Bank\b/i,
        to: "2022-11-30",
        why: "UnionBanCal's bank, 62.1% the company's on 2004-06-30 (its 20-F filed 2004-09-28), wholly from 2008, sold to U.S. Bancorp 2022-12-01 (its 6-K of 2022-12-02)",
      },
    ],
  },
  842180: {
    ticker: "BBVA",
    orgs: [
      { match: /\bBanco Bilbao Vizcaya\b/i, why: "the company, Banco Bilbao Vizcaya until it merged with Argentaria in 1999, with its Miami agency and New York branch" },
      {
        // Birmingham's: the city keeps out a namesake elsewhere
        match: /\bCompass Bank\b[^;]*\bBirmingham\b/i,
        from: "2007-09-07",
        to: "2021-05-31",
        why: "Compass Bancshares' bank, bought 2007-09-07 (its 6-K filed that day), sold as BBVA USA to PNC 2021-06-01 (its 6-K filed that day); added after the 2026-10-30 audit's finding 3",
      },
    ],
  },
  1000275: {
    ticker: "RY",
    orgs: [
      { match: /\bRoyal Bank of Canada\b/i, why: "the company" },
      {
        match: /\bRBC Centura Bank\b|\bRBC Bank \(USA\)/i,
        from: "2001-06-05",
        to: "2012-03-01",
        why: "Centura Banks, bought 2001-06-05 (its 40-F filed 2002-12-27), sold to PNC 2012-03-02 (its 40-F filed 2012-11-29)",
      },
      {
        match: /\bCity National (?:Bank|Corporation),? (?:Los Angeles|Beverly Hills)\b/i,
        from: "2015-11-02",
        why: "City National of Los Angeles, bought 2015-11-02 (its 40-F filed 2023-11-30); Newark's City National Bancshares is another",
      },
    ],
  },
  947263: {
    ticker: "TD",
    orgs: [{ match: /\bToronto-Dominion Bank\b|\bTD Group U\.?S\.? Holdings\b|\bTD Bank U\.?S\.? Holding Company\b|\bTD Bank, N\.?A\./i, why: "the company and its US holding companies; Capital Commerce Bancorp and Tennessee Commerce Bancorp are not its Commerce Bancorp" }],
  },
  927971: { ticker: "BMO", orgs: [{ match: /\bBank of Montreal\b|\bBMO (?:Financial Corp|Harris Bank)\b/i, why: "the company, its US holding company and its Chicago branch" }] },
  9631: { ticker: "BNS", orgs: [{ match: /\bBank of Nova Scotia\b/i, why: "the company, with its New York agency" }] },
  1045520: { ticker: "CM", orgs: [{ match: /\bCanadian Imperial Bank of Commerce\b/i, why: "the company" }] },
};

/** The organisations that are the company's, or null for a company that is not a mapped bank. */
export function fedBanksFor(cik: number | string): readonly FedOrg[] | null {
  return FED_BANKS[Number(cik)]?.orgs ?? null;
}

/** One row of the Board's files, as it gives it. */
export interface FedRow {
  id?: string | number;
  /** the day it took effect */
  edt?: string;
  /** the day it ended; 1950-01-01 for not ended */
  tdt?: string;
  /** "Cease and Desist Order", "Civil Money Penalty, $342,000,000" */
  type?: string;
  /** the organisation acted against, with its city */
  bkorg?: string;
  /** a person acted against, and where they worked */
  person?: string;
  porg?: string;
  url?: string;
}

const clean = (s?: string) =>
  (s ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&rsquo;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const isDay = (s?: string) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? "");
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const pad = (n: number) => String(n).padStart(2, "0");

/** "4/13/2011" or "February 2, 2018" as "2011-04-13"; anything else as given. */
function isoDay(text: string): string {
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim());
  if (us) return `${us[3]}-${pad(Number(us[1]))}-${pad(Number(us[2]))}`;
  const long = /^([A-Za-z]+) (\d{1,2}), (\d{4})$/.exec(text.trim());
  const month = long ? MONTHS.indexOf(long[1].toLowerCase()) : -1;
  return long && month >= 0 ? `${long[3]}-${pad(month + 1)}-${pad(Number(long[2]))}` : text.trim();
}

/** A press release's address, or null for a row whose link is not one (the oldest read "DNE"). */
function releaseUrl(url?: string): string | null {
  if (!url) return null;
  if (/^https:\/\/www\.federalreserve\.gov\//.test(url)) return url;
  return url.startsWith("/") ? `${BASE}${url}` : null;
}

/** "$342 million", "$54.75 million", "$90,000". */
export function money(text: string): string | null {
  const m = /\$\s?([\d,]+(?:\.\d+)?)\s*(million|billion)?/i.exec(text);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, "")) * (m[2]?.toLowerCase() === "billion" ? 1e9 : m[2] ? 1e6 : 1);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2).replace(/\.?0+$/, "")} billion`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2).replace(/\.?0+$/, "")} million`;
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

/**
 * What the Board did, in the row's words: "Civil Money Penalty, $100,000,000, and Cease and Desist
 * Order" → ["$100 million civil money penalty", "cease-and-desist order"].
 */
export function actionPhrases(type: string): string[] {
  const t = clean(type);
  const out: string[] = [];
  const amend = /Amendment to (.+?) Order to Cease and Desist/i.exec(t);
  if (amend) return [`amendment to the cease-and-desist order of ${isoDay(amend[1])}`];
  if (/Civil Money Penalty/i.test(t)) {
    const amount = money(t);
    out.push(amount ? `${amount} civil money penalty` : "civil money penalty");
  }
  if (/Cease and Desist/i.test(t)) out.push("cease-and-desist order");
  if (/Written Agreement/i.test(t)) out.push("written agreement");
  if (/Consent Order/i.test(t)) out.push("consent order");
  if (/Prompt Corrective Action/i.test(t)) out.push("prompt corrective action directive");
  if (/Prohibition/i.test(t)) out.push("prohibition order");
  return out.length ? out : [t.toLowerCase()];
}

const NUMBER: Record<number, string> = { 2: "two", 3: "three", 4: "four" };

const owns = (org: FedOrg, name: string, day: string) =>
  org.match.test(name) && (!org.from || day >= org.from) && (!org.to || day <= org.to);

/**
 * Rows → the company's events: its actions only, a day's as one event, titled with what the Board
 * did ("Federal Reserve: cease-and-desist order and $342 million civil money penalty").
 */
export function fedActionEvents(rows: readonly FedRow[], cik: number | string): TimelineEvent[] {
  const orgs = fedBanksFor(cik);
  if (!orgs) return [];
  const byDay = new Map<string, FedRow[]>();
  for (const r of rows) {
    const day = r.edt ?? "";
    const name = clean(r.bkorg);
    // an action against a person names the bank only as where they worked
    if (!isDay(day) || !name || r.person || !orgs.some((o) => owns(o, name, day))) continue;
    byDay.set(day, [...(byDay.get(day) ?? []), r]);
  }
  return [...byDay.entries()].map(([day, actions]) => {
    actions.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    // two orders of one day are two orders: JPMorgan's of 2013-01-14
    const counts = new Map<string, number>();
    for (const p of actions.flatMap((a) => actionPhrases(a.type ?? ""))) counts.set(p, (counts.get(p) ?? 0) + 1);
    const what = [...counts].map(([p, n]) => (n > 1 && !/penalty/.test(p) ? `${NUMBER[n] ?? n} ${p}s` : p)).join(" and ");
    // …and each says when it ended, where it has
    const ends = new Map<string, string[]>();
    for (const a of actions) {
      if (!isDay(a.tdt) || a.tdt! <= day) continue;
      const kind = actionPhrases(a.type ?? "").find((p) => !/penalty/.test(p)) ?? "order";
      ends.set(kind, [...(ends.get(kind) ?? []), a.tdt!].sort());
    }
    const ended = [...ends].map(([kind, days]) =>
      days.length > 1 ? `The ${kind}s ended ${days.slice(0, -1).join(", ")} and ${days.at(-1)}.` : `The ${kind} ended ${days[0]}.`
    );
    // one organisation, however the day's rows spell it ("JPMORGAN CHASE & CO.New York" and "… CO. New York")
    const spelled = new Map<string, string>();
    for (const a of actions) {
      const name = clean(a.bkorg);
      const key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!spelled.has(key)) spelled.set(key, name);
    }
    const named = [...spelled.values()].join("; ");
    const url = actions.map((a) => releaseUrl(a.url)).find((u) => u);
    const basis = `fed-ea:${Number(cik)}:${day}`;
    return {
      id: `fed-ea-${Number(cik)}-${day}`,
      date: day,
      type: "regulation" as const,
      title: `Federal Reserve: ${what.charAt(0).toUpperCase()}${what.slice(1)}`,
      description: [`Against ${named}, as the Board names it.`, ...ended].join(" "),
      source: "Federal Reserve Board",
      url: url ?? undefined,
      sourceKey: "fed_enforcement" as const,
      externalId: basis,
      dedupBasis: basis,
    };
  });
}

/** Both files, read once a process: every mapped bank's ingest reads the same two. */
const files = new Map<string, Promise<FedRow[]>>();

async function readFile(url: string): Promise<FedRow[]> {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`the Board answered ${res.status} for ${url}`);
  // the files begin with a byte-order mark
  const json = JSON.parse((await res.text()).replace(/^﻿/, "")) as { eaitems?: unknown };
  if (!Array.isArray(json.eaitems)) throw new Error(`no actions listed in ${url}`);
  return json.eaitems as FedRow[];
}

function cachedFile(url: string): Promise<FedRow[]> {
  let p = files.get(url);
  if (!p) {
    p = readFile(url);
    files.set(url, p);
    // a failure is not kept: the next bank's ingest asks again
    p.catch(() => files.delete(url));
  }
  return p;
}

/** A company's Federal Reserve enforcement actions, or why there are none. */
export async function fetchFedActions(cik: number | string): Promise<FetchResult> {
  if (!fedBanksFor(cik)) return { events: [], outcome: "empty", detail: "not a bank the Board's actions are mapped to" };
  try {
    const rows = (await Promise.all(FED_FILES.map(cachedFile))).flat();
    const events = fedActionEvents(rows, cik);
    return { events, outcome: events.length ? "ok" : "empty", httpStatus: 200 };
  } catch (err) {
    return { events: [], outcome: "error", detail: String(err).slice(0, 200) };
  }
}
