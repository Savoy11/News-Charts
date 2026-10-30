import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * Live assertions against the real services (NC-038).
 *
 *   npm run check:live                # exits 1 only when a source answered, and answered wrong
 *   npm run check:live -- --strict    # also exits 1 when a source could not be reached or was
 *                                     # skipped — for the production host, where all must answer
 *
 * Every finding of the 2026-08-12 audit came from calling a live service: an archive query that
 * could never reach recent material, a Snapshot id that was not a Snapshot space, a release-gate
 * instrument that never asked three of the feeds it was trusted for. No offline suite could have
 * caught any of them. `npm run check:feeds` calls the adapters too, but it reports counts and
 * never fails, and its "0 articles" reads the same for a blocked network as for a broken source.
 *
 * This asks each source a question with a known answer and checks the app's own adapter got it:
 * the halvings land on their dates, Apple's filings are recent, every Snapshot id resolves. Four
 * outcomes are kept apart, because they call for different people:
 *
 *   PASS         the source answered and the answer is right
 *   FAIL         the source answered and the answer is wrong — a bug or a changed API: fix it
 *   UNREACHABLE  no connection to the host, or the source refused to answer yet (a throttle) —
 *                a blocked network or a busy service, not a wrong answer
 *   SKIPPED      the source needs a key that is not set
 *
 * Not part of `npm run check`: it needs the network, and its answers move with the world.
 */

import { SOURCES } from "../lib/ingest/store";
import {
  fundSeriesId,
  resolveCompany,
  getFilings,
  tickerIndexAgeDays,
  TICKER_INDEX_MAX_AGE_DAYS,
  TICKER_INDEX_SYNCED_ON,
} from "../lib/sec";
import { fetchSeriesFilings, ownSeriesFilings } from "../lib/fundSeries";
import { whenPhrase } from "../lib/marketTime";
import { edgarFetch, readFilingHeadline } from "../lib/secHeadlines";
import { fetchDailyPrices } from "../lib/prices";
import { fetchRegulations } from "../lib/federalregister";
import { fetchCpiReleases, fetchFomcStatements } from "../lib/macro";
import { fetchRecalls } from "../lib/recalls";
import { fetchInvestigations } from "../lib/investigations";
import { fetchFedActions } from "../lib/fedActions";
import { fetchListingPage, secPressEvents } from "../lib/secPress";
import { fetchFdaRecalls } from "../lib/fdaRecalls";
import { fetchJusticeReleases } from "../lib/doj";
import { FR_COMPANY_CAP, fetchCompanyRegulations, fetchCompanyYear, frDailySince, isAirworthinessDirective, titleNamesCompany } from "../lib/frCompany";
import { WikipediaUnavailable, getTopicTimeline, wikiOutcome } from "../lib/wiki";
import { GDELT_MIN_PHRASE, fetchNews, gdeltEverydayName, gdeltNewsPlan } from "../lib/news";
import { fetchYahooFinanceNews } from "../lib/newsExtra";
import { fetchArchiveItems } from "../lib/archive";
import { fetchPressMentions } from "../lib/loc";
import { GOVERNANCE_SPACES, assertSpacesResolve, fetchGovernance } from "../lib/onchain/governance";
import { EXPLOIT_TARGETS, fetchExploits } from "../lib/onchain/exploits";
import { fetchBitcoinHalvings } from "../lib/onchain/bitcoin";
import { ETH_MILESTONES, getEthereumMilestones } from "../lib/onchain/ethereum";
import { fetchUsdtSupplyMoves } from "../lib/onchain/usdt";
import type { PricePoint, SourceKey, TimelineEvent } from "../lib/types";

export type Verdict = "PASS" | "FAIL" | "UNREACHABLE" | "SKIPPED";

export interface LiveCase {
  name: string;
  /** the registered sources this case speaks for — every commercial source must have one */
  covers: SourceKey[];
  /** hosts the adapter calls; none answering is UNREACHABLE, not FAIL */
  hosts: string[];
  /** an environment variable the source cannot work without */
  needs?: string;
  /** each string returned is one wrong answer; none is a pass */
  run: () => Promise<string[]>;
}

/** Thrown from a case when the host answered but declined to say anything (a throttle). */
export class NoAnswer extends Error {}

export interface CaseResult {
  name: string;
  verdict: Verdict;
  detail: string[];
}

/**
 * The verdict, from what is known in the order it matters. A missing key is checked before the
 * network, so a keyless host does not hide a configuration problem; a host that never answered
 * outranks whatever the adapter made of the silence, since an adapter failing on no connection
 * says nothing about the source.
 */
export function classify(c: {
  keyMissing: boolean;
  reachable: boolean;
  failures: string[];
  threw?: string;
  declined?: boolean;
}): Verdict {
  if (c.keyMissing) return "SKIPPED";
  if (!c.reachable || c.declined) return "UNREACHABLE";
  return c.failures.length || c.threw ? "FAIL" : "PASS";
}

/** A wrong answer always fails the run; silence fails it only where every source must answer. */
export function exitCode(results: Pick<CaseResult, "verdict">[], strict: boolean): number {
  if (results.some((r) => r.verdict === "FAIL")) return 1;
  if (strict && results.some((r) => r.verdict !== "PASS")) return 1;
  return 0;
}

/** Any HTTP answer at all means the host is reachable; only a failed connection does not. */
async function probe(host: string): Promise<boolean> {
  try {
    await fetch(`https://${host}/`, { method: "HEAD", signal: AbortSignal.timeout(8000) });
    return true;
  } catch {
    return false;
  }
}

// ── assertion helpers, exported for the offline harness ─────────────────────────────────────

export const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const today = () => new Date().toISOString().slice(0, 10);
export const daysAgo = (day: string, now = new Date()) =>
  Math.floor((now.getTime() - Date.parse(`${day}T00:00:00Z`)) / 86_400_000);

/** Wrong answers in a dated event list: malformed or future dates, or fewer than `min` rows. */
export function eventProblems(events: TimelineEvent[], min = 1, now = new Date()): string[] {
  const out: string[] = [];
  if (events.length < min) out.push(`${events.length} events, expected at least ${min}`);
  const bad = events.filter((e) => !isDay(e.date));
  if (bad.length) out.push(`${bad.length} events with a malformed date, e.g. "${bad[0].date}"`);
  const ahead = events.filter((e) => isDay(e.date) && daysAgo(e.date, now) < -1);
  if (ahead.length) out.push(`${ahead.length} events dated in the future, e.g. ${ahead[0].date}`);
  return out;
}

