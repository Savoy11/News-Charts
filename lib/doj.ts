import { companyNames, longerListedNameIn } from "./frCompany";
import type { FetchResult, TimelineEvent } from "./types";

/**
 * Justice Department press releases in which a listed company is a party — a settlement, a plea,
 * a lawsuit against it, an antitrust case over its merger — from 2009 on (batch 32, the second
 * candidate in `docs/proposals/2026-10-22-news-sources.md`).
 *
 * Read from justice.gov's keyless JSON API. Public domain: "Unless otherwise indicated,
 * information on Department of Justice websites is in the public domain and may be copied and
 * distributed without permission" (justice.gov/legalpolicies). What is used is the release's
 * title, date, teaser and link — never its photos, which may be someone else's.
 */

const API = "https://www.justice.gov/api/v1/press_releases.json";
const UA = { "User-Agent": "News Charts Research marcusowens94@gmail.com" };
const TIMEOUT_MS = 20_000;
const PAGE_SIZE = 50;
/**
 * The title filter matches anywhere in the title ("Intel" finds "Intelligence"), so a common word
 * can return thousands. Apple, the most-named company measured (2026-10-22), had 152 releases —
 * four pages; ten keeps the newest 500 of a word like "Target" without walking all of them.
 */
const MAX_PAGES = 10;
const PAGE_GAP_MS = 800;

/**
 * Words that may follow a company's name and still be the company: "Wells Fargo Bank, N.A.",
 * "JPMorgan Chase & Co.", "ExxonMobil Pipeline Company", "Wells Fargo Dealer Services".
 */
const DESIGNATOR = String.raw`(?:(?:,?\s+|\s*&\s*)(?:Inc\.?|Incorporated|Corp\.?|Corporation|Company|Co\.?|LLC|L\.L\.C\.|L\.P\.|Ltd\.?|Limited|plc|N\.\s?A\.|USA|U\.S\.A?\.?|America|Holdings?|Group|Bank|Securities|Financial|Advisors|Mortgage|Home|Loans|Dealer|Services|Pipeline|Motor|Motors|Communications|Technologies|Laboratories|Health|Healthcare|Aerospace))*`;

/** A unit named after the company: "Johnson & Johnson Subsidiary Acclarent Inc. Pays". */
const UNIT = String.raw`(?:\s+(?:Subsidiary|Unit|Affiliate)(?:\s+[A-Z][\w.&'’-]*){1,2}${DESIGNATOR})?`;

/** The verbs of a release whose subject is a company: it pays, pleads, settles, is charged. */
const PARTY_VERB = String.raw`(?:Agrees?|Pays|Paid|Pleads?|Pleaded|Settles?|Settled|Resolves?|Resolved|Charged|Indicted|Convicted|Sentenced|Fined|Admits?|Enters?|Accepts?|Reach(?:es)?|Ordered|Sued|Consents?|Signs?|Abandons?|(?:Will\s+|To\s+)(?:Pay|Resolve|Settle|Plead|Forfeit|Divest|Restore|Reduce|Improve|Implement|Install|Upgrade|Overhaul|Spend|Make|Provide|Compensate|Refund))\b`;

/**
 * The same after two subjects — "Wyeth and Pfizer Agree", "Raytheon Technologies and Subsidiary
 * Pay". A bare "Pay" after one name is a product: "Apple Pay Fraud Conspiracy".
 */
const PLURAL_VERB = String.raw`(?:${PARTY_VERB}|Pay\b)`;

/**
 * What a release does *to* a company, said just before its name: "Lawsuit Against Walmart",
 * "Settles With Microsoft", "Requires General Electric to Divest", "U.S. v. JPMorgan Chase Bank",
 * "Hungary Subsidiary of Microsoft Corporation Agrees".
 */
const ACTION = String.raw`(?:(?:Settlements?|Agreements?|Consent\s+Decree|Lawsuit|Suits?|Complaint|Charges|Claims|Case|Resolution|Investigations?|Action|Settles?)\s+(?:Filed\s+)?(?:With|Against|Of)|Sues|Sue|Indicts|Requires|Blocks?|Challenges?|Acquisition\s+of|Purchase\s+of|Merger\s+(?:With|of)|(?:Subsidiary|Subsidiaries|Unit|Affiliate|Division)\s+of|v\.|vs\.)`;

