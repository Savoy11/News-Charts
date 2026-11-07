import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PoolClient } from "pg";
import tickerIndex from "../data/edgar-tickers.json";
import { ALSO_ON_SOURCE_IDS, alsoOnSql, groupAlsoOn } from "../lib/alsoOn";
import { cfpbEvents } from "../lib/cfpb";
import { cftcEvents } from "../lib/cftc";
import { commonName } from "../lib/edgarName";
import { aliasesFor } from "../lib/enrich/relevance";
import { fedPressEvents } from "../lib/fedPress";
import { frSearchTerm } from "../lib/frCompany";
import { backfillRegulations, namesForYear } from "../lib/ingest/frBackfill";
import { SOURCES } from "../lib/ingest/store";
import { secCaseEvents } from "../lib/secCases";
import { OWN_RECORD_FROM, ownPastLabelled, predecessorsOf } from "../lib/predecessors";
import { backfillNews } from "../lib/ingest/newsBackfill";
import {
  OWN_RECORD_SOURCES,
  OWN_RECORD_SOURCE_IDS,
  TAKEN_NAMES,
  hiddenAsTaken,
  takenBefore,
  thenNameIn,
  withoutTakenNames,
  yearSearchNames,
} from "../lib/takenNames";
import type { TimelineEvent } from "../lib/types";

/**
 * check:taken-names — a record that took a name another company had held (batch 117, the
 * 2026-11-07 audit's proposal): one table, lib/takenNames.ts, read by every rule that finds a
 * company by its name, at ingest and when a page is read. Offline: the Federal Register's walk
 * runs against a stand-in database and answer.
 */
