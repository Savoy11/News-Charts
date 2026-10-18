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
  resolveCompany,
  getFilings,
  tickerIndexAgeDays,
  TICKER_INDEX_MAX_AGE_DAYS,
  TICKER_INDEX_SYNCED_ON,
} from "../lib/sec";
import { fetchDailyPrices } from "../lib/prices";
import { fetchRegulations } from "../lib/federalregister";
import { FR_COMPANY_CAP, FR_COMPANY_SINCE, fetchCompanyRegulations, isAirworthinessDirective, titleNamesCompany } from "../lib/frCompany";
import { getTopicTimeline } from "../lib/wiki";
import { fetchNews } from "../lib/news";
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
export function companyRegulationProblems(events: TimelineEvent[], edgarName: string, min = 1): string[] {
  const out = eventProblems(events, min);
  const unnamed = events.filter((e) => !titleNamesCompany(e.title, edgarName));
  if (unnamed.length) out.push(`${unnamed.length} titles that don't name ${edgarName}, e.g. "${unnamed[0].title}"`);
  const directives = events.filter((e) => isAirworthinessDirective(e.title));
  if (directives.length) out.push(`${directives.length} airworthiness directives, e.g. "${directives[0].title}"`);
  if (events.some((e) => e.date < FR_COMPANY_SINCE)) out.push(`a document dated before the ${FR_COMPANY_SINCE} floor`);
  if (events.length > FR_COMPANY_CAP) out.push(`${events.length} documents, over the cap of ${FR_COMPANY_CAP}`);
  return out;
}

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
      if (filings.some((f) => !f.url?.startsWith("https://www.sec.gov/Archives/"))) {
        out.push("a filing link outside https://www.sec.gov/Archives/");
      }
      // Apple reports a shareholder vote (5.07) on an 8-K every year, so a recent block with no
      // 8-K named by its item means EDGAR's `items` column stopped arriving (proposal 1).
      if (!filings.some((f) => /\(8-K \d\.\d\d\)$/.test(f.title))) {
        out.push("no 8-K titled by its item — is EDGAR still sending `items`?");
      }
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
    name: "Yahoo chart — ten years of AAPL closes",
    covers: ["yahoo_prices"],
    hosts: ["query1.finance.yahoo.com"],
    async run() {
      const r = await fetchDailyPrices("AAPL");
      return [...outcomeProblems(r.outcome, r.detail), ...seriesProblems(r.points, 2000, 7)];
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
      // Ford petitions NHTSA over recalls several times a year, so the feed is never honestly empty.
      const r = await fetchCompanyRegulations("FORD MOTOR CO");
      return [...outcomeProblems(r.outcome, r.detail), ...companyRegulationProblems(r.events, "FORD MOTOR CO", 3)];
    },
  },
  {
    name: "Wikipedia — Ford Motor Company's history",
    covers: ["wikipedia"],
    hosts: ["en.wikipedia.org"],
    async run() {
      const story = await getTopicTimeline("Ford Motor Company");
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