/**
 * Other companies named alongside it — "Settlements with CarMax, Axis Analytics, Capital One Bank
 * and Walmart" — or one word before it, "Sues Monopolist Google". Kept honest by FOLLOWS.
 */
const ALONGSIDE = String.raw`(?:(?:[A-Z][\w.&'’-]*\s+){0,3}[A-Z][\w.&'’-]*(?:,\s+|,?\s+and\s+)){0,5}(?:the\s+)?(?:[A-Z][a-z]+\s+)?`;

/**
 * What may come straight after a company named as the object, so that "Charges Against Violent
 * Tesla Arsonists", "Settles with Apple Tree Children's Center" and "Acquisition of Apple
 * Products" stay out: the end, punctuation, a possessive, a joining word, or a verb.
 */
const FOLLOWS = String.raw`(?=\s*$|\s*[,.;:!?()/–—-]|['’]s\b|\s+(?:for|to|over|in|on|alleging|and|resulting|regarding|concerning|relating|related|that|after|from|with|by|at|of|under|as|formerly|involving|arising|stemming|amid|following|because|who|which)\b|\s+[A-Za-z]+ing\b|\s+${PARTY_VERB})`;

/** A merger or acquisition the company is part of: "Google Inc.'s Acquisition of", "AT&T's Abandonment". */
const DEAL = String.raw`['’]s\s+(?:Proposed\s+)?(?:Acquisitions?|Merger|Purchase|Sale|Joint\s+Venture|Abandonment)\b`;

/**
 * Buying from the company — "Stop Electrolux from Buying General Electric's Appliance Business",
 * "Liberty Latin America To Acquire AT&T's Telecommunications Operations".
 */
const BOUGHT = String.raw`['’]s\s+(?:[\w&-]+\s+){0,3}(?:Business|Businesses|Operations|Unit|Division|Assets)\b`;

/**
 * Words that, just before a company's name, make it a victim, a workplace or a place rather than
 * the one acting: "Who Defrauded Amazon Sentenced", "Executive at Facebook Pleads", "Threatened
 * Police on Facebook Sentenced", "Stole … from The Home Depot Sentenced", "Employee of the
 * Coca-Cola Company Sentenced".
 */
const NOT_SUBJECT = String.raw`(?<!\b(?:at|on|from|of|with|in|into|via|through|against|for|to|who|stole|steal|rob|defraud|[A-Za-z]+ed|[A-Za-z]+ing)\s+(?:the\s+)?)`;

/** Not inside a word, a hyphenated word or an amount: "$5.3M to Settle" is not 3M settling. */
const START = String.raw`(?<![\w$&.-])`;

/**
 * Where a one-word name may stand as the subject: opening the title or a clause, after "The", a
 * trade ("Drug Maker Pfizer Agrees") or another party ("Kohl's and Walmart Agree"). Anywhere else
 * a one-word name is too often a word — measured on 40 companies not used to write these rules
 * (2026-10-22), "Visa" returned "Israeli National in U.S. on Work VISA Sentenced" and "Woman That
 * Overstayed Her Visa Pleads Guilty".
 */
const CLAUSE_START = String.raw`(?:^|[,;:]\s*|\b(?:After|As|When|While|Because)\s+)(?:The\s+)?(?:(?:[A-Z][\w-]*\s+){0,2}(?:Maker|Manufacturer|Company|Contractor|Giant|Firm|Retailer|Insurer|Lender|Carrier|Distributor|Wholesaler|Producer|Operator|Provider|Chain)\s+|[A-Z][\w.&'’-]*(?:\s+[A-Z][\w.&'’-]*)?\s+and\s+)?`;

/** A release about a trader in a deal, not the deal: "Insider Trading In The Walt Disney Company's Acquisition". */
const TRADER = /\b(?:insider\s+trading|securities\s+fraud|trading\s+ahead|man|woman|men|women)\b/i;

