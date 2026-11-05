import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import type { PoolClient } from "pg";
import tickerIndex from "../data/edgar-tickers.json";
import { CFPB_FROM, CFPB_PAGE_SIZE, NOT_THE_COMPANY, cfpbEvents, parseCfpbList, respondents, type CfpbAction, type CfpbAnswer } from "../lib/cfpb";
import { dojPossessive } from "../lib/doj";
import { withoutTag } from "../lib/edgarName";
import { deterministicScore } from "../lib/enrich/relevance";
import { companyNames } from "../lib/frCompany";
import { LIST_PAGES, PAGES_PER_RUN, cfpbFor, storedCfpbActions, walkCfpb, type CfpbWalk } from "../lib/ingest/cfpbWalk";
import { namesForYear } from "../lib/ingest/frBackfill";
import { QUOTAS } from "../lib/ingest/quota";
import { SOURCE_TTL_MINUTES } from "../lib/ingest/refresh";
import { SOURCES } from "../lib/ingest/store";
import { RELEASE_NAMES, isNotesRecord, releaseNamesAsked, releaseNamesOn } from "../lib/releaseNames";
import { newsNamesFor, possessiveNameFor } from "../lib/sec";
import type { TimelineEvent } from "../lib/types";
import { COMPANY_SOURCES } from "./ingest";

/**
 * The Consumer Financial Protection Bureau's enforcement actions on the pages of the companies
 * they name as respondents, from 2012 (batch 89, the 2026-11-02 proposal 5, a source the owner
 * approved on 2026-11-02).
 *
 *   npm run check:cfpb
 *
 * The actions are real: every one the Bureau's list held on 2026-11-05, 386, and its first and last
 * pages as served (scripts/fixtures/cfpb-actions.json.gz), so the replay below runs every action
 * against every company and every fund series in the committed index. Offline by construction: the
 * Bureau and the database are stand-ins. On the code before this batch none of it runs: the adapter
 * does not exist.
 */

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const fixture: { readOn: string; actions: [day: string, path: string, title: string, description: string][]; first: string; last: string } = JSON.parse(
  gunzipSync(readFileSync(join(process.cwd(), "scripts/fixtures/cfpb-actions.json.gz"))).toString("utf8"),
);
const actions: CfpbAction[] = fixture.actions.map(([day, path, title, description]) => ({ day, path, title, description }));
const companies = tickerIndex.companies as [number, string, string][];
const rowOf = (ticker: string) => {
  const r = companies.find(([, t]) => t === ticker);
  if (!r) throw new Error(`no ${ticker} in the ticker index`);
  return r;
};

/** The names a company's ingest reads a title by in `year`, its legal name among them, from the committed indexes (former names are ingest's). */
function namesOf(ticker: string): (year: number) => string[] {
  const [cik, , title] = rowOf(ticker);
  const own = dojPossessive(title, possessiveNameFor(cik));
  return (year) => [...companyNames(title, namesForYear(year, newsNamesFor(cik), [])), ...(own ? [own] : []), withoutTag(title)];
}
/** The company's events from the saved actions, as ingest keeps them, from `from` (its first price). */
function eventsOf(ticker: string, { from = "", units = true }: { from?: string; units?: boolean } = {}): TimelineEvent[] {
  const cik = rowOf(ticker)[0];
  if (isNotesRecord(cik)) return [];
  return cfpbEvents(actions, namesOf(ticker), { cik, from, namesOn: (day) => (units ? releaseNamesOn(cik, day) : []) });
}
const on = (ticker: string, day: string, opts?: { from?: string; units?: boolean }) => eventsOf(ticker, opts).find((e) => e.date === day);

/**
 * Every action against every company and every fund series in the index, under the names ingest
 * reads them by (current names: former names and first prices are ingest's, so a company's names
 * are the same each year). Each company is handed only the actions whose letters and digits hold
 * one of its names or units, as `cfpbEvents` itself would read no further, so the replay takes
 * seconds.
 */