let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`  ok  ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail === undefined ? "" : `\n       ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`);
  }
}
const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");

const T = 732717;
const CB = 896159;
const WFC = 72971;
const rows = tickerIndex.companies as [number, string, string][];
const nameOf = (cik: number) => rows.find(([c]) => c === cik)?.[2];

console.log("The table");
const entries = Object.entries(TAKEN_NAMES).map(([cik, t]) => ({ cik: Number(cik), ...t }));
check("32 records, each the ticker the committed index gives its CIK", entries.length === 32 && entries.every((e) => rows.some(([c, t]) => c === e.cik && t === e.ticker)),
  entries.filter((e) => !rows.some(([c, t]) => c === e.cik && t === e.ticker)).map((e) => `${e.ticker} ${e.cik}`));
check("  …each with a day, the accession of the filing that gives it, a kind and its reasons",
  entries.every((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.from) && /^\d{10}-\d{2}-\d{6}$/.test(e.filing) && ["bought", "merged", "namesake"].includes(e.kind) && e.why.length > 80 && e.why.includes(e.ticker)));
check("  …a name that its present name holds and its own names of before do not, read without state (no g or y flag)",
  entries.every((e) => {
    const present = nameOf(e.cik) ?? "";
    return (e.name.test(commonName(present)) || e.name.test(present)) && !e.then.test(present) && !/[gy]/.test(e.name.flags + e.then.flags);
  }),
  entries.filter((e) => !(e.name.test(commonName(nameOf(e.cik) ?? "")) || e.name.test(nameOf(e.cik) ?? "")) || e.then.test(nameOf(e.cik) ?? "")).map((e) => `${e.ticker}: ${nameOf(e.cik)}`));
check("the three names refused one source at a time before are here, on their days: Waste Management 1998-07-16, Biogen 2003-11-12, AT&T 2005-11-18",
  TAKEN_NAMES[823768]?.from === "1998-07-16" && TAKEN_NAMES[875045]?.from === "2003-11-12" && TAKEN_NAMES[T]?.from === "2005-11-18");

console.log("\nThe rule");
check("before the day, a row naming only the taken name is another company's: AT&T Corp.'s 2001 settlement, in capitals or not",
  takenBefore(T, "2001-05-01", "AT&T Corp. agrees to pay $1 million") && takenBefore(T, "1999-01-05", "AT&T CORP.") && takenBefore(String(T), "2005-11-17", "AT&T Wireless"));
check("  …a row naming the record's own name of the time too is the record's: \"SBC to acquire AT&T\", Cingular's purchase of AT&T Wireless, Pacific Bell's case with AT&T",
  !takenBefore(T, "2005-01-31", "SBC Communications to acquire AT&T Corp.") && !takenBefore(T, "2004-10-26", "Cingular completes acquisition of AT&T Wireless") &&
    !takenBefore(T, "1999-06-01", "PACIFIC BELL; AT&T COMMUNICATIONS OF CALIFORNIA"));
check("  …and from the day on, the name is the record's", !takenBefore(T, "2005-11-18", "AT&T Inc. completes merger") && !takenBefore(T, "2012-03-01", "AT&T Mobility"));
check("ACE's own news names ACE or Ace, as headlines write it, so it stays; \"an ace\" is no ACE, and old Chubb's 2015 results are not CB's",
  !takenBefore(CB, "2015-07-01", "Ace to Buy Chubb for $28 Billion") && !takenBefore(CB, "2015-07-01", "ACE LIMITED TO ACQUIRE CHUBB") && takenBefore(CB, "2015-04-21", "Chubb Corp first-quarter profit rises") &&
    takenBefore(CB, "2015-04-21", "Chubb, an ace at underwriting, reports"));
check("a company not in the table is never touched", !takenBefore(320193, "1990-01-01", "Apple Computer") && !takenBefore(null, "1990-01-01", "AT&T Corp.") && !takenBefore(undefined, "1990-01-01", "AT&T"));

console.log("\nAt ingest");
const ev = (date: string, title: string, description?: string): TimelineEvent => ({ id: title, date, type: "news", title, source: "x", ...(description ? { description } : {}) });
const news = [ev("2004-06-01", "AT&T Corp. cuts 7,000 jobs"), ev("2004-06-02", "SBC and AT&T settle"), ev("2006-01-03", "AT&T Inc. starts the year"), ev("2003-01-02", "Phone rates rise", "AT&T Corp. raised them")];
check("a source that finds a company by name keeps none of its old namesake's rows, the description read too",
  withoutTakenNames(news, T, "gdelt").map((e) => e.date).join() === "2004-06-02,2006-01-03" && withoutTakenNames(news, T, "doj_press").length === 2);
check("  …while the record's own sources keep every row: SBC's own 8-K titled \"AT&T Shareholders Approve Merger\" is SBC's",
  withoutTakenNames([ev("2005-07-21", "AT&T Shareholders Approve Merger")], T, "sec_edgar").length === 1 && withoutTakenNames(news, 320193, "gdelt").length === 4 && withoutTakenNames(news, undefined, "gdelt").length === 4);
const sourceKeys = SOURCES.map((s) => s.key);
check("every source is read one way or the other: the record's own (its filings, its prices, the macro and on-chain feeds, its Wikipedia article) or by name",
  OWN_RECORD_SOURCES.every((k) => sourceKeys.includes(k)) && OWN_RECORD_SOURCE_IDS.join() === OWN_RECORD_SOURCES.map((k) => SOURCES.find((s) => s.key === k)!.id).join() &&
    OWN_RECORD_SOURCES.length === 8 && !OWN_RECORD_SOURCE_IDS.some((id) => ALSO_ON_SOURCE_IDS.includes(id)),
  OWN_RECORD_SOURCES.filter((k) => !sourceKeys.includes(k)));
const ingest = read("scripts/ingest.ts");
const at = (s: string, x: string) => s.indexOf(x);
check("  …ingest reads every source's answer by it before storing, as part of the answer, so a complete answer still takes a stored row off",
  at(ingest, "result = { ...result, events: withoutTakenNames(result.events, scoring?.cik, sourceKey) };") > 0 &&
    at(ingest, "withoutTakenNames(result.events") < at(ingest, "const events = transform(result.events);") &&
    /cik: company\.cik \}/.test(ingest) && /cik: resolved\.cik \}/.test(read("lib/ingest/firstPass.ts")));
check("  …and so do the Federal Register's and GDELT's walks, which store their own",
  /withoutTakenNames\(result\.events, plan\.scoring\.cik, "federal_register"\)/.test(read("lib/ingest/frBackfill.ts")) && /plan\.scoring\.cik,\s*"gdelt"/.test(read("lib/ingest/newsBackfill.ts")));

console.log("\nEvery caption rule");
const tNames = () => ["AT&T", "AT&T Inc.", "SBC Communications Inc", "SBC Communications"];
const lr = (day: string, caption: string) => ({ listing: "litigation" as const, number: `LR-${day}`, day, caption, url: `https://www.sec.gov/litigation/litreleases/${day}.htm` });
check("an SEC case against AT&T Corp. in 2002 is not T's; one against AT&T Inc. in 2010 is, and one against SBC in 2003",
  secCaseEvents([lr("2002-03-01", "AT&T Corp.")], tNames, { cik: T }).length === 0 && secCaseEvents([lr("2010-03-01", "AT&T Inc.")], tNames, { cik: T }).length === 1 &&
    secCaseEvents([lr("2003-03-01", "SBC Communications Inc.")], tNames, { cik: T }).length === 1);