const escapeName = (name: string) =>
  name
    .trim()
    .split(/[\s-]+/)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(String.raw`[\s-]+`);

/**
 * Whether the release is about the company as a party, not merely mentioning it.
 *
 * Measured on 912 release titles naming 41 large companies (2026-10-22): most were about someone
 * else — "Former Goldman Sachs Investment Banker Convicted", "Convicted Bank Robber Sentenced … for
 * Robbing Bank of America", "Posting Violent Threats on Facebook", "Scheme to Defraud Apple Inc.".
 * A company is a party when its name is the subject of the release's verb ("Goldman Sachs Agrees to
 * Pay", "Drug Maker Pfizer Agrees"), the object of an action against it ("Files Nationwide Lawsuit
 * Against Walmart Inc."), or the owner of a deal ("Google's Acquisition of"). A title that opens
 * with "Former", or names the company after a "who", is about a person; a one-word name is the
 * subject only where a clause starts (CLAUSE_START). As in the Federal Register rule, a longer
 * listed company's name owns the mention: "Portland General Electric" is not GE.
 */
export function releaseNamesParty(title: string, names: readonly string[]): boolean {
  const t = title.replace(/\s+/g, " ").trim();
  const aboutAPerson = /^(?:Former|Ex-)\b/i.test(t);
  for (const name of names) {
    if (name.trim().length < 2 || longerListedNameIn(t, name)) continue;
    const n = escapeName(name);
    const lead = /\s/.test(name.trim()) ? `${NOT_SUBJECT}${START}` : CLAUSE_START;
    const subject = new RegExp(
      String.raw`${lead}${n}${DESIGNATOR}${UNIT}(?:,?\s+${PARTY_VERB}|\s+and(?:\s+[A-Z][\w.&'’-]*){1,4}\s+${PLURAL_VERB})`,
      "i",
    );
    const owner = String.raw`,\s+an?\s+${n}${DESIGNATOR}\s*(?:Company|Subsidiary|Unit|Affiliate|Business)\b`;
    const object = new RegExp(String.raw`(?:\b${ACTION}\s+${ALONGSIDE}${n}${DESIGNATOR}${FOLLOWS}|${owner})`, "i");
    const deal = new RegExp(String.raw`(?:${START}${n}${DESIGNATOR}${DEAL}|\b(?:Buy|Buying|Acquire|Acquiring)\s+${n}${DESIGNATOR}${BOUGHT})`, "i");
    const s = subject.exec(t);
    if (s && !aboutAPerson && !/\bwho\b/i.test(t.slice(0, s.index))) return true;
    if (object.test(t) || (deal.test(t) && !aboutAPerson && !TRADER.test(t))) return true;
  }
  return false;
}

/** One release as the API returns it — every field a string, the date in Unix seconds. */
export interface DojRelease {
  title?: string;
  date?: string | number;
  url?: string;
  teaser?: string;
  uuid?: string;
  component?: { name?: string }[];
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** HTML to plain text: titles carry "<br />" line breaks, "&amp;" and "&nbsp;"; teasers carry "<p>". */
export const plainText = (html: string): string =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
      e[0] === "#"
        ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
        : (ENTITIES[e.toLowerCase()] ?? m),
    )
    .replace(/\s+/g, " ")
    .trim();

/** The release's day: the API gives noon UTC on it, in seconds. */
export const releaseDate = (seconds: string | number | undefined): string | null => {
  const n = Number(seconds);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString().slice(0, 10) : null;
};

/**
 * The names to ask the API for: the company's names, minus any that contain another — the filter
 * matches anywhere in the title, so "Facebook" already finds "TheFacebook" and "Amazon" finds
 * "AMAZON COM".
 */
export function dojQueryNames(names: readonly string[]): string[] {
  const kept: string[] = [];
  const byLength = names.map((n) => n.trim()).filter((n) => n.length >= 2);
  for (const n of [...byLength].sort((a, b) => a.length - b.length)) {
    if (!kept.some((k) => n.toLowerCase().includes(k.toLowerCase()))) kept.push(n);
  }
  return byLength.filter((n) => kept.includes(n));
}