function replay(): { companies: [string, TimelineEvent[]][]; funds: [string, TimelineEvent[]][] } {
  const alnum = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
  const letters = actions.map((a) => alnum(a.title));
  const holding = (keys: string[]) => actions.filter((_, i) => keys.some((k) => letters[i].includes(k)));
  const run = (cik: number, title: string, units: boolean): TimelineEvent[] => {
    const own = dojPossessive(title, possessiveNameFor(cik));
    const names = [...companyNames(title, namesForYear(2026, newsNamesFor(cik), [])), ...(own ? [own] : []), withoutTag(title)];
    const keys = [...new Set([...names, ...(units ? releaseNamesAsked(cik) : [])].map(alnum).filter((k) => k.length >= 2))];
    const held = holding(keys);
    return held.length ? cfpbEvents(held, () => names, { cik, namesOn: (day) => (units ? releaseNamesOn(cik, day) : []) }) : [];
  };
  const out: [string, TimelineEvent[]][] = [];
  const seen = new Set<number>();
  for (const [cik, ticker, title] of companies) {
    if (seen.has(cik) || isNotesRecord(cik)) continue;
    seen.add(cik);
    const got = run(cik, title, true);
    if (got.length) out.push([ticker, got]);
  }
  const funds: [string, TimelineEvent[]][] = [];
  const series = tickerIndex.seriesNames as string[];
  const named = new Set<string>();
  series.forEach((name, i) => {
    const cik = (tickerIndex.seriesCiks as number[])[i];
    if (named.has(`${cik}:${name}`)) return;
    named.add(`${cik}:${name}`);
    const got = run(cik, name, false);
    if (got.length) funds.push([(tickerIndex.seriesSymbols as string[])[i], got]);
  });
  return { companies: out, funds };
}

interface Db {
  actions: Map<string, CfpbAction>;
  /** each read kind and how many days ago it was made */
  reads: Map<"list" | "newest", { pages: number; actions: number; listed: number | null; ageDays: number }>;
  listed: string | null;
  renames: { until: string; body: string }[];
  doubled: number;
}
const freshDb = (listed: string | null = "1990-01-02"): Db => ({ actions: new Map(), reads: new Map(), listed, renames: [], doubled: 0 });
function fakeDb(db: Db): PoolClient {
  return {
    query: async (sql: string, params: unknown[] = []) => {
      const s = sql.trim();
      if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(s)) return { rows: [] };
      const old = /make_interval\(days => (\d+)\)/.exec(s);
      if (/^SELECT kind, read_at < now\(\)/.test(s) && old) {
        return { rows: [...db.reads].map(([kind, r]) => ({ kind, old: r.ageDays > Number(old[1]), stale: r.ageDays > 1 })) };
      }
      if (/^SELECT path FROM cfpb_actions$/.test(s)) return { rows: [...db.actions.keys()].map((path) => ({ path })) };
      if (/^INSERT INTO cfpb_actions \(path, filed_on, title, description\)/.test(s)) {
        const [paths, days, titles, descriptions] = params as [string[], string[], string[], string[]];
        if (new Set(paths).size !== paths.length) {
          db.doubled++;
          throw new Error("ON CONFLICT DO UPDATE command cannot affect row a second time");
        }
        let changed = 0;
        paths.forEach((path, i) => {
          const was = db.actions.get(path);
          if (!was || was.day !== days[i] || was.title !== titles[i] || was.description !== descriptions[i]) changed++;
          db.actions.set(path, { path, day: days[i], title: titles[i], description: descriptions[i] });
        });
        return { rows: [], rowCount: changed };
      }
      if (/^INSERT INTO cfpb_reads \(kind, pages, actions, listed\)/.test(s)) {
        const [kind, pagesRead, held, listed] = params as ["list" | "newest", number, number, number | null];
        db.reads.set(kind, { pages: pagesRead, actions: held, listed, ageDays: 0 });
        return { rows: [] };
      }
      if (/^SELECT path, filed_on::text AS day, title, description FROM cfpb_actions ORDER BY filed_on, path$/.test(s)) {
        return { rows: [...db.actions.values()].sort((a, b) => a.day.localeCompare(b.day) || a.path.localeCompare(b.path)) };
      }
      if (/FROM prices/.test(s)) return { rows: [{ listed: db.listed }] };
      if (/FROM events e/.test(s)) return { rows: db.renames };
      throw new Error(`unexpected query: ${s.slice(0, 80)}`);
    },
  } as unknown as PoolClient;
}
/** Ages every read by `days`. */
const age = (db: Db, days: number) => db.reads.forEach((r) => (r.ageDays += days));

/**
 * The Bureau's list as a stand-in: `served`, newest first, 25 a page, its count on every page, and
 * past the last page the last page again, as the Bureau serves it. `refuse` answers one page with
 * a refusal.
 */