const wfNames = () => ["Wells Fargo", "Wells Fargo & Company", "Norwest Corporation", "Norwest"];
const fed = (day: string, title: string) => ({ day, title, type: "Orders on Banking Applications" as const, url: `https://www.federalreserve.gov/x/${day}.htm` });
check("the Board's 1996 order on Wells Fargo & Company is old Wells Fargo's, not WFC's, whose record was Norwest's; its 1999 one is WFC's",
  fedPressEvents([fed("1996-03-28", "Approval of proposal by Wells Fargo & Company to acquire First Interstate Bancorp")], wfNames, { cik: WFC }).length === 0 &&
    fedPressEvents([fed("1999-06-01", "Approval of proposal by Wells Fargo & Company to acquire a bank")], wfNames, { cik: WFC }).length === 1 &&
    fedPressEvents([fed("1997-06-01", "Approval of proposal by Norwest Corporation to acquire a bank")], wfNames, { cik: WFC }).length === 1,
  fedPressEvents([fed("1999-06-01", "Approval of proposal by Wells Fargo & Company to acquire a bank")], wfNames, { cik: WFC }).map((e) => e.title));
const cbNames = () => ["Chubb", "Chubb Limited", "ACE Limited", "ACE"];
check("a CFPB action against Chubb in 2014 would be old Chubb's; one of 2019 is CB's",
  cfpbEvents([{ day: "2014-05-01", title: "Chubb Corporation", path: "/enforcement/actions/chubb-2014/", description: "x" }], cbNames, { cik: CB }).length === 0 &&
    cfpbEvents([{ day: "2019-05-01", title: "Chubb Limited", path: "/enforcement/actions/chubb-2019/", description: "x" }], cbNames, { cik: CB }).length === 1);
check("a CFTC order against AT&T Corp. in 2001 is not T's; against AT&T Inc. in 2015 it is",
  cftcEvents([{ day: "2001-01-02", path: "/PressRoom/PressReleases/1-01", title: "CFTC Orders AT&T Corp. to Pay" }], tNames(), { cik: T }).length === 0 &&
    cftcEvents([{ day: "2015-01-02", path: "/PressRoom/PressReleases/1-15", title: "CFTC Orders AT&T Inc. to Pay" }], tNames(), { cik: T }).length === 1);
