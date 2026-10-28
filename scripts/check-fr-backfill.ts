import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PoolClient } from "pg";
import {
  FR_COMPANY_CAP,
  FR_COMPANY_FROM,
  fetchCompanyRegulations,
  fetchCompanyYear,
  frDailySince,
  frSearchTerm,
  issuingAgency,
  pageRegulations,
  routineNoticeAgency,
  type YearResult,
} from "../lib/frCompany";
import {
  GAP_MS,
  YEARS_PER_RUN,
  backfillRegulations,
  closedYears,
  namesForYear,
  relabelAgencies,
  storedFormerNames,
  type FormerName,
} from "../lib/ingest/frBackfill";
import { renameEvents } from "../lib/sec";
import { aliasesFor } from "../lib/enrich/relevance";
import type { TimelineEvent } from "../lib/types";

/**
 * A company's Federal Register documents back to 1994, every one a year holds (batch 63, the
 * 2026-10-26 proposal 1), and its routine notices grouped a row a month (the owner, 2026-10-26).
 *
 *   npm run check:fr-backfill
 *
 * The feed read from 2015 and kept the newest forty, so each run read the same forty: GM's 51
 * since 2015 reached its page as 40, and nothing before 2015 at all. Offline by construction: the
 * Federal Register and the database are stand-ins. On the code before this batch none of it runs —
 * the year walk and the grouping did not exist, and the daily ask read from 2015.
 */

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

interface Db {
  windows: Map<string, { query: string; documents: number; kept: number }>;
  renames: { until: string; body: string }[];
  fetches: { query: string; outcome: string }[];
  relabels: { ids: string[]; labels: string[] }[];
  latest: string | null;
  /** the company's first stored price, or null when it has none */
  listed: string | null;
  /** the days its Federal Register documents were taken off it before, and how many each time */
  unlinks: string[];
  stale: number;
}

/** Just enough of a pg client for the year walk's own statements. */
function fakeDb(db: Db): PoolClient {
  return {
    query: async (sql: string, params: unknown[] = []) => {
      const s = sql.trim();
      if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(s)) return { rows: [] };
      if (/FROM events e/.test(s)) return { rows: db.renames };
      if (/FROM prices/.test(s)) return { rows: [{ listed: db.listed }] };
      if (/^DELETE FROM event_subjects/.test(s) && /federal_register/.test(s)) {
        db.unlinks.push(String(params[1]));
        return { rows: [], rowCount: db.stale };
      }
      if (/^SELECT starts_on/.test(s)) return { rows: [...db.windows].map(([starts_on, w]) => ({ starts_on, query: w.query })) };
      if (/^SELECT commercial_ok FROM sources/.test(s)) return { rows: [{ commercial_ok: true }] };
      if (/FROM source_fetches/.test(s)) return { rows: [{ mine: null, latest: db.latest }] };
      if (/^INSERT INTO source_fetches/.test(s)) {
        db.fetches.push({
          query: String(params.find((p) => typeof p === "string" && p.includes("·")) ?? ""),
          outcome: String(params.find((p) => ["throttled", "error", "ok", "empty"].includes(String(p)))),
        });
        return { rows: [] };
      }
      if (/^INSERT INTO fr_windows/.test(s)) {
        const [, from, query, documents, kept] = params as [number, string, string, number, number];
        db.windows.set(from, { query, documents, kept });
        return { rows: [] };
      }
      if (/^UPDATE event_attestations/.test(s)) {
        db.relabels.push({ ids: params[0] as string[], labels: params[1] as string[] });
        return { rows: [] };
      }
      throw new Error(`unexpected query: ${s.slice(0, 80)}`);
    },
  } as unknown as PoolClient;
}
// Ford's prices begin in 1972, before the Federal Register's company years do
const freshDb = (listed: string | null = "1972-06-01"): Db => ({ windows: new Map(), renames: [], fetches: [], relabels: [], latest: null, listed, unlinks: [], stale: 0 });

const FORD = { kind: "company" as const, displayName: "FORD MOTOR CO", ticker: "F" };
const fordPlan = { edgarName: "FORD MOTOR CO", alsoKnownAs: [], scoring: { subject: FORD, aliases: aliasesFor(FORD, ["Ford"]) } };
const TODAY = "2026-10-27";