function standIn(served: CfpbAction[], { refuse, noCount }: { refuse?: number; noCount?: boolean } = {}) {
  const asked: number[] = [];
  const last = Math.max(1, Math.ceil(served.length / CFPB_PAGE_SIZE));
  const fetchPage = async (page: number): Promise<CfpbAnswer> => {
    asked.push(page);
    if (page === refuse) return { actions: [], outcome: "throttled", httpStatus: 429 };
    const p = Math.min(page, last);
    return { actions: served.slice((p - 1) * CFPB_PAGE_SIZE, p * CFPB_PAGE_SIZE), ...(noCount ? {} : { total: served.length }), outcome: "ok", httpStatus: 200 };
  };
  return { asked, fetchPage };
}
const newAction = (n: number): CfpbAction => ({ day: "2025-09-01", path: `/enforcement/actions/stand-in-${n}/`, title: `Stand-In Lender ${n}, LLC`, description: "A stand-in." });

(async () => {
  console.log("The Bureau's list, as served on 2026-11-05");
  const first = parseCfpbList(fixture.first);
  const last = parseCfpbList(fixture.last);
  check("the first page holds 25 actions, newest first, and the list's count of every action, 386",
    first.actions.length === 25 && first.total === 386 && first.actions[0].day === "2025-08-21" && first.actions[0].title === "Synapse Financial Technologies, Inc." &&
      first.actions.every((a, i) => i === 0 || a.day <= first.actions[i - 1].day),
    `${first.actions.length} actions, count ${first.total}, first ${first.actions[0]?.day}`);
  check("  …each with the day filed, its page, its respondents and the Bureau's summary, its entities read",
    first.actions.every((a) => /^\d{4}-\d{2}-\d{2}$/.test(a.day) && a.path.startsWith("/enforcement/actions/") && a.title && a.description && !/&amp;|&#|<\//.test(a.title + a.description)) &&
      actions.some((a) => a.title === "Draper & Kramer Mortgage Corporation"));
  check("the last page holds the 11 oldest, down to the Bureau's first action, of 2012-07-17, and Capital One Bank's of 2012-07-18",
    last.actions.length === 11 && last.total === 386 && last.actions.at(-1)!.day === CFPB_FROM && last.actions.some((a) => a.day === "2012-07-18" && a.title === "Capital One Bank"));
  check("the saved list: 386 actions, each once, from 2012-07-17 to 2025-08-21, 164 of them before 2017 (the scout's count)",
    actions.length === 386 && new Set(actions.map((a) => a.path)).size === 386 && actions.at(-1)!.day === "2012-07-17" && actions[0].day === "2025-08-21" &&
      actions.filter((a) => a.day < "2017").length === 164,
    `${actions.length}, ${actions.filter((a) => a.day < "2017").length} before 2017`);
  check("a page with no action is no list, and no count", parseCfpbList("<html><body>Request rejected</body></html>").actions.length === 0 && parseCfpbList("<p>x</p>").total === undefined);

  console.log("\nThe proposal's cases, on the saved actions");
  check("Wells Fargo Bank's fine of 2016-09-08 lands on WFC, and Citibank's order of 2015-07-21 on C",
    /^CFPB enforcement action: Wells Fargo Bank, N\.A\.$/.test(on("WFC", "2016-09-08")?.title ?? "") && /^CFPB enforcement action: Citibank, N\.A\. and others$/.test(on("C", "2015-07-21")?.title ?? ""),
    `${on("WFC", "2016-09-08")?.title} · ${on("C", "2015-07-21")?.title}`);
  check("  …Capital One Bank's of 2012-07-18 on COF, by its unit — and without the unit, not",
    on("COF", "2012-07-18")?.title === "CFPB enforcement action: Capital One Bank" && !on("COF", "2012-07-18", { units: false }) &&
      on("COF", "2012-07-18")?.url === "https://www.consumerfinance.gov/enforcement/actions/capital-one-bank/");
  const discover = actions.filter((a) => /^Discover Bank\b/.test(a.title));
  const t0 = Date.now();
  const replayed = replay();
  const replayMs = Date.now() - t0;
  const takers = (path: string) => replayed.companies.filter(([, e]) => e.some((x) => (x.description ?? "").includes(actions.find((a) => a.path === path)!.title))).map(([t]) => t);
  check("Discover Bank's three actions (2012, 2015, 2020) land on no page, its owner's ticker gone from the index",
    discover.length === 3 && discover.every((a) => takers(a.path).length === 0) && !companies.some(([, t]) => t === "DFS"));
  const flagstar = actions.find((a) => a.title === "Flagstar Bank, F.S.B.")!;
  const flg = rowOf("FLG");
  // FLG's record took the Flagstar name after buying the bank in 2022; its name as the index gives
  // it carries "National Association", which the rule reads as part of the name, so the F.S.B. is
  // another party with no row of its own. Should "National Association" become a legal word, this
  // fails, and the order needs a row in NOT_THE_COMPANY.
  check("Flagstar Bank, F.S.B.'s of 2014-09-29 not on FLG, whose record took the Flagstar name only after buying the bank in 2022",
    flagstar.day === "2014-09-29" && !on("FLG", "2014-09-29") && flg[2] === "FLAGSTAR BANK, NATIONAL ASSOCIATION" && !NOT_THE_COMPANY[flg[0]] &&
      takers(flagstar.path).length === 0,
    flg[2]);
  check("Synchrony Bank's of 2014-06-19 refused by SYF's first price of 2014-07-31, and kept without it",
    !on("SYF", "2014-06-19", { from: "2014-07-31" }) && on("SYF", "2014-06-19")?.title === "CFPB enforcement action: Synchrony Bank and others");
  const amex = on("AXP", "2012-10-01");
  check("a day's three American Express actions make one event, each in its description",
    eventsOf("AXP").filter((e) => e.date === "2012-10-01").length === 1 && (amex?.description?.split(" · ").length ?? 0) === 3 &&
      amex?.title === "CFPB enforcement action: American Express Bank and others" && amex.dedupBasis === "cfpb:4962@2012-10-01" && amex.id === "cfpb-4962-2012-10-01",
    amex?.description?.slice(0, 120));
  check("  …the same event whatever order the actions came in",
    JSON.stringify(cfpbEvents([...actions].reverse(), namesOf("AXP"), { cik: 4962, namesOn: (d) => releaseNamesOn(4962, d) })) === JSON.stringify(eventsOf("AXP")));

  check("each namesake row names a ticker the index holds and matches one saved action",
    Object.entries(NOT_THE_COMPANY).every(([cik, list]) => list.every((n) => companies.some(([c, t]) => c === Number(cik) && t === n.ticker) && actions.filter((a) => n.title.test(a.title)).length === 1 && n.why.length > 40)));

  console.log("\nThe units the Bureau charges, each the company's while it owned it");
  check("the four mortgage insurers of 2013-04-04 on MTG, GNW, RDN and AIG, United Guaranty AIG's until its sale of 2016-12-31",
    ["MTG", "GNW", "RDN", "AIG"].every((t) => on(t, "2013-04-04")) && RELEASE_NAMES[5272].names[0].to === "2016-12-30" &&
      cfpbEvents([{ ...actions.find((a) => a.title === "United Guaranty Corporation")!, day: "2017-01-03" }], namesOf("AIG"), { cik: 5272, namesOn: (d) => releaseNamesOn(5272, d) }).length === 0);
  check("  …National City Bank's of 2013-12-23 on PNC, which bought it on 2008-12-31; Hudson City Savings Bank's of 2015-09-24, before M&T bought it, on no page",
    !!on("PNC", "2013-12-23") && RELEASE_NAMES[713676].names.find((n) => n.name === "National City Bank")?.from === "2008-12-31" &&
      takers(actions.find((a) => /^Hudson City Savings Bank/.test(a.title))!.path).length === 0);
  check("  …OneMain's of 2023-05-31 on OMF, from its purchase of OneMain Financial Holdings on 2015-11-15",
    !!on("OMF", "2023-05-31") && RELEASE_NAMES[1584207].names.every((n) => n.from === "2015-11-15"));
  check("  …Verizon Wireless's of 2015-05-12 on VZ, the Bureau's \"d/ba/\" read as \"d/b/a\"",
    !!on("VZ", "2015-05-12") && respondents("Cellco Partnership d/ba/ Verizon Wireless") === "Cellco Partnership d/b/a Verizon Wireless" &&
      respondents("Rocket Homes Real Estate LLC, dba Rocket Homes") === "Rocket Homes Real Estate LLC, d/b/a Rocket Homes" && respondents("Sandbar dba2 Inc") === "Sandbar dba2 Inc");
  check("  …Chase Bank USA's of 2015-07-08 on JPM, Santander Bank's of 2016-07-14 on SAN and on Santander Holdings USA, its owner, Trans Union LLC's of 2023-10-12 on TRU",
    !!on("JPM", "2015-07-08") && !!on("SAN", "2016-07-14") && !!on("SNUS-PI", "2016-07-14") && !!on("TRU", "2023-10-12"));
  const citi = on("C", "2017-01-23");
  check("  …CitiMortgage's and CitiFinancial Servicing's of 2017-01-23 one event on C, the Bureau's \"Citi Subsidiaries\"",
    citi?.description?.split(" · ").length === 2 && /CitiMortgage/.test(citi.description) && /CitiFinancial Servicing/.test(citi.description));
  check("not their own: the H&R Block a tax-refund lender once traded as (2015-04-14) not HRB, Sprint's of 2014 not TMUS, PayPal's of 2015-05-19 refused by PYPL's first price of 2015-07-06",
    !on("HRB", "2015-04-14") && !!cfpbEvents(actions.filter((a) => a.day === "2015-04-14"), namesOf("HRB"), { cik: 1 }).length &&
      !on("TMUS", "2014-12-17") && !on("PYPL", "2015-05-19", { from: "2015-07-06" }));

  // batch 90, the 2026-11-05 audit's finding 3: units the companies' own filings list, which no
  // name matched
  check("batch 90's units: Mastercard International's of 2017-02-01 on MA, Conduent's two of 2017-11-20 and 2019-05-01 on CNDT, Sterling Jewelers' of 2019-01-16 on SIG, Acima's of 2024-07-26 on UPBD — and none of them without the units",
    [["MA", "2017-02-01"], ["CNDT", "2017-11-20"], ["CNDT", "2019-05-01"], ["SIG", "2019-01-16"], ["UPBD", "2024-07-26"]].every(([t, d]) => !!on(t, d) && !on(t, d, { units: false })));
  const acima = actions.find((a) => a.path === "/enforcement/actions/acima-allred/")!;
  check("  …Acima only from its purchase on 2021-02-17, and GE Capital Retail Bank's two left off GE, the ownership call the proposal left to the owner",
    cfpbEvents([{ ...acima, day: "2021-02-16" }], namesOf("UPBD"), { cik: 933036, namesOn: (d) => releaseNamesOn(933036, d) }).length === 0 &&
      !on("GE", "2013-12-10") && !on("GE", "2014-06-19") && RELEASE_NAMES[933036].names.every((n) => n.from === "2021-02-17"));

  console.log("\nEvery saved action against every company and every fund series");
  const days = replayed.companies.flatMap(([, e]) => e);
  check("the 386 actions give 92 company days on 50 companies, 35 before 2017 (87 on 46 before batch 90's units, 44 on 21 without batch 89's), and no fund series takes one",
    days.length === 92 && replayed.companies.length === 50 && days.filter((e) => e.date < "2017").length === 35 && replayed.funds.length === 0,
    `${days.length} on ${replayed.companies.length}, ${days.filter((e) => e.date < "2017").length} before 2017, funds ${replayed.funds.length}, in ${replayMs} ms`);
  const counts = Object.fromEntries(replayed.companies.map(([t, e]) => [t, e.length]));
  const pinned: Record<string, number> = { BAC: 6, WFC: 6, C: 6, JPM: 5, USB: 4, AXP: 3, FITB: 3, EFX: 3, TRU: 3, SAN: 3 };
  check("  …Bank of America, Wells Fargo and Citigroup 6 each, JPMorgan 5, U.S. Bancorp 4, American Express, Fifth Third, Equifax, TransUnion and Santander 3",
    Object.entries(pinned).every(([t, n]) => counts[t] === n), JSON.stringify(Object.fromEntries(Object.keys(pinned).map((t) => [t, counts[t]]))));
  // Ingest reads a company's actions from its first price on (`cfpbFor`), which the replay sets
  // aside. Each company's first trading day, as Yahoo's firstTradeDate gave it (read 2026-11-05;
  // batch 90, the 2026-11-05 audit's finding 2).
  const FIRST_PRICES: Record<string, string> = { AAPL: "1980-12-12", ACIW: "1995-02-24", AIG: "1973-01-02", ALLY: "2014-01-28", AUB: "1993-10-06", AXP: "1972-06-01", BAC: "1973-02-21", C: "1977-01-03", CACC: "1992-06-05", CFG: "2014-09-24", CHYM: "2025-06-12", CNDT: "2016-12-13", COF: "1994-11-16", ECPG: "1999-07-09", EFX: "1980-03-17", ENVA: "2014-11-13", EZPW: "1991-08-27", FCFS: "1991-06-10", FITB: "1980-03-17", GNW: "2004-05-25", GS: "1999-05-04", HMC: "1980-03-17", JPM: "1980-03-17", MA: "2006-05-25", MTB: "1980-03-17", MTG: "1991-08-07", NAVI: "2014-04-17", OMF: "2013-10-16", ORI: "1980-03-17", PNC: "1975-11-17", PRAA: "2002-11-08", PYPL: "2015-07-06", RDN: "1992-10-30", RF: "1980-03-17", RKT: "2020-08-06", SAN: "1987-07-30", SIG: "1988-07-14", "SNUS-PI": "2026-08-28", SYF: "2014-07-31", TD: "1996-08-30", TM: "1980-03-17", TRMK: "1980-03-17", TRU: "2015-06-25", UPBD: "1995-01-25", USB: "1973-05-03", VZ: "1983-11-21", WAFD: "1982-11-09", WFC: "1972-06-01", WMT: "1972-08-25", XYZ: "2015-11-19" };
  const onPage = replayed.companies.map(([t, e]) => [t, e.filter((x) => x.date >= FIRST_PRICES[t])] as const).filter(([, e]) => e.length);
  const shown = onPage.flatMap(([, e]) => e);
  const off = replayed.companies.flatMap(([t, e]) => e.filter((x) => x.date < FIRST_PRICES[t]).map((x) => `${t} ${x.date}`)).sort();
  check("  …of which 87 reach a page on 45 companies, 31 before 2017: five fall before their company's first price — Ally's of 2013-12-20, Chime's of 2024-05-07, PayPal's of 2015-05-19, Santander Holdings USA's of 2016-07-14 and Synchrony's of 2014-06-19",
    replayed.companies.every(([t]) => t in FIRST_PRICES) && shown.length === 87 && onPage.length === 45 && shown.filter((e) => e.date < "2017").length === 31 &&
      off.join() === "ALLY 2013-12-20,CHYM 2024-05-07,PYPL 2015-05-19,SNUS-PI 2016-07-14,SYF 2014-06-19",
    `${shown.length} on ${onPage.length}, ${shown.filter((e) => e.date < "2017").length} before 2017; off: ${off.join(", ")}`);
  check("  …every event a regulation from the Bureau's own page, one a company a day",
    days.every((e) => e.type === "regulation" && e.sourceKey === "cfpb" && e.source === "Consumer Financial Protection Bureau" && !!e.url?.startsWith("https://www.consumerfinance.gov/enforcement/actions/")) &&
      replayed.companies.every(([, e]) => new Set(e.map((x) => x.date)).size === e.length));

  console.log("\nThe walk: the whole list once a month, its newest page once a day");
  const db = freshDb();
  const whole = standIn(actions);
  const firstWalk = await walkCfpb(fakeDb(db), { budget: { left: 100 }, gapMs: 0, fetchPage: whole.fetchPage });
  check("the first walk reads the whole list, 16 pages as its count says, not the 17th the Bureau would serve again, and stores every action",
    firstWalk.due === "list" && whole.asked.join() === Array.from({ length: 16 }, (_, i) => i + 1).join() && db.actions.size === 386 && firstWalk.actions === 386 && !firstWalk.short &&
      db.reads.get("list")?.listed === 386 && db.doubled === 0,
    `${firstWalk.due} ${whole.asked.join(",")} → ${db.actions.size}`);
  const again = standIn(actions);
  const sameDay = await walkCfpb(fakeDb(db), { budget: { left: 100 }, gapMs: 0, fetchPage: again.fetchPage });
  check("  …and a walk the same day asks nothing", sameDay.due === null && again.asked.length === 0);
  age(db, 2);
  const daily = standIn([newAction(1), ...actions]);
  const nextDay = await walkCfpb(fakeDb(db), { budget: { left: 100 }, gapMs: 0, fetchPage: daily.fetchPage });
  check("  …a day on, its newest page alone, which holds actions already kept, and the new one stored",
    nextDay.due === "newest" && daily.asked.join() === "1" && db.actions.has(newAction(1).path) && nextDay.actions >= 1);
  age(db, 2);
  const busy = standIn([...Array.from({ length: 30 }, (_, i) => newAction(100 + i)), ...actions]);
  const busyDay = await walkCfpb(fakeDb(db), { budget: { left: 100 }, gapMs: 0, fetchPage: busy.fetchPage });
  check("  …and the next page too while every action on a page is new", busyDay.due === "newest" && busy.asked.join() === "1,2" && db.actions.size === 386 + 31);
  age(db, 31);
  const month = standIn(actions.map((a) => (a.title === "Capital One Bank" ? { ...a, description: "Corrected." } : a)));
  const monthly = await walkCfpb(fakeDb(db), { budget: { left: 100 }, gapMs: 0, fetchPage: month.fetchPage });
  check("a month on, the whole list again, and a summary the Bureau corrected is stored corrected",
    monthly.due === "list" && month.asked.length === 16 && db.actions.get("/enforcement/actions/capital-one-bank/")?.description === "Corrected.");

  const refusedDb = freshDb();
  const refused = await walkCfpb(fakeDb(refusedDb), { budget: { left: 100 }, gapMs: 0, fetchPage: standIn(actions, { refuse: 5 }).fetchPage });
  check("a refused page stops the walk, stores nothing and says where; the list is due again",
    refused.stopped === "throttled" && refused.failure?.httpStatus === 429 && /page 5/.test(refused.failure?.detail ?? "") && refusedDb.actions.size === 0 && refusedDb.reads.size === 0);
  const spent = standIn(actions);
  const short = await walkCfpb(fakeDb(freshDb()), { budget: { left: LIST_PAGES - 1 }, gapMs: 0, fetchPage: spent.fetchPage });
  check("  …a whole list is begun only while its pages are left, and the run's budget is the Bureau's 16 pages and more",
    short.stopped === "this run's pages are spent" && spent.asked.length === 0 && PAGES_PER_RUN >= LIST_PAGES && LIST_PAGES > 16);
  const noCount = await walkCfpb(fakeDb(freshDb()), { budget: { left: 100 }, gapMs: 0, fetchPage: standIn(actions, { noCount: true }).fetchPage });
  check("  …a first page with no count is a failure, not a list of 25", noCount.failure?.outcome === "error" && /no count/.test(noCount.failure?.detail ?? ""));
  const huge = Array.from({ length: CFPB_PAGE_SIZE * LIST_PAGES + 1 }, (_, i) => newAction(1000 + i));
  const tooLong = await walkCfpb(fakeDb(freshDb()), { budget: { left: 100 }, gapMs: 0, fetchPage: standIn(huge).fetchPage });
  check("  …and a list longer than any it has held is a failure, nothing stored", tooLong.failure?.outcome === "error" && /more than 30 pages/.test(tooLong.failure?.detail ?? ""));
  const tiedDb = freshDb();
  const tied = await walkCfpb(fakeDb(tiedDb), { budget: { left: 100 }, gapMs: 0, fetchPage: async () => ({ actions: actions.slice(0, 25), total: 30, outcome: "ok", httpStatus: 200 }) });
  check("  …an action two pages show is stored once, and the actions the count holds but no page showed are reported",
    tiedDb.doubled === 0 && tiedDb.actions.size === 25 && tiedDb.reads.get("list")?.actions === 25 && tied.short === 5, `short ${tied.short}`);

  console.log("\nA company's actions, from what is kept");
  const kept = freshDb("1990-01-02");
  for (const a of actions) kept.actions.set(a.path, a);
  const ok: CfpbWalk = { due: null, pages: 0, actions: 0 };
  const plan = (ticker: string) => {
    const [cik, , title] = rowOf(ticker);
    return { edgarName: title, alsoKnownAs: newsNamesFor(cik), possessive: possessiveNameFor(cik), cik };
  };
  const wfc = await cfpbFor(fakeDb(kept), 1, plan("WFC"), ok);
  check("Wells Fargo's page gets its six action days, newest first", wfc.outcome === "ok" && wfc.events.length === 6 && wfc.events[0].date === "2024-12-20" && wfc.events.at(-1)!.date === "2015-01-22",
    wfc.events.map((e) => e.date).join(","));
  kept.renames = [{ until: "2024-06-03", body: "EDGAR's company record lists OCWEN FINANCIAL CORP as a former name of this filer, in use until this day." }];
  const onit = await cfpbFor(fakeDb(kept), 1, plan("ONIT"), ok);
  check("  …a company by its stored former name, in use that year: Ocwen's of 2013-12-19 and 2017-04-20 on Onity's page",
    ["2013-12-19", "2017-04-20"].every((d) => onit.events.some((e) => e.date === d)), onit.events.map((e) => e.date).join(","));
  kept.renames = [];
  const syf = await cfpbFor(fakeDb({ ...kept, listed: "2014-07-31" }), 1, plan("SYF"), ok);
  const syfEarlier = await cfpbFor(fakeDb(kept), 1, plan("SYF"), ok);
  check("  …from its first price only: Synchrony Bank's order of 2014-06-19, a month before SYF listed, is not its",
    syf.outcome === "empty" && syf.events.length === 0 && syfEarlier.events.map((e) => e.date).join() === "2014-06-19");
  const notes = await cfpbFor(fakeDb(kept), 1, { edgarName: "BARCLAYS BANK PLC", alsoKnownAs: [], cik: 312070 }, ok);
  const unpriced = await cfpbFor(fakeDb({ ...kept, listed: null }), 1, plan("WFC"), ok);
  const fund = await cfpbFor(fakeDb(kept), 1, { edgarName: "GROWTH FUND", alsoKnownAs: [], cik: 100334, fundSeries: true }, ok);
  const refusedWalk: CfpbWalk = { ...ok, due: "newest", stopped: "throttled", failure: { outcome: "throttled", httpStatus: 429, detail: "page 1" } };
  const still = await cfpbFor(fakeDb(kept), 1, plan("WFC"), refusedWalk);
  check("a notes record takes none, a fund's series none, no prices yet is a failure, and a refused walk still gives what is kept and reports the refusal",
    notes.outcome === "empty" && /notes record/.test(notes.detail ?? "") && fund.outcome === "empty" && /fund's series/.test(fund.detail ?? "") &&
      unpriced.outcome === "error" && /^no prices to start from/.test(unpriced.detail ?? "") && still.outcome === "throttled" && still.events.length === 6);
  check("  …the kept actions come back oldest first", (await storedCfpbActions(fakeDb(kept)))[0].day === "2012-07-17");

  console.log("\nRegistered, licensed, wired");
  const src = SOURCES.find((s) => s.key === "cfpb");
  check("the source is registered as public domain, the Bureau's words, cleared for commercial use, with the day its licence was read",
    src?.id === 30 && src.license === "public domain" && src.commercialOk && src.reviewedOn === "2026-11-05" && src.attribution === "Consumer Financial Protection Bureau" &&
      new Set(SOURCES.map((s) => s.id)).size === SOURCES.length,
    JSON.stringify(src));
  check("  …asked once a day per company, no published cap", SOURCE_TTL_MINUTES.cfpb === 1440 && QUOTAS.cfpb?.perDay === null);
  check("an action is scored without the model",
    deterministicScore({ eventId: 0, kind: "regulation", title: "CFPB enforcement action: Wells Fargo Bank, N.A.", sourceKey: "cfpb" }, { kind: "company", displayName: "Wells Fargo", ticker: "WFC" }, ["wells fargo"])?.score === 0.95);
  const ingest = read("scripts/ingest.ts");
  const company = ingest.slice(ingest.indexOf("export async function ingestCompany"), ingest.indexOf("\n}\n", ingest.indexOf("export async function ingestCompany")));
  check("company ingest walks the list, then keeps the company's actions under its names, by its CIK, after its prices",
    (COMPANY_SOURCES as readonly string[]).includes("cfpb") &&
      /await run\("cfpb", [^\n]+, async \(\) => \{\s+const walked = await walkCfpb\(client\);[\s\S]{0,400}return cfpbFor\(client, subjectId, \{ edgarName: company\.name, alsoKnownAs, possessive: dojPossessive\(company\.name, possessive\), cik: company\.cik, fundSeries \}, walked\);/.test(company) &&
      company.indexOf('await run("cfpb"') > company.indexOf("await companyPrices("));
  const migration = existsSync(join(process.cwd(), "db/035_cfpb_actions.sql")) ? read("db/035_cfpb_actions.sql") : "";
  check("the tables: every action by its page, and when the list was last read whole and its newest page",
    /CREATE TABLE IF NOT EXISTS cfpb_actions \(\s+path\s+text PRIMARY KEY/.test(migration) && /CREATE TABLE IF NOT EXISTS cfpb_reads/.test(migration) && /'list', 'newest'/.test(migration));
  check("check:feeds asks the newest page as ingest keeps it, and check:live reads the list and its oldest page",
    /reportFetch\("CFPB actions"/.test(read("scripts/check-feeds.ts")) && /"CFPB actions": "cfpb"/.test(read("scripts/check-feeds.ts")) && /covers: \["cfpb"\]/.test(read("scripts/check-live.ts")));
  check("the Bureau is credited on every page and in the terms",
    /Consumer Financial Protection Bureau/.test(read("app/layout.tsx")) && /Consumer Financial Protection Bureau/.test(read("app/legal/terms/page.tsx")));

  console.log(`\n${pass}/${pass + fail} checks passed`);
  if (fail) process.exit(1);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