/** Wrong answers in a daily price series. */
export function seriesProblems(points: PricePoint[], minPoints: number, maxStaleDays: number, now = new Date()): string[] {
  const out: string[] = [];
  if (points.length < minPoints) out.push(`${points.length} closes, expected at least ${minPoints}`);
  if (points.some((p) => !(p.value > 0))) out.push("a close that is zero, negative or not a number");
  for (let i = 1; i < points.length; i++) {
    if (points[i].time <= points[i - 1].time) {
      out.push(`dates out of order at ${points[i - 1].time} → ${points[i].time}`);
      break;
    }
  }
  const last = points.at(-1);
  if (last && daysAgo(last.time, now) > maxStaleDays) {
    out.push(`last close ${last.time} is ${daysAgo(last.time, now)} days old`);
  }
  return out;
}

/** The four halvings that have happened, by the protocol's heights and the chain's own dates. */
export const KNOWN_HALVINGS = ["2012-11-28", "2016-07-09", "2020-05-11", "2024-04-20"];

export function halvingProblems(events: TimelineEvent[]): string[] {
  const dates = events.map((e) => e.date).sort();
  return KNOWN_HALVINGS.filter((d, i) => dates[i] !== d).map(
    (d) => `halving expected on ${d}, found ${dates[KNOWN_HALVINGS.indexOf(d)] ?? "nothing"}`
  );
}

// ── the cases ───────────────────────────────────────────────────────────────────────────────

/** A throttle is the service saying "later", not a wrong answer; anything else but ok is wrong. */
export function outcomeProblems(outcome: string, detail?: string): string[] {
  if (outcome === "throttled") throw new NoAnswer(`throttled${detail ? ` (${detail})` : ""}`);
  return outcome === "ok" ? [] : [`adapter outcome "${outcome}"${detail ? ` (${detail})` : ""}`];
}

/**
 * DefiLlama's amount unit, pinned on one known incident: the Ronin Bridge lost about $624m in March
 * 2022, and the feed carries it as `624000000`. Its docs said millions of USD, and believing them
 * put every exploit figure 10^6 too high until a live run caught it (2026-07-31). The canned
 * payloads in `check:exploits` assert whatever unit they were written with, so only the live feed
 * can say the unit still holds — the point of the owner's 2026-08-05 `check:exploit-units`, kept here.
 */
export function exploitUnitProblems(rows: { name?: string; amount?: number }[]): string[] {
  const ronin = rows.find((r) => /\bronin\b/i.test(r.name ?? ""));
  if (!ronin || typeof ronin.amount !== "number") return ["no Ronin Bridge row to pin the amount unit on"];
  return ronin.amount >= 5e8 && ronin.amount <= 7e8
    ? []
    : [`Ronin Bridge amount ${ronin.amount}, expected about 624000000 (plain USD) — the unit may have changed`];
}

/**
 * What a company's Federal Register feed must hold (proposal #4): documents whose title names the
 * company, never an airworthiness directive (the owner's 2026-10-18 call — hundreds a year, each
 * about one aircraft part), none older than the floor asked for, and no more than the cap. The
 * filter is offline-tested in `check:wiring`; only the live feed can say it still lets something
 * through, because the API's phrase search is the part that changes under us.
 */
export function companyRegulationProblems(
  events: TimelineEvent[],
  edgarName: string,
  min = 1,
  window: { since: string; until?: string; cap?: number } = { since: frDailySince(), cap: FR_COMPANY_CAP }
): string[] {
  const out = eventProblems(events, min);
  const unnamed = events.filter((e) => !titleNamesCompany(e.title, edgarName));
  if (unnamed.length) out.push(`${unnamed.length} titles that don't name ${edgarName}, e.g. "${unnamed[0].title}"`);
  const directives = events.filter((e) => isAirworthinessDirective(e.title));
  if (directives.length) out.push(`${directives.length} airworthiness directives, e.g. "${directives[0].title}"`);
  const outside = events.filter((e) => e.date < window.since || (window.until !== undefined && e.date > window.until));
  if (outside.length) out.push(`a document dated ${outside[0].date}, outside ${window.since} to ${window.until ?? "today"}`);
  if (window.cap !== undefined && events.length > window.cap) out.push(`${events.length} documents, over the cap of ${window.cap}`);
  return out;
}

/**
 * What no press release's headline looks like, whatever the filer: a signature or a signer's title,
 * the SEC's cover page, an exhibit's label or index, a date or a place and date alone, an HTML
 * entity left as written, a company's name alone, or words cut off on a joining word. Each is a
 * title the headline reader once gave (the 2026-10-25 audit, batches 47–48), so the reader's
 * fixtures can say what a fix is; only live filings can say whether a filer has since found a new
 * layout that brings one back. Kept to marks a real headline never carries, so a FAIL is worth
 * reading: `check:live-harness` runs every fixture headline through it and none may match.
 */