/** A Federal Register document as the API returns it. */
const frDoc = (n: string, title: string, date: string, type = "Notice", agencies = [{ name: "Transportation Department", parent_id: null as number | null }]) => ({
  document_number: n, title, publication_date: date, type, html_url: `https://www.federalregister.gov/d/${n}`, agencies,
});
/** Stands in for the API: `answer(url)` is the JSON for that request; every URL asked is kept. */
async function withApi<T>(answer: (url: URL) => unknown, run: (asked: URL[]) => Promise<T>): Promise<T> {
  const realFetch = globalThis.fetch;
  const asked: URL[] = [];
  globalThis.fetch = (async (u: RequestInfo | URL) => {
    const url = new URL(String(u));
    asked.push(url);
    return new Response(JSON.stringify(answer(url)), { status: 200 });
  }) as typeof fetch;
  try {
    return await run(asked);
  } finally {
    globalThis.fetch = realFetch;
  }
}
const param = (u: URL, k: string) => u.searchParams.get(k);

(async () => {
  console.log("\nThe years a company is read for");
  const years = closedYears(TODAY);
  check("every year from 1994 to last year, newest first", years.length === 32 && years[0] === 2025 && years[31] === 1994 &&
    FR_COMPANY_FROM === "1994-01-01", `${years.length}: ${years[0]}…${years[years.length - 1]}`);
  check("  …never the year still running, which the daily ask reads", !years.includes(2026) &&
    frDailySince(new Date(`${TODAY}T12:00:00Z`)) === "2026-01-01");

  console.log("\nThe daily ask reads the current year, at most forty");
  await withApi(
    () => ({ results: Array.from({ length: 60 }, (_, i) => frDoc(`2026-0${1000 + i}`, `Ford Motor Company; Petition ${i}`, "2026-05-01")) }),
    async (asked) => {
      const r = await fetchCompanyRegulations("FORD MOTOR CO");
      check("its search starts on the current year's first day, not 2015", param(asked[0], "conditions[publication_date][gte]") === frDailySince(),
        param(asked[0], "conditions[publication_date][gte]") ?? "");
      check(`  …and keeps at most ${FR_COMPANY_CAP}`, r.events.length === FR_COMPANY_CAP, String(r.events.length));
    }
  );

  console.log("\nA year is read in full, every page, with no cap");
  await withApi(
    (u) => {
      const page = Number(param(u, "page") ?? 1);
      const titles = page === 1
        ? Array.from({ length: 1000 }, (_, i) => frDoc(`E3-${i}`, i % 20 === 0 ? "Commercial Space Launch Requirements" : `Ford Motor Company; Receipt of Petition ${i}`, "2003-06-01"))
        : Array.from({ length: 60 }, (_, i) => frDoc(`E3-p2-${i}`, `Ford Motor Company; Grant of Petition ${i}`, "2003-02-01"));
      return { count: 1060, results: titles, next_page_url: page === 1 ? "https://www.federalregister.gov/api/v1/documents?page=2" : null };
    },
    async (asked) => {
      const r = await fetchCompanyYear("FORD MOTOR CO", 2003);
      check("both pages are read, within the year", asked.length === 2 && param(asked[1], "page") === "2" &&
        param(asked[0], "conditions[publication_date][gte]") === "2003-01-01" && param(asked[0], "conditions[publication_date][lte]") === "2003-12-31",
        asked.map((u) => param(u, "page") ?? "1").join(","));
      check("  …and every document whose title names Ford is kept, past forty: 950 + 60", r.events.length === 1010 && r.documents === 1060,
        `${r.events.length} of ${r.documents}`);
    }
  );

  console.log("\nThe issuing board, not its department");
  check("a Surface Transportation Board notice is labelled the board's",
    issuingAgency([{ name: "Transportation Department", parent_id: null }, { name: "Surface Transportation Board", parent_id: 492 }]) === "Surface Transportation Board");
  check("  …though the API lists the board with no parent, as it does (measured 2026-10-27)",
    issuingAgency([{ name: "Transportation Department", parent_id: null }, { name: "Surface Transportation Board", parent_id: null }]) === "Surface Transportation Board");
  check("  …FERC under Energy, as listed with its parent",
    issuingAgency([{ name: "Energy Department", parent_id: null }, { name: "Federal Energy Regulatory Commission", parent_id: 136 }]) === "Federal Energy Regulatory Commission");
  check("  …and a document of one agency, or of several independent ones, keeps the first",
    issuingAgency([{ name: "Federal Trade Commission", parent_id: null }]) === "Federal Trade Commission" &&
      issuingAgency([{ name: "Federal Reserve System", parent_id: null }, { name: "Comptroller of the Currency", parent_id: null }]) === "Federal Reserve System");
  await withApi(
    () => ({ results: [frDoc("E7-1", "CSX Transportation, Inc.-Abandonment Exemption-in Clay County, IL", "2007-05-25", "Notice",
      [{ name: "Transportation Department", parent_id: null }, { name: "Surface Transportation Board", parent_id: null }])], next_page_url: null }),
    async () => {
      const r = await fetchCompanyYear("CSX CORP", 2007);
      check("  …on the stored row's source", r.events[0]?.source === "Federal Register · Surface Transportation Board", r.events[0]?.source);
    }
  );

  console.log("\nThe year walk");
  const db = freshDb();
  const asked: number[] = [];
  const stored: TimelineEvent[] = [];
  const doc2003: TimelineEvent = {
    id: "fr-03-1", date: "2003-04-30", type: "regulation", title: "Ford Motor Company; Receipt of Application for Decision of Inconsequential Noncompliance",
    source: "Federal Register · National Highway Traffic Safety Administration", sourceKey: "federal_register", externalId: "03-10562", dedupBasis: "fr:03-10562",
  };
  const answer = async (year: number): Promise<YearResult> => {
    asked.push(year);
    return year === 2003 ? { events: [doc2003], documents: 37, outcome: "ok" } : { events: [], documents: 0, outcome: "empty" };
  };
  const first = await backfillRegulations(fakeDb(db), 1, fordPlan, { today: TODAY, gapMs: 0, budget: { left: 100 }, fetch: answer, store: async (e) => { stored.push(...e); } });
  check("a 2003 Ford document reaches the company", stored.some((e) => e.date === "2003-04-30") && db.windows.get("2003-01-01")?.kept === 1,
    `${stored.length} stored`);
  check("  …each of the 32 years asked once, newest first, and kept", first.read === 32 && asked[0] === 2025 && db.windows.size === 32,
    `${first.read} read, ${db.windows.size} kept`);
  check("  …under the search the daily ask makes", db.windows.get("2003-01-01")?.query === frSearchTerm("FORD MOTOR CO", []),
    db.windows.get("2003-01-01")?.query);
  asked.length = 0;
  const again = await backfillRegulations(fakeDb(db), 1, fordPlan, { today: TODAY, gapMs: 0, budget: { left: 100 }, fetch: answer, store: async () => {} });
  check("a closed year is not asked twice", again.due === 0 && asked.length === 0, `${again.due} due, ${asked.length} asked`);
  const nextYear = await backfillRegulations(fakeDb(db), 1, fordPlan, { today: "2027-01-02", gapMs: 0, budget: { left: 100 }, fetch: answer, store: async () => {} });
  check("  …and when a year ends, it alone is asked", nextYear.read === 1 && asked.join() === "2026", asked.join());

  const budget = { left: 5 };
  const spent = await backfillRegulations(fakeDb(freshDb()), 2, fordPlan, { today: TODAY, gapMs: 0, budget, fetch: answer, store: async () => {} });
  check(`a process asks at most its budget, ${YEARS_PER_RUN} years by default, ${GAP_MS} ms apart`,
    spent.read === 5 && spent.left === 27 && budget.left === 0 && /spent/.test(spent.stopped ?? ""), `${spent.read} read, ${spent.left} left`);

  const refused = freshDb();
  let n = 0;
  const throttled = await backfillRegulations(fakeDb(refused), 3, fordPlan, {
    today: TODAY, gapMs: 0, budget: { left: 100 },
    fetch: async () => (++n === 3 ? { events: [], documents: 0, outcome: "throttled", httpStatus: 429 } : { events: [], documents: 0, outcome: "empty" }),
    store: async () => {},
  });
  check("a refusal stops the walk, is logged, and its year is not kept", throttled.stopped === "throttled" && throttled.read === 2 &&
    refused.fetches[0]?.outcome === "throttled" && /· 2023$/.test(refused.fetches[0]?.query) && !refused.windows.has("2023-01-01"),
    JSON.stringify(refused.fetches));

  // batch 71: asked from 1994, Dow Inc. (listed 2019) kept 2010's "Dow Jones & Company, Sharon
  // Pennsylvania Print Plant…" and three "Dow Corning Corporation" zone notices, scored as its own
  const dowDb = freshDb("2019-03-20");
  dowDb.stale = 4;
  const dowAsked: number[] = [];
  const dow = await backfillRegulations(fakeDb(dowDb), 5, { ...fordPlan, edgarName: "Dow Inc." }, {
    today: TODAY, gapMs: 0, budget: { left: 100 },
    fetch: async (year) => { dowAsked.push(year); return { events: [], documents: 0, outcome: "empty" }; },
    store: async () => {},
  });
  check("a company is not asked for the years before its first price: Dow Inc., listed 2019, never for 2010's Dow Jones and Dow Corning notices (batch 71)",
    dow.read === 7 && dowAsked[0] === 2025 && dowAsked[dowAsked.length - 1] === 2019 && !dowAsked.includes(2010), dowAsked.join(","));
  check("  …and what a walk before the fix kept from those years comes off it", dow.unlinked === 4 && dowDb.unlinks.join() === "2019-03-20" &&
    db.unlinks.length === 0, `${dow.unlinked} unlinked before ${dowDb.unlinks.join()}; Ford: ${db.unlinks.length} asked`);
  const unpriced: number[] = [];
  const none = await backfillRegulations(fakeDb(freshDb(null)), 6, fordPlan, {
    today: TODAY, gapMs: 0, budget: { left: 100 },
    fetch: async (year) => { unpriced.push(year); return { events: [], documents: 0, outcome: "empty" }; },
    store: async () => {},
  });
  check("  …and a company with no prices is not asked at all, as the GDELT month walk is not", none.due === 0 && unpriced.length === 0 &&
    none.stopped === "no prices to start from", JSON.stringify(none));

  console.log("\nFormer names, for the years they were in use");
  const walmart: FormerName[] = [{ name: "WAL MART STORES INC", until: "2018-02-01" }];
  check("Walmart's 1999 search carries \"Wal-Mart Stores\"", frSearchTerm("Walmart Inc.", namesForYear(1999, [], walmart)).includes('"WAL MART STORES"'),
    frSearchTerm("Walmart Inc.", namesForYear(1999, [], walmart)));
  check("  …so does 2018, the year it stopped", namesForYear(2018, [], walmart).length === 1);
  check("  …and 2019's does not", !frSearchTerm("Walmart Inc.", namesForYear(2019, [], walmart)).includes("WAL MART"));
  await withApi(
    () => ({ results: [frDoc("99-7377", "Wal-Mart Stores, Inc.; Analysis to Aid Public Comment", "1999-03-26", "Notice", [{ name: "Federal Trade Commission", parent_id: null }])], next_page_url: null }),
    async () => {
      const r = await fetchCompanyYear("Walmart Inc.", 1999, namesForYear(1999, [], walmart));
      check("  …and the FTC's 1999 consent order counts through it", r.events.length === 1 && /Wal-Mart Stores/.test(r.events[0].title));
      const after = await fetchCompanyYear("Walmart Inc.", 2019, namesForYear(2019, [], walmart));
      check("  …where after the rename the same title would not", after.events.length === 0);
    }
  );
  const wmDb = freshDb();
  // the body the filings step writes for a rename, read back as the walk reads it
  const [renamed] = renameEvents([{ on: "2018-02-01", from: "WAL MART STORES INC", to: "Walmart Inc." }], { cik: "0000104169", ticker: "WMT", name: "Walmart Inc." });
  wmDb.renames = [{ until: renamed.date, body: renamed.description ?? "" }];
  const formerRead = await storedFormerNames(fakeDb(wmDb), 4);
  check("the former names come from the rename events the filings step stores",
    formerRead.length === 1 && formerRead[0].name === "WAL MART STORES INC" && formerRead[0].until === "2018-02-01", JSON.stringify(formerRead));
  const wmAsked: string[] = [];
  await backfillRegulations(fakeDb(wmDb), 4, { ...fordPlan, edgarName: "Walmart Inc." }, {
    today: TODAY, gapMs: 0, budget: { left: 100 },
    fetch: async (year, names) => { wmAsked.push(`${year}:${names.join("+")}`); return { events: [], documents: 0, outcome: "empty" }; },
    store: async () => {},
  });
  check("  …and the walk searches each year under them", wmAsked.includes("1999:WAL MART STORES") && wmAsked.includes("2019:"),
    wmAsked.filter((a) => /^(1999|2019)/.test(a)).join(" "));
  const before = wmDb.windows.get("2019-01-01")?.query;
  wmDb.renames.push({ until: "2021-06-30", body: "EDGAR's company record lists WALMART STORES HOLDINGS as a former name of this filer, in use until this day." });
  wmAsked.length = 0;
  await backfillRegulations(fakeDb(wmDb), 4, { ...fordPlan, edgarName: "Walmart Inc." }, {
    today: TODAY, gapMs: 0, budget: { left: 100 },
    fetch: async (year, names) => { wmAsked.push(`${year}:${names.join("+")}`); return { events: [], documents: 0, outcome: "empty" }; },
    store: async () => {},
  });
  check("a newly known former name has its years asked again, and no others",
    wmAsked.length === 28 && wmAsked[0].startsWith("2021:") && wmAsked[wmAsked.length - 1].startsWith("1994:") && wmDb.windows.get("2019-01-01")?.query !== before,
    `${wmAsked.length} asked, ${wmAsked[0]} … ${wmAsked[wmAsked.length - 1]}`);

  const relabel = freshDb();
  await relabelAgencies(fakeDb(relabel), [{ ...doc2003, source: "Federal Register · Surface Transportation Board", externalId: "E7-1" }]);
  check("a re-read year corrects a stored row's department label to its board's",
    relabel.relabels[0]?.ids[0] === "E7-1" && relabel.relabels[0]?.labels[0] === "Federal Register · Surface Transportation Board");
  check("  …which the walk's store does after storing", /await relabelAgencies\(client, events\)/.test(read("lib/ingest/frBackfill.ts")));

  console.log("\nRoutine notices, a row a month (the owner, 2026-10-26)");
  const row = (title: string, date: string, agency: string, description = "Notice"): TimelineEvent => ({
    id: `fr-${title}-${date}`, date, type: "regulation", title, source: `Federal Register · ${agency}`, url: `https://www.federalregister.gov/d/${date}-${title.length}`, description,
  });
  const STB = "Surface Transportation Board";
  const FERC = "Federal Energy Regulatory Commission";
  const july = [
    row("Union Pacific Railroad Company-Abandonment Exemption-in Weld County, CO", "2004-07-09", STB),
    row("BNSF Railway Company-Temporary Trackage Rights Exemption-Union Pacific Railroad Company", "2004-07-20", STB),
    row("Union Pacific Railroad Company-Abandonment Exemption-in Monterey County, CA", "2004-07-29", STB),
  ];
  const control = row("Union Pacific Corporation and Union Pacific Railroad Company-Control-Norfolk Southern Corporation", "2004-07-15", STB);
  const lone = row("Union Pacific Railroad Company-Abandonment Exemption-in Ouachita County, AR", "2006-05-31", STB);
  const ferc = [
    row("Duke Energy Carolinas, LLC; Notice of Filing", "2011-02-24", FERC),
    row("Duke Energy Carolinas, LLC; Notice of Application for Amendment of License", "2011-02-10", FERC),
  ];
  const complaint = row("Duke Energy Indiana, LLC v. AEP Indiana Michigan Transmission Company, Inc.; Notice of Complaint", "2011-02-15", FERC);
  const nhtsa = row("Ford Motor Company, Receipt of Petition for Decision of Inconsequential Noncompliance", "2004-07-12", "National Highway Traffic Safety Administration");
  const stbRule = row("Union Pacific Railroad Company-Abandonment Exemption-Final Rule", "2004-07-21", STB, "Rule");
  const icc = [
    row("CSX Transportation, Inc.Abandonment Exemptionin Thomas County, GA", "1995-05-04", "Interstate Commerce Commission", "Uncategorized Document"),
    row("CSX Transportation, Inc.Trackage Rights ExemptionVaughan Railroad Company", "1995-05-30", "Interstate Commerce Commission"),
  ];
  const oldLabel = row("CSX Transportation, Inc.-Abandonment Exemption-in Clay County, IL", "2004-07-22", "Transportation Department");
  const page = pageRegulations([...july, control, lone, ...ferc, complaint, nhtsa, stbRule, oldLabel, ...icc]);
  const grouped = page.find((e) => e.id === "fr-routine-surface-transportation-board-2004-07");
  check("a month's three rail-board exemptions become one month row", grouped?.precision === "month" && grouped.date === "2004-07-01" &&
    grouped.title === `${STB}: 3 routine notices` && !page.some((e) => july.includes(e)), grouped?.title);
  check("  …saying what it holds, its link the newest", grouped?.url === july[2].url && /Weld County/.test(grouped?.description ?? "") &&
    /grouped into one row/.test(grouped?.description ?? ""), grouped?.description?.slice(0, 90));
  check("  …while a control case in the same month keeps its dated row", page.includes(control) && routineNoticeAgency(control) === null);
  // batch 71: the Federal Register gives the 1990s titles with their words run together
  const conrail = row("CSX Corporation and CSX Transportation, Inc., Norfolk Southern Corporation and Norfolk Southern Railway CompanyControl and Operating Leases/Agreements Conrail Inc. and Consolidated Rail Corporation", "1997-04-21", STB);
  const conrailJoined = row("CSX Corporation and CSX Transportation, Inc., Norfolk Southern Corporation and Norfolk Southern Railway CompanyControl and Operating Leases/AgreementsConrail, Inc. and Consolidated Rail Corporation", "1997-07-07", STB);
  check("  …and so does CSX's 1997 Conrail control case, its words run together as the Federal Register gives them (batch 71)",
    routineNoticeAgency(conrail) === null && routineNoticeAgency(conrailJoined) === null);
  const listening = row("Public Listening Session Regarding CSX Transportation, Inc.'s Rail Service Issues; Joint Petition of Foresight Coal Sales, LLC, Sugar Camp Energy, LLC, Williamson Energy, LLC, and Consolidation Coal Company To Address the Adequacy of CSX Transportation's Coal Transportation Service Originating in the Illinois Basin and Northern Appalachia", "2017-08-30", STB);
  check("  …and the board's 2017 hearing on CSX's rail service, a joint petition", routineNoticeAgency(listening) === null);
  check("  …and a lone notice in its month keeps its own", page.includes(lone));
  check("two FERC notices in a month are grouped, its complaint is not",
    page.some((e) => e.id === "fr-routine-federal-energy-regulatory-commission-2011-02" && e.title === `${FERC}: 2 routine notices`) && page.includes(complaint));
  check("the ICC's 1995 notices group too, one the Federal Register left uncategorized",
    page.some((e) => e.id === "fr-routine-interstate-commerce-commission-1995-05" && e.title === "Interstate Commerce Commission: 2 routine notices"));
  check("another agency's notice, and a board's rule, stay as they were", page.includes(nhtsa) && page.includes(stbRule));
  check("  …as does a row still under its department's label, until a re-read year corrects it", page.includes(oldLabel));
  check("  …and every row is in date order", page.every((e, i) => i === 0 || page[i - 1].date <= e.date));
  check("the company page groups them as it reads, after the prospectus grouping",
    /pageRegulations\(pageFilings\(/.test(read("lib/page-data.ts")));

  console.log("\nWiring");
  check("the walk keeps its years in fr_windows (db/031)",
    /CREATE TABLE IF NOT EXISTS fr_windows/.test(read("db/031_fr_windows.sql")) && /INSERT INTO fr_windows/.test(read("lib/ingest/frBackfill.ts")));

  console.log(`\n${pass}/${pass + fail} checks passed`);
  if (fail) process.exit(1);
})();
