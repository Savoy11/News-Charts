import { captionParty, chargedParties } from "./secCases";
import type { TimelineEvent } from "./types";

/**
 * The Consumer Financial Protection Bureau's enforcement actions, from its first of 2012-07-17
 * (batch 89, the 2026-11-02 proposal 5, a source the owner approved on 2026-11-02): the Bureau's
 * orders and suits against the banks, card issuers, lenders, servicers and debt buyers whose
 * consumer business it regulates — which neither the Board's actions (holding companies) nor the
 * SEC's cases (broker-dealers) reach.
 *
 * Read from the Bureau's list (www.consumerfinance.gov/enforcement/actions/?page=N, 25 a page,
 * newest filed first, 386 actions on 16 pages, measured 2026-11-05): every page once a month, and
 * its first page — further pages only while each holds no action already kept — once a day
 * (lib/ingest/cfpbWalk.ts). Not the Bureau's feed (/enforcement/actions/feed/), which the proposal
 * named: its day is when an action's page was last changed, and 2 of its 25 items were dated so on
 * 2026-11-05 — Apple's order of 2024-10-23 as 2025-09-22, Capital One's suit of 2025-01-14 as
 * 2025-01-07 — where the list's is the day filed, the day each summary itself gives.
 *
 * Each action's title names its respondents ("JPMorgan Chase Bank, N.A.; and Chase Bank USA,
 * N.A."), so a company keeps an action when the title names it as a case caption names a party
 * (`captionParty`): by its name or its legal name with legal words after it, or a unit the release
 * rules' map gives it (lib/releaseNames.ts) — the Bureau charges a bank, not its holding company
 * ("Capital One Bank", "American Express Centurion Bank"). One event a company a day.
 *
 * Licence: "Information created by the CFPB is in the public domain and you may reproduce,
 * publish, or otherwise use it without the Bureau's permission. Please consider appropriate citation
 * to the Bureau as the source." (consumerfinance.gov/privacy/website-privacy-policy/, "Legal
 * notices", read 2026-11-02 and again 2026-11-05). No key.
 */
const BASE = "https://www.consumerfinance.gov";
export const CFPB_LIST = `${BASE}/enforcement/actions/`;
export const CFPB_PAGE_SIZE = 25;
/** The Bureau's first action. */
export const CFPB_FROM = "2012-07-17";
const UA = { "User-Agent": "News Charts Research" };
const TIMEOUT_MS = 60_000;

export interface CfpbAction {
  /** the day filed, as the Bureau dates it */
  day: string;
  /** the respondents, as the Bureau names them */
  title: string;
  /** the action's page, "/enforcement/actions/wells-fargo-bank-na-2016/" */
  path: string;
  /** the Bureau's one-sentence summary */
  description: string;
}

const text = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&rsquo;|’/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();