const HEADLINE_SMELLS: [string, RegExp][] = [
  ["a signature", /\/s\/|^(?:by|name|title|date)\s*:/i],
  ["a disclosure's field", /^(?:company\s+name|representative|(?:stock\s+|securities\s+)?code(?:\s+number)?)\s*:/i],
  ["a signer's title", /^\(?(?:chief|senior|executive|managing|deputy|corporate|group|member|head)\b(?:[\s,&]+(?:[A-Z][\w.'’-]*|and|of|the|for))*[\s,&]+(?:officer|director|controller|secretary|counsel|treasurer|manager|division|department|dept)s?\.?\)?$/i],
  ["the SEC's cover page", /\bform\s+20-f\b.*\bform\s+40-f\b|indicate by check mark|commission file (?:number|no)|registrant has duly caused|^this (?:report on )?form 6-k\b/i],
  ["an exhibit's label or index", /^(?:ex(?:hibit)?[\s.-]*\d|index to exhibits\b|exhibit index\b)|\bexhibit\s+\d+(?:\.\d+)?$/i],
  ["a date, or a place and date, alone", /^(?:(?:[Ii]ssued|[Dd]ated?)\s*:?\s*)?(?:\d{1,2}(?:st|nd|rd|th)?\s+[A-Z][a-z]+\.?\s+\d{4}|[A-Z][a-z]+\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})(?:,\s*[A-Z][\w.]*(?:\s+[A-Z][\w.]*){0,2})?$/],
  ["an HTML entity left as written", /&(?:[a-z]+|#\d+|#x[0-9a-f]+);/i],
  ["a page's furniture", /^source\s*:|\btable of contents\b|^page\s+\d+\s+of\s+\d+\b/i],
  ["a company's name alone", /^[A-Z][\w&.'’-]*(?:[\s,]+[A-Z&][\w&.'’-]*){0,5}[\s,]+(?:Inc|Ltd|plc|PLC|AG|SE|N\.V|S\.A|Corp|Corporation|Limited|Co)\.?(?:\s?\([^)]{1,25}\))?$/],
  // in lower case, or a title-case joining word other than "A", which ends "…haemophilia A"; and a
  // figure after "its" or "the": "…Tender Offer for its 6.00%" (never after "of": "…per Share of $1.12")
  ["words cut off on a joining word", /\s(?:of|and|or|the|a|an|for|to|with|by|from|its|their|Of|And|Or|The|An|For|To|With|By|From|Its|Their)$|\s(?:its|the|their)\s+\$?[\d.,]+%?$/],
];

/** A name with its legal form and punctuation dropped: "SUMITOMO MITSUI FINANCIAL GROUP, INC." → "sumitomo mitsui financial group". */
const bareName = (s: string) =>
  s.toLowerCase().replace(/[^\p{L}\p{N}&]+/gu, " ").trim().replace(/\s(?:inc|ltd|plc|ag|se|nv|sa|corp|corporation|limited|co)$/, "");

export function headlineProblems(reads: { filer: string; accession: string; headline: string; name?: string }[]): string[] {
  const out: string[] = [];
  for (const r of reads) {
    const smell =
      r.headline.split(/\s+/).length < 3
        ? "too few words to be a headline"
        : r.name && bareName(r.headline) === bareName(r.name)
          ? "the company's name alone"
          : HEADLINE_SMELLS.find(([, re]) => re.test(r.headline))?.[0];
    if (smell) out.push(`${r.filer} ${r.accession}: ${smell} — "${r.headline}"`);
  }
  return out;
}

/**
 * Whose recent releases the headline reader is sampled on: US 8-Ks, and the 6-K layouts that went
 * wrong once — Japanese banks' signatures and legends, GSK's date line, Takeda's signature after the
 * date, Lloyds' exhibit index, BP's exhibit list, UBS's cover, UnitedHealth's page count — with a
 * few that never did.
 */
export const HEADLINE_SAMPLE = ["AAPL", "JPM", "PG", "INTC", "UNH", "MUFG", "MFG", "SMFG", "GSK", "SAP", "TAK", "LYG", "BP", "UBS", "TSM", "ASML", "NMR"];
const HEADLINES_PER_FILER = 5;

export const CASES: LiveCase[] = [
  {
    name: "EDGAR — Apple's filings and the committed index",
    covers: ["sec_edgar"],
    hosts: ["data.sec.gov", "www.sec.gov"],
    async run() {
      const out: string[] = [];
      const apple = await resolveCompany("AAPL");
      if (!apple || apple.ticker !== "AAPL" || Number(apple.cik) !== 320193) {
        return [`AAPL resolved to ${apple ? `${apple.ticker} / CIK ${apple.cik}` : "nothing"}, expected CIK 320193`];
      }
      const filings = await getFilings(apple);
      out.push(...eventProblems(filings, 20));
      const newest = filings.map((f) => f.date).sort().at(-1);
      if (newest && daysAgo(newest) > 120) out.push(`newest filing ${newest} — Apple files at least quarterly`);
      // A filing links its document; a rename (batch 15) links the company's EDGAR record, which is
      // where a former name is written down — both on sec.gov, nothing else. Apple's 2007 rename
      // was the first live record to carry one, once the session could reach EDGAR (2026-10-21).
      const renames = filings.filter((f) => f.type === "corporate_action" && /^Renamed from /.test(f.title));
      if (renames.some((f) => !f.url?.startsWith("https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK="))) {
        out.push("a rename linking somewhere other than the company's EDGAR record");
      }
      if (filings.some((f) => !renames.includes(f) && !f.url?.startsWith("https://www.sec.gov/Archives/"))) {
        out.push("a filing link outside https://www.sec.gov/Archives/");
      }
      // Apple reports a shareholder vote (5.07) on an 8-K every year, so a recent block with no
      // 8-K named by its item means EDGAR's `items` column stopped arriving (proposal 1).
      if (!filings.some((f) => /\(8-K \d\.\d\d\)$/.test(f.title))) {
        out.push("no 8-K titled by its item — is EDGAR still sending `items`?");
      }
      // Apple releases its results at 4:30 pm ET, after the close (batch 68): a release with no time
      // means EDGAR stopped sending `acceptanceDateTime`, or its meaning moved
      const release = filings.filter((f) => /^Apple Inc\.: Earnings announcement \(8-K\)$/.test(f.title)).sort((a, b) => b.date.localeCompare(a.date))[0];
      if (!release) out.push("no results 8-K among Apple's recent filings");
      else if (!/ET, after the close$/.test(whenPhrase(release) ?? "")) out.push(`Apple's results 8-K of ${release.date} came out "${whenPhrase(release) ?? "at no time"}"`);
      // A foreign private issuer's annual report is earnings the way a 10-K is. TSM files a 20-F
      // every spring and few enough 6-Ks that the recent block always reaches back to one.
      const tsm = await resolveCompany("TSM");
      const annual = tsm ? (await getFilings(tsm)).filter((f) => /\(20-F\)$/.test(f.title)) : [];
      if (!annual.length) out.push("no 20-F among TSM's recent filings");
      else if (annual.some((f) => f.type !== "earnings")) out.push("a TSM 20-F not typed earnings");
      else if (daysAgo(annual.map((f) => f.date).sort().at(-1)!) > 400) {
        out.push(`TSM's newest 20-F is ${annual.map((f) => f.date).sort().at(-1)} — it files one a year`);
      }
      // Asked here because the fix needs sec.gov, which this case has just shown answers.
      const age = tickerIndexAgeDays();
      if (age > TICKER_INDEX_MAX_AGE_DAYS) {
        out.push(`committed ticker index is ${age} days old (synced ${TICKER_INDEX_SYNCED_ON}): npm run sync:tickers`);
      }
      return out;
    },
  },
  {
    name: "EDGAR — VOO's own filings, by its series' filing list (batch 67)",
    covers: ["sec_edgar"],
    hosts: ["data.sec.gov", "www.sec.gov"],
    async run() {
      const seriesId = fundSeriesId("VOO");
      if (seriesId !== "S000002839") return [`VOO's series id is ${seriesId}, expected S000002839 from the committed index`];
      const series = await fetchSeriesFilings(seriesId, { maxPages: 1 });
      if (!series) throw new NoAnswer("EDGAR did not answer with VOO's series filing list");
      const out: string[] = [];
      if (series.accessions.size < 50) out.push(`only ${series.accessions.size} filings on the list's first page`);
      // 2026-08-28, read from both filings' headers on 2026-10-27: VOO's NPORT-P, and VB's beside it
      if (series.oldest < "2026-08-28" && !series.accessions.has("000003640526000473")) out.push("VOO's NPORT-P of 2026-08-28 (0000036405-26-000473) is not on its list");
      if (series.accessions.has("000003640526000472")) out.push("VB's NPORT-P of 2026-08-28 (0000036405-26-000472) is on VOO's list");
      const voo = await resolveCompany("VOO");
      if (!voo) return [...out, "VOO did not resolve"];
      const split = ownSeriesFilings(await getFilings(voo), series);
      if (split.own.length < 10 || split.siblings.length < 10) out.push(`the trust's recent fund filings split ${split.own.length} own / ${split.siblings.length} a sibling's`);
      return out;
    },
  },
  {
    name: "EDGAR — recent press releases read as headlines",
    covers: ["sec_edgar"],
    hosts: ["data.sec.gov", "www.sec.gov"],
    async run() {
      // paced under EDGAR's limit, as the ingest's own reading is; a refusal is a throttle, not a wrong answer
      const get = async (url: string) => {
        await new Promise((r) => setTimeout(r, 150));
        const res = await edgarFetch(url);
        if (res.status === 429 || res.status === 403) throw new NoAnswer(`EDGAR answered ${res.status}`);
        return res;
      };
      const reads: { filer: string; accession: string; headline: string; name: string }[] = [];
      let asked = 0;
      for (const ticker of HEADLINE_SAMPLE) {
        const co = await resolveCompany(ticker);
        if (!co) return [`${ticker} did not resolve`];
        const listed = await get(`https://data.sec.gov/submissions/CIK${co.cik.padStart(10, "0")}.json`);
        if (!listed.ok) throw new NoAnswer(`EDGAR answered ${listed.status} for ${ticker}'s filings`);
        const recent = (await listed.json()).filings.recent;
        const accessions: string[] = [];
        for (let i = 0; i < recent.form.length && accessions.length < HEADLINES_PER_FILER; i++) {
          if (recent.form[i] === "8-K" || recent.form[i] === "6-K") accessions.push(recent.accessionNumber[i].replace(/-/g, ""));
        }
        for (const accession of accessions) {
          asked++;
          const got = await readFilingHeadline(co.cik, accession, get);
          if (got?.headline) reads.push({ filer: ticker, accession, headline: got.headline, name: co.name });
        }
      }
      const out = headlineProblems(reads);
      // about a third of recent 8-Ks and 6-Ks carry a release; a reader that finds almost none is broken
      if (reads.length < asked / 8) out.push(`only ${reads.length} headlines from ${asked} recent 8-Ks and 6-Ks`);
      return out;
    },
  },
  {
    name: "Yahoo chart — ten years of AAPL closes",
    covers: ["yahoo_prices"],
    hosts: ["query1.finance.yahoo.com"],
    async run() {
      const r = await fetchDailyPrices("AAPL");
      return [...outcomeProblems(r.outcome, r.detail), ...seriesProblems(r.points, 2000, 7)];
    },
  },
  {
    name: "Yahoo chart — AAPL's whole daily history, back to its 1980 listing",
    covers: ["yahoo_prices"],
    hosts: ["query1.finance.yahoo.com"],
    async run() {
      // NC-077: asked by date this is every daily close; `range=max` came back quarterly ("3mo").
      const r = await fetchDailyPrices("AAPL", "full");
      const out = [...outcomeProblems(r.outcome, r.detail), ...seriesProblems(r.points, 11_000, 7)];
      if (r.points[0] && r.points[0].time > "1981-01-01") out.push(`history starts ${r.points[0].time}, not at the December 1980 listing`);
      return out;
    },
  },
  {
    name: "Yahoo chart — Walmart's 1970s closes keep their fractions of a cent",
    covers: ["yahoo_prices"],
    hosts: ["query1.finance.yahoo.com"],
    async run() {
      // Audit 2026-10-21 #1: rounded to cents, WMT's split-adjusted 1973–75 closes moved
      // 0.01 → 0.02 six times — six "+100%" days. Its largest real daily move then was −16.8%.
      const r = await fetchDailyPrices("WMT", "full");
      const out = [...outcomeProblems(r.outcome, r.detail), ...seriesProblems(r.points, 13_000, 7)];
      const early = r.points.filter((p) => p.time < "1976-01-01");
      if (!early.some((p) => Math.round(p.value * 100) !== p.value * 100)) out.push("every pre-1976 close is a whole number of cents — rounded again");
      let worst = 0;
      for (let i = 1; i < early.length; i++) worst = Math.max(worst, Math.abs(early[i].value / early[i - 1].value - 1));
      if (worst > 0.5) out.push(`a ${Math.round(worst * 100)}% day before 1976 — rounding makes moves like that`);
      return out;
    },
  },
  {
    name: "Yahoo Finance RSS — AAPL headlines",
    covers: ["yahoo_finance"],
    hosts: ["feeds.finance.yahoo.com"],
    async run() {
      const r = await fetchYahooFinanceNews("AAPL");
      return [...outcomeProblems(r.outcome, r.detail), ...eventProblems(r.events, 1)];
    },
  },
  {
    name: "GDELT — this month's Apple coverage",
    covers: ["gdelt"],
    hosts: ["api.gdeltproject.org"],
    async run() {
      // GDELT throttles hard (one request per ~5 s); `outcomeProblems` turns a refusal into "unanswered".
      const r = await fetchNews("Apple");
      const out = [...outcomeProblems(r.outcome, r.detail), ...eventProblems(r.events, 1)];
      const newest = r.events.map((e) => e.date).sort().at(-1);
      if (newest && daysAgo(newest) > 30) out.push(`newest article ${newest} — expected this month`);
      return out;
    },
  },
  {
    // "Visa" alone is refused as too short (batch 33); "visa inc" returned 7 articles in two weeks
    name: "GDELT — Visa, under a name it takes",
    covers: ["gdelt"],
    hosts: ["api.gdeltproject.org"],
    async run() {
      const query = gdeltEverydayName("VISA INC.");
      const r = await fetchNews(query);
      const out = [...outcomeProblems(r.outcome, r.detail), ...eventProblems(r.events, 1)];
      if (query.length < GDELT_MIN_PHRASE) out.push(`asked "${query}", shorter than GDELT takes`);
      return out;
    },
  },
  {
    // "ibm" goes bare (batch 34): thirty articles in a day, nine naming IBM in the headline
    name: "GDELT — IBM under its bare initials, headlines naming it only",
    covers: ["gdelt"],
    hosts: ["api.gdeltproject.org"],
    async run() {
      const r = await fetchNews("INTERNATIONAL BUSINESS MACHINES", ["IBM"]);
      const out = [...outcomeProblems(r.outcome, r.detail), ...eventProblems(r.events, 1)];
      const stray = r.events.find((e) => !/\b(?:IBM|International Business Machines)\b/i.test(e.title));
      if (stray) out.push(`kept "${stray.title}", whose headline does not name IBM`);
      return out;
    },
  },
  {
    // GDELT holds "Domino's Pizza" as "Domino Pizza" (batch 36): "dominos pizza", as Domino's was
    // asked for, found 2 articles in three days; "domino pizza" 18
    name: "GDELT — Domino's Pizza under the form GDELT holds",
    covers: ["gdelt"],
    hosts: ["api.gdeltproject.org"],
    async run() {
      const r = await fetchNews(gdeltEverydayName("DOMINOS PIZZA INC", "Domino's Pizza"));
      const out = [...outcomeProblems(r.outcome, r.detail), ...eventProblems(r.events, 1)];
      if (!r.events.some((e) => /\bDomino\b/i.test(e.title))) out.push("no headline naming Domino");
      return out;
    },
  },
  {
    // by relevance (batch 37): newest first, none of the hundred headlines named McDonald's; by
    // relevance, 37 did. The kept ones must name it, and not as a person's surname
    name: "GDELT — McDonald's by relevance, headlines naming it only",
    covers: ["gdelt"],
    hosts: ["api.gdeltproject.org"],
    async run() {
      const plan = gdeltNewsPlan("MCDONALDS CORP", "McDonald's");
      const r = await fetchNews(plan.query, [], { byRelevance: plan.byRelevance });
      const out = [...outcomeProblems(r.outcome, r.detail), ...eventProblems(r.events, 1)];
      const stray = r.events.find((e) => !/\bMcDonald/i.test(e.title));
      if (stray) out.push(`kept "${stray.title}", whose headline does not name McDonald's`);
      return out;
    },
  },
  {
    name: "Federal Register — semiconductor rules",
    covers: ["federal_register"],
    hosts: ["www.federalregister.gov"],
    async run() {
      const r = await fetchRegulations("semiconductors");
      const out = [...outcomeProblems(r.outcome, r.detail), ...eventProblems(r.events, 10)];
      if (r.events.some((e) => e.date < "2015-01-01")) out.push("a rule dated before the 2015 floor it was asked for");
      return out;
    },
  },
  {
    name: "Federal Register — documents naming Ford Motor",
    covers: ["federal_register"],
    hosts: ["www.federalregister.gov"],
    async run() {
      // The daily ask reads the current year, which in January may honestly hold none, so it is held
      // to its window and cap only. A year before 2015, the old floor, is the year walk's (batch 63):
      // measured 2026-10-27, 2008 held six of Ford's, NHTSA petitions and a Labor Department
      // determination at its Louisville plant.
      const r = await fetchCompanyRegulations("FORD MOTOR CO");
      const daily = r.outcome === "empty" ? [] : outcomeProblems(r.outcome, r.detail);
      const y = await fetchCompanyYear("FORD MOTOR CO", 2008);
      return [
        ...daily,
        ...companyRegulationProblems(r.events, "FORD MOTOR CO", 0),
        ...outcomeProblems(y.outcome, y.detail),
        ...companyRegulationProblems(y.events, "FORD MOTOR CO", 4, { since: "2008-01-01", until: "2008-12-31" }),
      ];
    },
  },
  {
    name: "Federal Reserve — FOMC policy statements, with the history back to 1994",
    covers: ["fed_fomc"],
    hosts: ["www.federalreserve.gov"],
    async run() {
      const r = await fetchFomcStatements({ history: true });
      const out = [...outcomeProblems(r.outcome, r.detail), ...eventProblems(r.events, 200)];
      const dates = new Set(r.events.map((e) => e.date));
      // Decisions that must be there, one per era of the Fed's addresses, emergencies included;
      // and releases on the same pages that are not decisions and must not be.
      for (const d of ["1994-02-04", "2001-09-17", "2008-01-22", "2008-12-16", "2020-03-15"]) {
        if (!dates.has(d)) out.push(`no statement on ${d}`);
      }
      for (const d of ["2020-03-19", "2020-08-27", "2025-08-22"]) {
        if (dates.has(d)) out.push(`${d} read as a decision — it is another kind of release`);
      }
      return out;
    },
  },
  {
    name: "Wikidata — the names search borrows (Google is Alphabet's, Facebook was Meta's)",
    // not an event source: these names only resolve searches (data/company-aliases.json)
    covers: [],
    hosts: ["query.wikidata.org"],
    async run() {
      // NC-004: the two names neither EDGAR record carries. Google Inc. (CIK 1288776) must still sit
      // under Alphabet (CIK 1652044), and "Facebook, Inc." must still be one of Meta's official names.
      const query = `SELECT ?parent ?name WHERE {
        { ?g wdt:P5531 "0001288776" . ?g p:P749 ?st . ?st ps:P749 ?p . FILTER NOT EXISTS { ?st pq:P582 ?e } ?p wdt:P5531 ?parent }
        UNION { ?m wdt:P5531 "0001326801" . ?m p:P1448/ps:P1448 ?name }
      }`;
      const res = await fetch(`https://query.wikidata.org/sparql?${new URLSearchParams({ query, format: "json" })}`, {
        headers: { "User-Agent": "News Charts Research marcusowens94@gmail.com", Accept: "application/sparql-results+json" },
      });
      if (res.status === 429 || res.status === 503) throw new NoAnswer(`HTTP ${res.status}`);
      if (!res.ok) return [`HTTP ${res.status}`];
      const rows = ((await res.json()) as { results: { bindings: Record<string, { value: string }>[] } }).results.bindings;
      const out: string[] = [];
      if (!rows.some((r) => r.parent?.value === "0001652044")) out.push("Google Inc. is no longer under Alphabet in Wikidata");
      if (!rows.some((r) => r.name?.value === "Facebook, Inc.")) out.push('"Facebook, Inc." is no longer among Meta\'s official names');
      return out;
    },
  },
  {
    name: "BLS — CPI release archive",
    covers: ["bls_cpi"],
    hosts: ["www.bls.gov"],
    async run() {
      const r = await fetchCpiReleases();
      const out = [...outcomeProblems(r.outcome, r.detail), ...eventProblems(r.events, 200)];
      const jan2024 = r.events.find((e) => e.date === "2024-02-13");
      if (!jan2024) out.push("no release on 2024-02-13");
      else if (!/January 2024/.test(jan2024.title)) out.push(`2024-02-13 named "${jan2024.title}", not January 2024`);
      const newest = r.events.at(-1)?.date;
      if (newest && daysAgo(newest) > 45) out.push(`newest release ${newest} — expected within the last month or so`);
      return out;
    },
  },
  {
    name: "NHTSA — Ford's recalls back to 1966, Stellantis's only from 2014",
    covers: ["nhtsa_recalls"],
    hosts: ["data.transportation.gov"],
    async run() {
      const ford = await fetchRecalls(37996);
      const out = [...outcomeProblems(ford.outcome, ford.detail), ...eventProblems(ford.events, 800)];
      const first = ford.events.map((e) => e.date).sort()[0];
      if (first && first > "1967-01-01") out.push(`Ford's earliest recall is ${first}, expected 1966`);
      // the 2011 F-150 fuel-tank strap recall: 1.1 million vehicles
      const straps = ford.events.find((e) => e.externalId === "11V385000");
      if (!straps) out.push("no 11V385000 (2011 fuel-tank straps)");
      else if (!/^Recall of 1,100,000 vehicles: Fuel tank strap corrosion$/.test(straps.title)) out.push(`11V385000 titled "${straps.title}"`);
      const stla = await fetchRecalls(1605484);
      out.push(...outcomeProblems(stla.outcome, stla.detail).map((p) => `Stellantis: ${p}`));
      const early = stla.events.filter((e) => e.date < "2014-10-12");
      if (early.length) out.push(`${early.length} Stellantis recalls before 2014-10-12, e.g. ${early[0].date}`);
      return out;
    },
  },
  {
    name: "Federal Reserve — Wells Fargo's 2018 asset-cap order, no namesake's action on Huntington (batch 69), HSBC's 2012 penalty (batch 74)",
    covers: ["fed_enforcement"],
    hosts: ["www.federalreserve.gov"],
    async run() {
      const wfc = await fetchFedActions(72971);
      const out = [...outcomeProblems(wfc.outcome, wfc.detail), ...eventProblems(wfc.events, 6)];
      const cap = wfc.events.find((e) => e.date === "2018-02-02");
      if (!cap) out.push("no Wells Fargo action of 2018-02-02 (the asset cap)");
      else if (!/^Federal Reserve: Cease-and-desist order/.test(cap.title)) out.push(`2018-02-02 titled "${cap.title}"`);
      // the recent file grows: an action of the last year or so says it is still being kept
      const jpm = await fetchFedActions(19617);
      out.push(...outcomeProblems(jpm.outcome, jpm.detail).map((p) => `JPMorgan: ${p}`));
      if (!jpm.events.some((e) => e.date === "2013-09-18" && /\$200 million/.test(e.title))) out.push("no JPMorgan $200 million penalty of 2013-09-18");
      const hban = await fetchFedActions(49196);
      if (hban.events.some((e) => /Huntington, Texas/.test(e.description ?? ""))) out.push("a Huntington, Texas action on HBAN");
      // a foreign bank's (batch 74): HSBC's order and $165 million penalty of 2012-12-11, and none of
      // Bankers Trust's before Deutsche Bank bought it on 1999-06-04
      const hsbc = await fetchFedActions(1089113);
      if (!hsbc.events.some((e) => e.date === "2012-12-11" && /\$165 million/.test(e.title))) out.push("no HSBC $165 million penalty of 2012-12-11");
      const db = await fetchFedActions(1159508);
      if (db.events.some((e) => e.date < "1999-06-04")) out.push("a Bankers Trust action from before Deutsche Bank bought it on DB");
      return out;
    },
  },
  {
    name: "NHTSA — Toyota's defect investigations, its 2010 acceleration query among them (batch 66)",
    covers: ["nhtsa_investigations"],
    hosts: ["data.transportation.gov"],
    async run() {
      // measured 2026-10-27: 114 under Toyota Motor Corporation, from 1990 on
      const toyota = await fetchInvestigations(1094517);
      const out = [...outcomeProblems(toyota.outcome, toyota.detail), ...eventProblems(toyota.events, 100)];
      const rq = toyota.events.find((e) => e.externalId === "RQ10003");
      if (!rq) out.push("no RQ10003 (2010 unintended acceleration)");
      else if (rq.date !== "2010-02-16" || rq.title !== "NHTSA opened a recall query: Unintended and Uncontrolled Acceleration") out.push(`RQ10003: ${rq.date} "${rq.title}"`);
      const stla = await fetchInvestigations(1605484);
      out.push(...outcomeProblems(stla.outcome, stla.detail).map((p) => `Stellantis: ${p}`));
      const early = stla.events.filter((e) => e.date < "2014-10-12");
      if (early.length) out.push(`${early.length} Stellantis investigations before 2014-10-12, e.g. ${early[0].date}`);
      return out;
    },
  },
  {
    name: "FDA — Medtronic's device recalls since 2012; GE Healthcare's split at the 2023 spin-off",
    covers: ["fda_enforcement"],
    hosts: ["api.fda.gov"],
    async run() {
      const mdt = await fetchFdaRecalls(1613103);
      const out = [...outcomeProblems(mdt.outcome, mdt.detail), ...eventProblems(mdt.events, 400)];
      const first = mdt.events.map((e) => e.date).sort()[0];
      if (first && first > "2013-01-01") out.push(`Medtronic's earliest recall is ${first}, expected 2012 or before`);
      // 2025-08-06, Class I: three DLP left-heart vent catheters that may not keep their shape
      const vent = mdt.events.find((e) => e.externalId === "97295");
      if (!vent) out.push("no event 97295 (2025 DLP vent catheters)");
      else if (!/^Class I device recall: DLP Left Heart Vent Catheter/.test(vent.title)) out.push(`97295 titled "${vent.title}"`);
      const ge = await fetchFdaRecalls(40545);
      out.push(...outcomeProblems(ge.outcome, ge.detail).map((p) => `GE: ${p}`));
      const late = ge.events.filter((e) => e.date > "2023-01-03");
      if (late.length) out.push(`${late.length} GE recalls after the 2023-01-03 spin-off, e.g. ${late[0].date}`);
      const gehc = await fetchFdaRecalls(1932393);
      out.push(...outcomeProblems(gehc.outcome, gehc.detail).map((p) => `GE HealthCare: ${p}`));
      const early = gehc.events.filter((e) => e.date < "2023-01-04");
      if (early.length) out.push(`${early.length} GE HealthCare recalls before its first day, e.g. ${early[0].date}`);
      return out;
    },
  },
  {
    name: "FDA — Teleflex's Arrow recalls; Danaher's Beckman Coulter from its purchase, Envista from its IPO (batch 70)",
    covers: ["fda_enforcement"],
    hosts: ["api.fda.gov"],
    async run() {
      // measured 2026-10-27: Teleflex 203 (95 of them Arrow International's), Danaher 377, Envista 13
      const tfx = await fetchFdaRecalls(96943);
      const out = [...outcomeProblems(tfx.outcome, tfx.detail), ...eventProblems(tfx.events, 180)];
      if (!tfx.events.some((e) => e.externalId === "87092")) out.push("no event 87092 (Arrow International, 2021-01-06)");
      const dhr = await fetchFdaRecalls(313616);
      out.push(...outcomeProblems(dhr.outcome, dhr.detail).map((p) => `Danaher: ${p}`), ...eventProblems(dhr.events, 300).map((p) => `Danaher: ${p}`));
      if (!dhr.events.some((e) => e.externalId === "61212")) out.push("no event 61212 (Beckman Coulter, 2011-07-27)");
      const early = dhr.events.filter((e) => e.date < "2011-06-30");
      if (early.length) out.push(`${early.length} Danaher recalls before it bought Beckman Coulter on 2011-06-30, e.g. ${early[0].date}`);
      const nvst = await fetchFdaRecalls(1757073);
      out.push(...outcomeProblems(nvst.outcome, nvst.detail).map((p) => `Envista: ${p}`));
      const beforeIpo = nvst.events.filter((e) => e.date < "2019-09-20");
      if (beforeIpo.length) out.push(`${beforeIpo.length} Envista recalls before its IPO closed on 2019-09-20, e.g. ${beforeIpo[0].date}`);
      return out;
    },
  },
  {
    name: "Justice Department — Boeing's settlements and 737 MAX charge; Visa's suits, not visa fraud",
    covers: ["doj_press"],
    hosts: ["www.justice.gov"],
    async run() {
      const boeing = await fetchJusticeReleases("BOEING CO");
      const out = [...outcomeProblems(boeing.outcome, boeing.detail), ...eventProblems(boeing.events, 5)];
      // 2021-01-07: "Boeing Charged with 737 Max Fraud Conspiracy and Agrees to Pay over $2.5 Billion"
      if (!boeing.events.some((e) => e.date === "2021-01-07" && /737 Max/i.test(e.title))) out.push("no 2021-01-07 737 MAX release");
      const first = boeing.events.map((e) => e.date).sort()[0];
      if (first && first > "2010-01-01") out.push(`Boeing's earliest release is ${first}, expected 2009`);
      const person = boeing.events.find((e) => /^Former\b/i.test(e.title));
      if (person) out.push(`kept a release about a person: "${person.title}"`);
      // "Visa" is also a travel document: hundreds of immigration cases carry the word
      const visa = await fetchJusticeReleases("VISA INC.");
      out.push(...outcomeProblems(visa.outcome, visa.detail).map((p) => `Visa: ${p}`));
      if (!visa.events.some((e) => e.date === "2024-09-24" && /Sues Visa/.test(e.title))) out.push("Visa: no 2024-09-24 debit-monopoly suit");
      const word = visa.events.find((e) => /\b(?:student|work|her|his)\s+visa\b/i.test(e.title));
      if (word) out.push(`Visa: kept "${word.title}"`);
      return out;
    },
  },
  {
    name: "SEC press releases — a closed year's pages as the walk reads them; Goldman's 2010 settlement by the party rule (batch 73)",
    covers: ["sec_press"],
    hosts: ["www.sec.gov"],
    async run() {
      // measured 2026-10-29: 2010 holds 258 releases, newest first, 25 a page; its newest is 2010-258,
      // Alcatel-Lucent's FCPA charge of Dec. 27, and Goldman's $550 million settlement is on page 6
      const first = await fetchListingPage(2010, 0);
      const out = first.outcome === "ok" ? [] : [`2010 page 1: ${first.outcome} ${first.httpStatus ?? ""} ${first.detail ?? ""}`.trim()];
      if (first.releases.length !== 25) out.push(`2010 page 1 holds ${first.releases.length} releases, not 25`);
      const alcatel = first.releases.find((r) => r.number === "2010-258");
      if (!alcatel || alcatel.day !== "2010-12-27" || !/Alcatel-Lucent/.test(alcatel.title)) out.push("no 2010-258, Alcatel-Lucent's charge of 2010-12-27, on page 1");
      await new Promise((r) => setTimeout(r, 1_000));
      const sixth = await fetchListingPage(2010, 5);
      const gs = secPressEvents(sixth.releases, () => ["GOLDMAN SACHS GROUP", "Goldman Sachs"]);
      if (!gs.some((e) => e.externalId === "2010-123@2010-07-15")) out.push("Goldman's 2010-123 settlement of 2010-07-15 not kept for GS from page 6");
      await new Promise((r) => setTimeout(r, 1_000));
      const past = await fetchListingPage(2010, 11);
      if (past.outcome !== "ok" || past.releases.length) out.push(`2010 page 12, past the last, answered ${past.outcome} with ${past.releases.length} releases`);
      return out;
    },
  },
  {
    name: "Wikipedia — Ford Motor Company's history",
    covers: ["wikipedia"],
    hosts: ["en.wikipedia.org"],
    async run() {
      // A 429 from Wikipedia is a throttle — UNREACHABLE, as for every other source — not a wrong
      // answer; it was reported as FAIL because the adapter throws it rather than returning it.
      const story = await getTopicTimeline("Ford Motor Company").catch((err) => {
        if (err instanceof WikipediaUnavailable && wikiOutcome(err) === "throttled") throw new NoAnswer(err.message);
        throw err;
      });
      if (!story) return ["no article resolved"];
      const out = eventProblems(story.events.filter((e) => e.type === "history"), 5);
      if (!/ford/i.test(story.title)) out.push(`resolved to "${story.title}"`);
      return out;
    },
  },
  {
    name: "Internet Archive — recent material is reachable",
    covers: ["internet_archive"],
    hosts: ["archive.org"],
    async run() {
      const r = await fetchArchiveItems("Ford Motor Company");
      const out = [...outcomeProblems(r.outcome, r.detail), ...eventProblems(r.events, 1)];
      // The 2026-08-12 finding: a date-ascending sort meant the query could never reach recent
      // material. One item from the last decade is the proof it can.
      const recent = r.events.filter((e) => isDay(e.date) && daysAgo(e.date) < 3653);
      if (r.events.length && !recent.length) out.push("no item from the last ten years");
      return out;
    },
  },
  {
    name: "Library of Congress — pre-1964 press",
    covers: ["loc_chronam"],
    hosts: ["www.loc.gov"],
    async run() {
      const r = await fetchPressMentions("telegraph");
      const out = [...outcomeProblems(r.outcome, r.detail), ...eventProblems(r.events, 1)];
      const late = r.events.filter((e) => e.date > "1963-12-31");
      if (late.length) out.push(`${late.length} items after 1963, e.g. ${late[0].date}`);
      return out;
    },
  },
  {
    name: "Snapshot — every governance space resolves and holds proposals",
    covers: ["snapshot"],
    hosts: ["hub.snapshot.org"],
    async run() {
      const out: string[] = [];
      for (const c of await assertSpacesResolve(GOVERNANCE_SPACES)) {
        if (c.resolves !== true) out.push(`${c.space}: ${c.resolves === false ? "not a Snapshot space" : c.detail}`);
      }
      for (const s of GOVERNANCE_SPACES) {
        const r = await fetchGovernance(s);
        const wrong = [...outcomeProblems(r.outcome, r.detail), ...eventProblems(r.events, 1)];
        out.push(...wrong.map((w) => `${s.space}: ${w}`));
      }
      return out;
    },
  },
  {
    name: "DefiLlama — exploit records for each target",
    covers: ["defillama"],
    hosts: ["api.llama.fi"],
    async run() {
      const out: string[] = [];
      for (const t of EXPLOIT_TARGETS) {
        const r = await fetchExploits(t);
        // "empty" is a real answer for a target with no recorded exploit; only an error is wrong.
        if (r.outcome !== "empty") out.push(...outcomeProblems(r.outcome, r.detail).map((w) => `${t.slug}: ${w}`));
        out.push(...eventProblems(r.events, 0).map((w) => `${t.slug}: ${w}`));
      }
      const raw = await fetch("https://api.llama.fi/hacks");
      if (!raw.ok) out.push(`hacks feed answered HTTP ${raw.status}`);
      else out.push(...exploitUnitProblems(await raw.json()));
      return out;
    },
  },
  {
    name: "Bitcoin — the four halvings land on their dates",
    covers: ["onchain"],
    hosts: ["mempool.space", "blockstream.info"],
    async run() {
      const r = await fetchBitcoinHalvings();
      return [...outcomeProblems(r.outcome, r.detail), ...halvingProblems(r.events)];
    },
  },
  {
    name: "Ethereum — milestone dates agree with the chain",
    covers: ["onchain"],
    hosts: ["eth.blockscout.com"],
    async run() {
      const events = await getEthereumMilestones();
      // Every row on the published date means no block lookup was answered — measured
      // 2026-08-12 as a 403 to the build container. A refusal, not a wrong date.
      if (events.length && events.every((e) => /^Published/.test(e.source))) {
        throw new NoAnswer("the explorer answered none of the block lookups");
      }
      const out: string[] = [];
      for (const m of ETH_MILESTONES) {
        const e = events.find((x) => x.title === m.name);
        if (!e) out.push(`${m.name}: missing`);
        else if (/^Published/.test(e.source)) out.push(`${m.name}: the explorer did not answer for block ${m.block}`);
        else if (e.date !== m.fallbackDate) out.push(`${m.name}: chain says ${e.date}, curated date is ${m.fallbackDate}`);
      }
      return out;
    },
  },
  {
    name: "Etherscan — USDT supply moves",
    covers: ["onchain"],
    hosts: ["api.etherscan.io"],
    needs: "ETHERSCAN_API_KEY",
    async run() {
      const r = await fetchUsdtSupplyMoves();
      return [...outcomeProblems(r.outcome, r.detail), ...eventProblems(r.events, 0)];
    },
  },
];

/** Registered sources a site may publish from that no live case asks. */
export function uncovered(cases: LiveCase[] = CASES): SourceKey[] {
  const covered = new Set(cases.flatMap((c) => c.covers));
  return SOURCES.filter((s) => s.commercialOk && !covered.has(s.key)).map((s) => s.key);
}

export async function runCase(c: LiveCase): Promise<CaseResult> {
  const keyMissing = Boolean(c.needs && !process.env[c.needs]);
  if (keyMissing) return { name: c.name, verdict: "SKIPPED", detail: [`${c.needs} is not set`] };
  const reachable = (await Promise.all(c.hosts.map(probe))).some(Boolean);
  if (!reachable) return { name: c.name, verdict: "UNREACHABLE", detail: [`no answer from ${c.hosts.join(", ")}`] };
  let failures: string[] = [];
  let threw: string | undefined;
  let declined: string | undefined;
  try {
    failures = await c.run();
  } catch (err) {
    if (err instanceof NoAnswer) declined = err.message;
    else threw = (err as Error).message;
  }
  return {
    name: c.name,
    verdict: classify({ keyMissing, reachable, failures, threw, declined: Boolean(declined) }),
    detail: declined ? [declined] : threw ? [`threw: ${threw}`] : failures,
  };
}

async function main(): Promise<void> {
  const strict = process.argv.includes("--strict");
  console.log(`\nLive assertions — ${today()}${strict ? " (strict)" : ""}\n`);
  const results: CaseResult[] = [];
  for (const c of CASES) {
    const r = await runCase(c);
    results.push(r);
    console.log(`  ${r.verdict.padEnd(11)}  ${r.name}`);
    for (const d of r.detail) console.log(`               ${d}`);
  }
  const count = (v: Verdict) => results.filter((r) => r.verdict === v).length;
  console.log(
    `\n${count("PASS")} pass, ${count("FAIL")} fail, ${count("UNREACHABLE")} unreachable, ${count("SKIPPED")} skipped`
  );
  if (count("UNREACHABLE")) {
    console.log("Unreachable means no connection, or a throttle. It says nothing about whether the source is right.");
  }
  process.exit(exitCode(results, strict));
}

if (require.main === module) main();