/**
 * Which copy of a same-day story to keep. The Department and a U.S. Attorney's office often post
 * the same settlement — McKesson's of 2017-01-17 eight times — so a company gets one release a
 * day: the national office's (`/opa/`) first, then one not written in capitals, then the shortest.
 */
function better(a: { title: string; url: string }, b: { title: string; url: string }): boolean {
  const rank = (r: { title: string; url: string }) => [
    r.url.includes("/opa/") ? 0 : 1,
    r.title === r.title.toUpperCase() || /^[a-z]/.test(r.title.split(" ")[1] ?? "") ? 1 : 0,
    r.title.length,
  ];
  const [x, y] = [rank(a), rank(b)];
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i];
  return false;
}

/** At most this many releases a company, newest first — a ceiling, not a target. */
export const DOJ_CAP = 60;

/** The releases naming the company as a party, as timeline events — one a day, newest first. */
export function dojEvents(releases: readonly DojRelease[], names: readonly string[]): TimelineEvent[] {
  const byDay = new Map<string, { title: string; url: string; r: DojRelease; date: string }>();
  for (const r of releases) {
    const title = plainText(r.title ?? "");
    const date = releaseDate(r.date);
    if (!title || !date || !r.url || !/^https:\/\/www\.justice\.gov\//.test(r.url)) continue;
    if (!releaseNamesParty(title, names)) continue;
    const cand = { title, url: r.url, r, date };
    const held = byDay.get(date);
    if (!held || better(cand, held)) byDay.set(date, cand);
  }
  return [...byDay.values()]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, DOJ_CAP)
    .map(({ title, url, r, date }) => {
      const path = new URL(url).pathname;
      const teaser = plainText(r.teaser ?? "");
      const office = r.component?.[0]?.name?.trim();
      // The release's own id, not its address: the Department moves a past administration's
      // releases from /opa/pr/ to /archives/opa/pr/, which would make an address a new event.
      const key = r.uuid || path;
      return {
        id: `doj-${r.uuid || path.split("/").pop()}`,
        date,
        type: "regulation" as const,
        title,
        source: office ? `Justice Department · ${office}` : "Justice Department",
        url,
        description: teaser ? (teaser.length > 400 ? `${teaser.slice(0, 397).replace(/\s\S*$/, "")}…` : teaser) : undefined,
        sourceKey: "doj_press" as const,
        externalId: key,
        dedupBasis: `doj:${key}`,
      };
    });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The company's Justice Department releases: every release whose title contains one of its names,
 * newest first, kept only when the title makes it a party (`releaseNamesParty`).
 */
export async function fetchJusticeReleases(edgarName: string, alsoKnownAs: string[] = []): Promise<FetchResult> {
  const names = companyNames(edgarName, alsoKnownAs);
  const releases: DojRelease[] = [];
  let first = true;
  try {
    for (const name of dojQueryNames(names)) {
      for (let page = 0; page < MAX_PAGES; page++) {
        if (!first) await sleep(PAGE_GAP_MS);
        first = false;
        const params = new URLSearchParams({
          pagesize: String(PAGE_SIZE),
          page: String(page),
          sort: "date",
          direction: "DESC",
          "parameters[title]": name,
        });
        const res = await fetch(`${API}?${params}`, { headers: UA, signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (res.status === 429 || res.status === 503) return { events: [], outcome: "throttled", httpStatus: res.status };
        if (!res.ok) return { events: [], outcome: "error", httpStatus: res.status };
        const json = await res.json();
        const rows: DojRelease[] = Array.isArray(json?.results) ? json.results : [];
        releases.push(...rows);
        if (rows.length < PAGE_SIZE) break;
      }
    }
  } catch (err) {
    return { events: [], outcome: "error", detail: String(err).slice(0, 200) };
  }
  const events = dojEvents(releases, names);
  return { events, outcome: events.length ? "ok" : "empty", httpStatus: 200 };
}