const ARTICLE = /<article class="o-post-preview"[\s\S]*?<\/article>/g;
const FILED = /<time datetime="(\d{4}-\d{2}-\d{2})/;
const TITLE = /o-post-preview__title">\s*<a href="([^"]+)">([\s\S]*?)<\/a>/;
const DESCRIPTION = /o-post-preview__description">([\s\S]*?)<\/div>/;
const TOTAL = /([\d,]+)\s+filtered results/;

/** A list page's actions, and the list's count of them all. */
export function parseCfpbList(html: string): { actions: CfpbAction[]; total?: number } {
  const actions: CfpbAction[] = [];
  for (const [a] of html.matchAll(ARTICLE)) {
    const day = FILED.exec(a)?.[1];
    const t = TITLE.exec(a);
    if (!day || !t) continue;
    actions.push({ day, path: t[1], title: text(t[2]), description: text(DESCRIPTION.exec(a)?.[1] ?? "") });
  }
  const total = TOTAL.exec(html)?.[1];
  return { actions, ...(total ? { total: Number(total.replace(/,/g, "")) } : {}) };
}

export interface CfpbAnswer {
  actions: CfpbAction[];
  total?: number;
  outcome: "ok" | "throttled" | "error";
  httpStatus?: number;
  detail?: string;
}

async function get(url: string): Promise<{ body?: string; outcome: CfpbAnswer["outcome"]; httpStatus?: number; detail?: string }> {
  try {
    const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.status === 429 || res.status === 503) return { outcome: "throttled", httpStatus: res.status };
    if (!res.ok) return { outcome: "error", httpStatus: res.status, detail: `HTTP ${res.status}` };
    return { body: await res.text(), outcome: "ok", httpStatus: res.status };
  } catch (err) {
    return { outcome: "error", detail: String(err).slice(0, 200) };
  }
}

/**
 * One page of the list, the first page 1, and the list's count of every action. Past the last page
 * the Bureau serves the last page again.
 */
export async function fetchCfpbPage(page: number): Promise<CfpbAnswer> {
  const got = await get(`${CFPB_LIST}?page=${page}`);
  if (got.outcome !== "ok") return { actions: [], outcome: got.outcome, httpStatus: got.httpStatus, detail: got.detail };
  const parsed = parseCfpbList(got.body!);
  if (!parsed.actions.length) return { actions: [], outcome: "error", httpStatus: got.httpStatus, detail: `page ${page} held no action` };
  return { ...parsed, outcome: "ok", httpStatus: got.httpStatus };
}

/**
 * The actions a name of another company's took, read by hand on 2026-11-05 among the 87 company
 * days the 386 actions gave, by CIK: the rule cannot tell them from the company. Flagstar Bank,
 * F.S.B.'s order of 2014-09-29 needs no row: FLG's record, which took the Flagstar name after buying
 * the bank in 2022, is "FLAGSTAR BANK, NATIONAL ASSOCIATION", and the rule reads "National
 * Association" as part of that name, so the F.S.B. is another party (check:cfpb holds it there).
 */
export const NOT_THE_COMPANY: Readonly<Record<number, { ticker: string; title: RegExp; why: string }[]>> = {
  12659: [
    {
      ticker: "HRB",
      title: /\bformerly d\/b\/a H&R Block\b/,
      why: "J Thomas Development of NM, Inc., which once traded under the H&R Block name, sued with the Navajo Nation in 2015 over tax-refund loans; not H&R Block, Inc.",
    },
  ],
};

/**
 * A title as the caption rule reads it: the Bureau's "dba" and "d/ba/" ("Cellco Partnership d/ba/
 * Verizon Wireless", 2015) are its "d/b/a", which parts one name of a respondent from another.
 */
export const respondents = (title: string) => title.replace(/\bd\/?b\/?a\/?(?=\s)/gi, "d/b/a");

const alnum = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * The actions naming the company as a respondent, as timeline events, newest first. `namesIn(year)`
 * gives the names it had that year, `namesOn(day)` the units it then owned (`releaseNamesOn`), and
 * an action from before `from`, its first price, is not its. A day's actions on one company are one
 * event — American Express's three of 2012-10-01, one a unit — titled by its own party.
 */
export function cfpbEvents(
  actions: readonly CfpbAction[],
  namesIn: (year: number) => string[],
  { cik, from = "", namesOn }: { cik: number | string; from?: string; namesOn?: (day: string) => string[] },
): TimelineEvent[] {
  const byYear = new Map<number, string[]>();
  const names = (year: number) => byYear.get(year) ?? byYear.set(year, namesIn(year)).get(year)!;
  const byDay = new Map<string, { a: CfpbAction; party: string }[]>();
  for (const a of actions) {
    if (a.day < from || !a.path.startsWith("/enforcement/actions/")) continue;
    if (NOT_THE_COMPANY[Number(cik)]?.some((n) => n.title.test(a.title))) continue;
    const held = [...names(Number(a.day.slice(0, 4))), ...(namesOn?.(a.day) ?? [])];
    // a name can only be a respondent where the title's letters and digits hold its own: most
    // actions are read no further
    const letters = alnum(a.title);
    if (!held.some((n) => alnum(n).length >= 2 && letters.includes(alnum(n)))) continue;
    const party = captionParty(respondents(a.title), held);
    if (!party) continue;
    (byDay.get(a.day) ?? byDay.set(a.day, []).get(a.day)!).push({ a, party });
  }
  return [...byDay.entries()]
    .sort(([x], [y]) => y.localeCompare(x))
    .map(([day, rows]) => {
      // by path, so a day's event is the same whatever order the actions came in
      rows.sort((x, y) => x.a.path.localeCompare(y.a.path));
      const { a, party } = rows[0];
      const others = rows.length > 1 || chargedParties(respondents(a.title)).replace(/[.,;\s]+$/, "") !== party.replace(/[.,;\s]+$/, "");
      return {
        id: `cfpb-${Number(cik)}-${day}`,
        date: day,
        type: "regulation" as const,
        title: `CFPB enforcement action: ${party}${others ? " and others" : ""}`,
        description: rows.map((r) => `${r.a.title}: ${r.a.description}`).join(" · ").slice(0, 600),
        source: "Consumer Financial Protection Bureau",
        url: `${BASE}${a.path}`,
        sourceKey: "cfpb" as const,
        externalId: a.path,
        // the company's one event a day: actions learned later the same day change its description only
        dedupBasis: `cfpb:${Number(cik)}@${day}`,
      };
    });
}