const rule = (f: string) => /takenBefore\(cik, /.test(read(f));
check("  …and EPA's, the CPSC's and the FDA's approvals read the same table (their saved-data checks hold the cases)",
  ["lib/epaCases.ts", "lib/cpscRecalls.ts", "lib/fdaApprovals.ts", "lib/secCases.ts", "lib/fedPress.ts", "lib/cfpb.ts", "lib/cftc.ts"].every(rule) &&
    !/before\?: string/.test(read("lib/epaCases.ts").split("export const NOT_THE_COMPANY")[1].split("\n")[0]) && !/\bbefore\?:/.test(read("lib/fdaApprovals.ts").split("export const NOT_THE_APPLICANT")[1].split("\n")[0]));

console.log("\nWhen a page is read");
check("a stored row of the old namesake's, by name, is left off; one the record's own source attests stays",
  hiddenAsTaken(T, "2001-05-01", "AT&T Corp. settles", [23]) && hiddenAsTaken(T, "2001-05-01", "AT&T Corp. settles", ["3", "23"]) && !hiddenAsTaken(T, "2001-05-01", "AT&T Corp. settles", [4, 23]) &&
    !hiddenAsTaken(T, "2007-05-01", "AT&T settles", [23]) && !hiddenAsTaken(T, "2001-05-01", "SBC and AT&T settle", [23]));
const readTs = read("lib/store/read.ts");
check("  …in the page's read, before its row is built, by the row's own attestations",
  /if \(hiddenAsTaken\(r\.subject_cik, date, `\$\{r\.title\} \$\{r\.body \?\? ""\}`, r\.attestation_sources\)\) return \[\];/.test(readTs) && /return rows\.flatMap\(\(r\) =>/.test(readTs));
const grouped = groupAlsoOn([
  { event_id: "7", ticker: "T", display_name: "AT&T", cik: String(T), occurred_on: "1999-04-01", title: "EPA consent decree with 3 parties", body: "against AT&T CORP. and 2 other defendants" },
  { event_id: "7", ticker: "VZ", display_name: "Verizon", cik: "732712", occurred_on: "1999-04-01", title: "EPA consent decree with 3 parties", body: "against BELL ATLANTIC" },
  { event_id: "8", ticker: "T", display_name: "AT&T", cik: String(T), occurred_on: "2009-04-01", title: "EPA final order", body: "AT&T INC." },
]);
check("another page's \"Also on\" does not send a reader to T for AT&T Corp.'s 1999 case, which T's page leaves off; T's own case of 2009 it names",
  grouped.get(7)?.shown.map((c) => c.ticker).join() === "VZ" && grouped.get(7)?.total === 1 && grouped.get(8)?.shown[0]?.ticker === "T",
  [...grouped]);
check("  …which reads the other row's company, day and text in the same query",
  /o\.cik, e2\.occurred_on::text AS occurred_on, e2\.title, e2\.body/.test(alsoOnSql(ALSO_ON_SOURCE_IDS)) && /JOIN events e2 ON e2\.id = b\.event_id/.test(alsoOnSql(ALSO_ON_SOURCE_IDS)));

console.log("\nThe Federal Register's years");
const tFormer = [
  { name: "SBC COMMUNICATIONS INC", until: "2005-11-18" },
  { name: "SOUTHWESTERN BELL CORP", until: "1995-04-26" },
];
const y = (year: number) => yearSearchNames(T, year, "AT&T INC.", namesForYear(year, ["AT&T"], tFormer), tFormer);
check("T's 1994 is asked under Southwestern Bell's name, its 2000 under SBC's, neither with AT&T; 2005, the year it took the name, keeps both; 2010 its own",
  y(1994).edgarName === "SOUTHWESTERN BELL CORP" && y(2000).edgarName === "SBC COMMUNICATIONS INC" && !y(2000).names.includes("AT&T") && !/AT&T/.test(frSearchTerm(y(2000).edgarName, y(2000).names)) &&
    y(2005).edgarName === "AT&T INC." && y(2010).edgarName === "AT&T INC." && y(2005).names.includes("AT&T"),
  [1994, 2000, 2005].map((n) => frSearchTerm(y(n).edgarName, y(n).names)));
check("  …a company not in the table, or one with no former name of the time, keeps its names",
  yearSearchNames(320193, 1995, "Apple Inc.", ["Apple Computer"], []).edgarName === "Apple Inc." && yearSearchNames(T, 1995, "AT&T INC.", ["AT&T"], []).edgarName === "AT&T INC.");

// the walk, against a stand-in database and answer
async function walk() {
  const windows = new Map<string, string>();
  const stored: TimelineEvent[] = [];
  const asked: { year: number; edgarName?: string; names: string[] }[] = [];
  const client = {
    query: async (sql: string, params: unknown[] = []) => {
      const s = sql.trim();
      if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(s)) return { rows: [] };
      if (/FROM prices/.test(s)) return { rows: [{ listed: "1983-11-21" }] };
      if (/^SELECT starts_on/.test(s)) return { rows: [...windows].map(([starts_on, query]) => ({ starts_on, query })) };
      if (/^SELECT commercial_ok FROM sources/.test(s)) return { rows: [{ commercial_ok: true }] };
      if (/FROM source_fetches/.test(s)) return { rows: [{ mine: null, latest: null }] };
      if (/^INSERT INTO source_fetches/.test(s)) return { rows: [] };
      if (/^INSERT INTO fr_windows/.test(s)) {
        windows.set(String(params[1]), String(params[2]));
        return { rows: [] };
      }
      throw new Error(`unexpected query: ${s.slice(0, 80)}`);
    },
  } as unknown as PoolClient;
  const ctx = { kind: "company" as const, displayName: "AT&T INC.", ticker: "T" };
  await backfillRegulations(
    client,
    1,
    { edgarName: "AT&T INC.", alsoKnownAs: ["AT&T"], scoring: { subject: ctx, aliases: aliasesFor(ctx, ["AT&T"]), cik: T } },
    {
      today: "2007-03-01",
      gapMs: 0,
      budget: { left: 100 },
      former: tFormer,
      fetch: async (year, names, edgarName) => {
        asked.push({ year, edgarName, names });
        const doc = (d: string, title: string): TimelineEvent => ({ id: title, date: d, type: "regulation", title, source: "Federal Register", sourceKey: "federal_register" });
        const events = year === 2005 ? [doc("2005-03-01", "AT&T Corp.; Order"), doc("2005-12-01", "AT&T Inc.; Order"), doc("2005-04-01", "SBC Communications and AT&T Corp.; Merger")] : [];
        return { events, documents: events.length, outcome: events.length ? "ok" : "empty" };
      },
      store: async (events) => {
        stored.push(...events);
      },
    },
  );
  return { asked, stored, windows };
}
// batch 118: GDELT's months before the day, asked under the record's own name of then
async function newsWalk(ticker: "CZR" | "LUMN") {
  const asked: { from: string; query: string }[] = [];
  const kept: { title: string; aliases: string[] }[] = [];
  const client = {
    query: async (sql: string) => {
      const s = sql.trim();
      if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(s)) return { rows: [] };
      if (/FROM prices/.test(s)) return { rows: [{ listed: ticker === "CZR" ? "2014-09-22" : "1980-03-17" }] };
      if (/^SELECT starts_on/.test(s)) return { rows: [] };
      if (/^SELECT commercial_ok FROM sources/.test(s)) return { rows: [{ commercial_ok: true }] };
      if (/FROM source_fetches/.test(s)) return { rows: [{ mine: null, latest: null }] };
      if (/^INSERT INTO (source_fetches|gdelt_windows)/.test(s)) return { rows: [] };
      throw new Error(`unexpected query: ${s.slice(0, 80)}`);
    },
  } as unknown as PoolClient;
  const name = ticker === "CZR" ? "Caesars Entertainment" : "Lumen Technologies";
  const ctx = { kind: "company" as const, displayName: name, ticker };
  const ev = (d: string, title: string): TimelineEvent => ({ id: `${title}@${d}`, date: d, type: "news", title, source: "GDELT", sourceKey: "gdelt" });
  await backfillNews(
    client,
    1,
    { query: name, alsoKnownAs: [], byRelevance: false, scoring: { subject: ctx, aliases: aliasesFor(ctx, [name]), cik: ticker === "CZR" ? 1590895 : 18926 } },
    {
      today: ticker === "CZR" ? "2020-10-15" : "2020-03-15",
      gapMs: 0,
      budget: { left: 200 },
      former:
        ticker === "CZR"
          ? [{ name: "Eldorado Resorts, Inc.", until: "2020-07-17" }, { name: "Eclair Holdings Co", until: "2014-09-19" }]
          : [{ name: "CENTURYLINK, INC", until: "2021-01-20" }],
      fetch: async (w, ask) => {
        asked.push({ from: w.from, query: ask?.asked ?? "" });
        const events =
          w.from === "2019-06-01"
            ? [ev("2019-06-24", "Eldorado Resorts to buy Caesars Entertainment"), ev("2019-06-10", "Eldorado Resorts profit rises"), ev("2019-06-05", "Caesars Entertainment quarterly loss")]
            : w.from === "2020-08-01"
              ? [ev("2020-08-03", "Caesars Entertainment reopens Las Vegas casinos")]
              : [];
        return { events, outcome: events.length ? "ok" : "empty" };
      },
      store: async (events, scoring) => {
        for (const e of events) kept.push({ title: e.title, aliases: scoring?.aliases ?? [] });
      },
    },
  );
  return { asked, kept };
}

walk().then(async ({ asked, stored, windows }) => {
  const of = (year: number) => asked.find((a) => a.year === year);
  check("the walk asks 1994–2004 under the record's own names and 2005–2006 under both, and stores no AT&T Corp. order of 2005 before the day",
    of(1994)?.edgarName === "SOUTHWESTERN BELL CORP" && of(2004)?.edgarName === "SBC COMMUNICATIONS INC" && of(2005)?.edgarName === "AT&T INC." && of(2006)?.edgarName === "AT&T INC." &&
      stored.map((e) => e.title).join(" | ") === "AT&T Inc.; Order | SBC Communications and AT&T Corp.; Merger" && windows.get("2005-01-01") !== undefined && !/AT&T/.test(windows.get("2000-01-01") ?? "AT&T"),
    { asked: asked.map((a) => `${a.year} ${a.edgarName}`), stored: stored.map((e) => e.title), q2000: windows.get("2000-01-01") });

  console.log("\nThe scan that keeps the table whole");
  const scan = JSON.parse(read("scripts/fixtures/taken-names-scan.json")) as {
    companies: { cik: number; ticker: string; since: string | null; first: string | null; reading: string; why?: string; others: [number, string][] }[];
  };
  const c = scan.companies;
  const readings = new Map<string, number>();
  for (const x of c) readings.set(x.reading, (readings.get(x.reading) ?? 0) + 1);
  check("173 companies whose present name an older record carried, each read: 32 took it from another company, 25 had it by their first price, 86 are the same company's other record, 30 for the other reasons",
    c.length === 173 && readings.get("taken") === 32 && readings.get("before") === 25 && readings.get("own") === 86 && new Set(c.map((x) => x.cik)).size === 173 &&
      [...readings.keys()].every((k) => ["taken", "before", "own", "brand", "new", "business", "history", "short", "shared", "namesake", "nostart", "noprice"].includes(k)),
    Object.fromEntries(readings));
  check("  …every one the table holds is read \"taken\" in the scan, and every \"taken\" in the scan is in the table",
    c.filter((x) => x.reading === "taken").every((x) => TAKEN_NAMES[x.cik]?.ticker === x.ticker) && entries.every((e) => c.some((x) => x.cik === e.cik && x.reading === "taken")));
  check("  …\"before\" is a name that began by the first price; every reading by hand says why",
    c.filter((x) => x.reading === "before").every((x) => !!x.since && !!x.first && x.since <= x.first) &&
      c.filter((x) => !["taken", "before", "nostart", "noprice"].includes(x.reading)).every((x) => (x.why ?? "").length > 6));
  check("  …and each taken name's day falls after the company's first price: before it there is a past on the page to read",
    entries.every((e) => {
      const x = c.find((y) => y.cik === e.cik)!;
      return !!x.first && e.from > x.first;
    }),
    entries.map((e) => `${e.ticker} ${c.find((y) => y.cik === e.cik)?.first} < ${e.from}`));
  // batch 118: batch 117's three namesakes dated, and the tickers whose history is another record's mapped
  check("  …no namesake is left undated: Lightbridge, Valor Energy and Meridian Holdings are in the table (batch 118), with Dawson",
    !c.some((x) => x.reading === "namesake") && ["LTBR", "VAI", "MRDN", "DWSN"].every((t) => c.find((x) => x.ticker === t)?.reading === "taken"));
  check("  …and every ticker whose history is another record's is mapped to it, its record's own past labelled, as Merck's: MRK, SSYS, WCN",
    c.filter((x) => x.reading === "history").map((x) => x.ticker).sort().join() === "MRK,SSYS,WCN" &&
      c.filter((x) => x.reading === "history").every((x) => predecessorsOf(x.cik).length > 0 && !!OWN_RECORD_FROM[x.cik] && OWN_RECORD_FROM[x.cik].from === predecessorsOf(x.cik)[0].until));

  console.log("\nBatch 118: what the scan left open");
  const DWSN = 799165;
  check("TGC's record took Dawson Geophysical's name and ticker on 2015-02-11, and DWSN's chart before is TGC's: old Dawson's 2013 news is not DWSN's, the merger's own is",
    takenBefore(DWSN, "2013-05-01", "Dawson Geophysical wins seismic contract") && !takenBefore(DWSN, "2014-10-09", "TGC Industries and Dawson Geophysical to merge") &&
      !takenBefore(DWSN, "2016-01-01", "Dawson Geophysical reports"));
  check("  …and the three namesakes are dated: Lightbridge from 2009-09-21, Valor Energy from 2026-08-25, Meridian Holdings from 2026-02-26",
    TAKEN_NAMES[1084554]?.from === "2009-09-21" && TAKEN_NAMES[1711012]?.from === "2026-08-25" && TAKEN_NAMES[1437925]?.from === "2026-02-26" &&
      takenBefore(1084554, "2006-04-01", "Lightbridge, Inc. reports results") && !takenBefore(1084554, "2007-03-01", "Thorium Power and Lightbridge sign"));
  const linFormer = [{ name: "ZAMALIGHT PLC", until: "2017-07-12" }];
  check("a record with no name of its own before the day asks those years under the present name, never its merger's shell: Linde plc's 2017 is not \"Zamalight\", Six Flags' 2023 not \"CopperSteel\"",
    thenNameIn(1707925, "2017-01-01", "2017-12-31", linFormer) === null && yearSearchNames(1707925, 2017, "LINDE PLC", ["Linde Group"], linFormer).edgarName === "LINDE PLC" &&
      yearSearchNames(1999001, 2023, "Six Flags Entertainment Corporation/NEW", [], [{ name: "CopperSteel HoldCo, Inc.", until: "2024-06-26" }]).edgarName === "Six Flags Entertainment Corporation/NEW" &&
      entries.filter((e) => e.noOwnNameBefore).map((e) => e.ticker).sort().join() === "FUN,LIN");
  check("  …a former name holding the taken name is still the record's own where it holds its then-name too: \"SCP POOL CORP\" for SCP Pool's 2005",
    thenNameIn(945841, "2005-01-01", "2005-12-31", [{ name: "SCP POOL CORP", until: "2006-05-11" }]) === "SCP POOL CORP" &&
      yearSearchNames(945841, 2005, "POOL CORP", ["SCP Pool"], [{ name: "SCP POOL CORP", until: "2006-05-11" }]).names.join() === "SCP Pool");
  const objet = { date: "2012-06-01", title: "Objet Ltd.: Registration (F-4)", source: "SEC EDGAR", url: "https://www.sec.gov/Archives/edgar/data/1517396/000110465912000001/x.htm" };
  const iesi = { date: "2014-02-01", title: "EPA final order (Clean Air Act)", source: "EPA", description: "IESI NY CORPORATION (case 02-2014-0001)" };
  const wcn = { date: "2014-02-01", title: "EPA final order (Clean Air Act)", source: "EPA", description: "WASTE CONNECTIONS OF KANSAS, INC. (case 07-2014-0001)" };
  check("Stratasys's and Waste Connections's histories are the old records', to their mergers; Objet's and Progressive Waste's own past before says whose, theirs does not",
    predecessorsOf(1517396)[0]?.cik === 915735 && predecessorsOf(1517396)[0]?.until === "2012-12-04" && predecessorsOf(1318220)[0]?.cik === 1057058 &&
      predecessorsOf(1318220)[0]?.until === "2016-06-07" && ownPastLabelled(objet, 1517396).source === "SEC EDGAR · Objet, before its 2012 merger with Stratasys" &&
      ownPastLabelled(iesi, 1318220).source === "EPA · Progressive Waste Solutions, before its 2016 merger with Waste Connections" && ownPastLabelled(wcn, 1318220).source === "EPA",
    [ownPastLabelled(objet, 1517396).source, ownPastLabelled(iesi, 1318220).source, ownPastLabelled(wcn, 1318220).source]);
  const czr = await newsWalk("CZR");
  const q = (from: string) => czr.asked.find((a) => a.from === from)?.query ?? "";
  check("GDELT's months before Eldorado took Caesars's name are asked as Eldorado Resorts, from July 2020 as Caesars Entertainment",
    /Eldorado Resorts/.test(q("2019-06-01")) && !/Caesars/.test(q("2019-06-01")) && /Eldorado Resorts/.test(q("2020-06-01")) && /Caesars Entertainment/.test(q("2020-07-01")) &&
      /Caesars Entertainment/.test(q("2020-08-01")) && czr.asked.length === 45,
    czr.asked.filter((a) => ["2019-06-01", "2020-06-01", "2020-07-01"].includes(a.from)));
  check("  …kept when a headline names either name and not only the taken one, and scored with both: Eldorado's buy and its results, not old Caesars's loss",
    czr.kept.map((k) => k.title).join(" | ") === "Caesars Entertainment reopens Las Vegas casinos | Eldorado Resorts to buy Caesars Entertainment | Eldorado Resorts profit rises" &&
      czr.kept[2].aliases.some((a) => /eldorado/i.test(a)) && !czr.kept[0].aliases.some((a) => /eldorado/i.test(a)),
    czr.kept);
  const lumn = await newsWalk("LUMN");
  check("  …while a then-name that is a one-word name not yet measured leaves its months under today's names: CenturyLink's 2020 is asked as Lumen Technologies",
    lumn.asked.length === 38 && lumn.asked.every((a) => /Lumen Technologies/.test(a.query) && !/CENTURYLINK/i.test(a.query)), lumn.asked.slice(0, 2));

  console.log(failures ? `\n${failures} check(s) failed` : "\nall taken-name checks passed");
  process.exit(failures ? 1 : 0);
});
