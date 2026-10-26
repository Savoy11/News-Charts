/**
 * A company's history across a change of SEC record (batch 53, the 2026-10-25 audit).
 *
 *   npm run check:predecessors
 *
 * A holding-company reorganisation gives the listed parent a new CIK, and EDGAR links the two
 * records nowhere: read from ExxonMobil Holdings Corp's record alone, XOM's page carried 8 filings
 * where Exxon Mobil Corporation's record holds 581 back to 1994. `lib/predecessors.ts` maps each
 * checked case; this proves the map is well formed against the committed index, that the filings
 * reader takes the predecessor's record up to the handover and no further, that its headlines are
 * read under the record they live in, and that its names reach the news.
 *
 * Offline by construction: EDGAR is a stand-in answering from records built here.
 */
import type { PoolClient } from "pg";
import tickerIndex from "../data/edgar-tickers.json";
import { PREDECESSORS, predecessorsOf } from "../lib/predecessors";
import { getFilingsDeep, newsNamesFor, type Rename } from "../lib/sec";
import { withSecHeadlines } from "../lib/ingest/headlines";
import { aliasesFor, mentions } from "../lib/enrich/relevance";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = ""): void => {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};

async function main(): Promise<void> {
  console.log("\nThe map, against the committed index");
  const companies = (tickerIndex as unknown as { companies: [number, string, string][] }).companies;
  const tickersOf = (cik: number) => companies.filter(([c]) => c === cik).map(([, t]) => t);
  const entries = Object.entries(PREDECESSORS).map(([s, ps]) => [Number(s), ps] as const);
  check("every successor is a listed company in the index", entries.every(([s]) => tickersOf(s).length > 0),
    entries.filter(([s]) => !tickersOf(s).length).map(([s]) => s).join(", "));
  check("no predecessor still lists a ticker of its own: its ticker passed on",
    entries.every(([, ps]) => ps.every((p) => tickersOf(p.cik).length === 0)),
    entries.flatMap(([, ps]) => ps.filter((p) => tickersOf(p.cik).length).map((p) => `${p.cik} ${tickersOf(p.cik)}`)).join(", "));
  check("every entry names its notice of succession and the day of it, newest first",
    entries.every(([s, ps]) =>
      ps.every((p, i) => p.cik !== s && /^\d{4}-\d{2}-\d{2}$/.test(p.until) && /^\d{10}-\d{2}-\d{6}$/.test(p.notice) && (i === 0 || p.until < ps[i - 1].until))
    ));
  check("XOM, GOOGL, DIS and BLK are mapped",
    ["XOM", "GOOGL", "DIS", "BLK"].every((t) => predecessorsOf(companies.find(([, tk]) => tk === t)![0]).length > 0));
  check("a company with no change of record has none", predecessorsOf(320193).length === 0);
  check("a start day, where one is set, falls before the handover",
    entries.every(([, ps]) => ps.every((p) => !p.since || (/^\d{4}-\d{2}-\d{2}$/.test(p.since) && p.since < p.until))));
  const cikOf = (t: string) => companies.find(([, tk]) => tk === t)?.[0] ?? -1;
  check("batch 55's are mapped: Ovintiv, Grupo Cibest, DraftKings; Weatherford three records back, Noble two",
    ["OVV", "CIB", "DKNG"].every((t) => predecessorsOf(cikOf(t)).length === 1) && predecessorsOf(cikOf("WFRD")).length === 3 && predecessorsOf(cikOf("NE")).length === 2,
    ["OVV", "CIB", "DKNG", "WFRD", "NE"].map((t) => `${t} ${predecessorsOf(cikOf(t)).length}`).join(", "));
  check("a merger into a new company, or a bought company's registration, is no predecessor: Linde, HF Sinclair, Baker Hughes, Pembina have none",
    ["LIN", "DINO", "BKR", "PBA"].every((t) => cikOf(t) > 0 && predecessorsOf(cikOf(t)).length === 0));

  console.log("\nThe filings reader takes the predecessor's record up to the handover");
  const XOM = { ticker: "XOM", cik: "0002115436", name: "ExxonMobil Holdings Corp" };
  const block = (rows: [string, string, string][]) => ({
    form: rows.map((r) => r[1]),
    filingDate: rows.map((r) => r[0]),
    accessionNumber: rows.map((r) => r[2]),
    primaryDocument: rows.map(() => "doc.htm"),
    items: rows.map(() => ""),
  });
  const records: Record<string, unknown> = {
    "0002115436": {
      name: "ExxonMobil Holdings Corp",
      formerNames: [],
      filings: { recent: block([["2026-10-16", "10-Q", "0002115436-26-000020"], ["2026-07-01", "8-K", "0001193125-26-291990"]]) },
    },
    "0000034088": {
      name: "EXXON MOBIL CORP",
      formerNames: [{ name: "EXXON CORP", from: "1994-01-01T00:00:00.000Z", to: "1999-11-30T00:00:00.000Z" }],
      filings: {
        recent: block([
          ["2026-09-25", "8-K", "0000034088-26-000090"], // the subsidiary's, after the handover
          ["2026-07-01", "8-K", "0001193125-26-291990"], // the same filing in both records
          ["2026-02-18", "10-K", "0000034088-26-000010"],
          ["2025-02-19", "10-K", "0000034088-25-000010"],
        ]),
        files: [{ name: "CIK0000034088-submissions-001.json" }],
      },
    },
    "CIK0000034088-submissions-001.json": block([["1994-03-04", "10-K", "0000034088-94-000004"]]),
  };
  const asked: string[] = [];
  const realFetch = globalThis.fetch;
  (globalThis as { fetch: unknown }).fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    asked.push(url);
    const key = /CIK(\d{10})\.json$/.exec(url)?.[1] ?? url.split("/").pop()!;
    const body = records[key];
    return { ok: body !== undefined, status: body ? 200 : 404, json: async () => body } as unknown as Response;
  };
  const renames: Rename[] = [];
  let events: Awaited<ReturnType<typeof getFilingsDeep>> = [];
  try {
    events = await getFilingsDeep(XOM, true, renames);
  } finally {
    globalThis.fetch = realFetch;
  }
  const byAccession = (a: string) => events.filter((e) => e.id === `sec-${a.replace(/-/g, "")}`);
  check("both records are asked for, and the predecessor's older shard", ["CIK0002115436.json", "CIK0000034088.json", "CIK0000034088-submissions-001.json"].every((f) => asked.some((u) => u.endsWith(f))),
    asked.map((u) => u.split("/").pop()).join(", "));
  check("the predecessor's annual reports before the handover are the company's, back to 1994",
    ["0000034088-26-000010", "0000034088-25-000010", "0000034088-94-000004"].every((a) => byAccession(a).length === 1) &&
      events.some((e) => e.date === "1994-03-04"),
    events.map((e) => `${e.date} ${e.title}`).join(" | "));
  check("  …titled with the company's present name, and linked at the record they live in",
    byAccession("0000034088-26-000010")[0]?.title === "ExxonMobil Holdings Corp: Annual report (10-K)" &&
      /\/Archives\/edgar\/data\/34088\//.test(byAccession("0000034088-26-000010")[0]?.url ?? ""),
    `${byAccession("0000034088-26-000010")[0]?.title} ${byAccession("0000034088-26-000010")[0]?.url}`);
  check("the predecessor's filings after the handover are a subsidiary's and left out", byAccession("0000034088-26-000090").length === 0);
  check("a filing both records carry is one row, the successor's",
    byAccession("0001193125-26-291990").length === 1 && /\/data\/2115436\//.test(byAccession("0001193125-26-291990")[0]?.url ?? ""));
  check("the predecessor's own rename before the handover is the company's: Exxon to Exxon Mobil, 1999",
    renames.some((r) => r.on === "1999-11-30" && r.from === "EXXON CORP") && events.some((e) => e.title === "Renamed from EXXON CORP to EXXON MOBIL CORP"));

  // BlackRock's predecessor took a subsidiary's name five days before its ticker passed on
  records["0002012383"] = { name: "BlackRock, Inc.", formerNames: [], filings: { recent: block([["2025-11-05", "10-Q", "0001193125-25-267043"]]) } };
  records["0001364742"] = {
    name: "BlackRock Finance, Inc.",
    formerNames: [
      { name: "New BlackRock, Inc.", from: "2006-01-01T00:00:00.000Z", to: "2006-09-29T00:00:00.000Z" },
      { name: "BlackRock Inc.", from: "2006-09-29T00:00:00.000Z", to: "2024-09-26T00:00:00.000Z" },
    ],
    filings: { recent: block([["2024-02-23", "10-K", "0001364742-24-000010"]]) },
  };
  (globalThis as { fetch: unknown }).fetch = async (input: RequestInfo | URL) => {
    const key = /CIK(\d{10})\.json$/.exec(String(input))?.[1] ?? "";
    const body = records[key];
    return { ok: body !== undefined, status: body ? 200 : 404, json: async () => body } as unknown as Response;
  };
  const blkRenames: Rename[] = [];
  let blk: Awaited<ReturnType<typeof getFilingsDeep>> = [];
  try {
    blk = await getFilingsDeep({ ticker: "BLK", cik: "0002012383", name: "BlackRock, Inc." }, false, blkRenames);
  } finally {
    globalThis.fetch = realFetch;
  }
  check("a predecessor's rename into a subsidiary's name at the handover is not the company's",
    !blk.some((e) => /BlackRock Finance/.test(e.title)) && !blkRenames.some((r) => /Finance/.test(r.to)),
    blk.filter((e) => e.type === "corporate_action").map((e) => e.title).join(" | "));
  check("  …while its earlier rename is", blk.some((e) => e.title === "Renamed from New BlackRock, Inc. to BlackRock Inc."),
    blk.filter((e) => e.type === "corporate_action").map((e) => e.title).join(" | "));
  check("  …and its annual report before the handover is on the page", blk.some((e) => e.id === "sec-000136474224000010"));

  // DraftKings' predecessor record began as a SPAC, Diamond Eagle, until the business merged in
  records["0001883685"] = { name: "DraftKings Inc.", formerNames: [], filings: { recent: block([["2023-02-17", "10-K", "0001883685-23-000010"]]) } };
  records["0001772757"] = {
    name: "DraftKings Holdings Inc.",
    formerNames: [
      { name: "Diamond Eagle Acquisition Corp. \\ DE", from: "2019-04-05T00:00:00.000Z", to: "2020-04-24T00:00:00.000Z" },
      { name: "DraftKings Inc.", from: "2020-04-24T00:00:00.000Z", to: "2022-05-05T00:00:00.000Z" },
    ],
    filings: { recent: block([["2022-02-18", "10-K", "0001772757-22-000010"], ["2021-02-26", "10-K", "0001772757-21-000010"], ["2020-03-02", "10-K", "0001772757-20-000010"]]) },
  };
  (globalThis as { fetch: unknown }).fetch = async (input: RequestInfo | URL) => {
    const key = /CIK(\d{10})\.json$/.exec(String(input))?.[1] ?? "";
    const body = records[key];
    return { ok: body !== undefined, status: body ? 200 : 404, json: async () => body } as unknown as Response;
  };
  let dkng: Awaited<ReturnType<typeof getFilingsDeep>> = [];
  try {
    dkng = await getFilingsDeep({ ticker: "DKNG", cik: "0001883685", name: "DraftKings Inc." }, false, []);
  } finally {
    globalThis.fetch = realFetch;
  }
  const dkngIds = new Set(dkng.map((e) => e.id));
  check("a record that began as a shell is the company's from the day the business merged in: DraftKings' 2021 and 2022 annual reports",
    dkngIds.has("sec-000177275722000010") && dkngIds.has("sec-000177275721000010"), [...dkngIds].join(", "));
  check("  …and not the SPAC's annual report, nor its rename that day", !dkngIds.has("sec-000177275720000010") && !dkng.some((e) => /Diamond Eagle/.test(e.title)),
    dkng.map((e) => e.title).join(" | "));

  console.log("\nIts headlines are read under the record they live in");
  const readAs: string[] = [];
  const fakeDb = { query: async () => ({ rows: [], rowCount: 0 }) } as unknown as PoolClient;
  const eightKs = [
    { id: "sec-000003408825000005", date: "2025-01-31", type: "earnings" as const, title: "ExxonMobil Holdings Corp: Earnings announcement (8-K)", source: "SEC EDGAR",
      url: "https://www.sec.gov/Archives/edgar/data/34088/000003408825000005/doc.htm", externalId: "000003408825000005", sourceKey: "sec_edgar" as const },
    { id: "sec-000211543626000030", date: "2026-10-31", type: "earnings" as const, title: "ExxonMobil Holdings Corp: Earnings announcement (8-K)", source: "SEC EDGAR",
      url: "https://www.sec.gov/Archives/edgar/data/2115436/000211543626000030/doc.htm", externalId: "000211543626000030", sourceKey: "sec_edgar" as const },
  ];
  await withSecHeadlines(fakeDb, "0002115436", eightKs, {
    read: async (cik, accession) => {
      readAs.push(`${Number(cik)}:${accession}`);
      return { headline: null, exhibit: null };
    },
  });
  check("a predecessor's 8-K is read under its CIK, a successor's under the company's: EDGAR answers 404 under the wrong one",
    readAs.includes("34088:000003408825000005") && readAs.includes("2115436:000211543626000030"), readAs.join(", "));

  console.log("\nIts names reach the news");
  const names = newsNamesFor(2115436);
  check("\"Exxon Mobil\" and \"Exxon\" are names news uses for ExxonMobil Holdings", names[0] === "Exxon Mobil" && names.includes("Exxon"), JSON.stringify(names));
  const xomAliases = aliasesFor({ kind: "company", displayName: "ExxonMobil Holdings Corp", ticker: "XOM" }, ["ExxonMobil", ...names]);
  check("  …so \"Exxon Mobil beats profit estimates\" is about the company", mentions("Exxon Mobil beats profit estimates", xomAliases) !== "none",
    mentions("Exxon Mobil beats profit estimates", xomAliases));
  check("\"Cigna\", \"Bunge\" and \"Marvell\" for The Cigna Group, Bunge Global and Marvell Technology",
    newsNamesFor(1739940).includes("Cigna") && newsNamesFor(1996862).includes("Bunge") && newsNamesFor(1835632).includes("Marvell"));
  check("a name that is an everyday word or a common surname is not carried: no \"Apache\", no \"Ferguson\"",
    !newsNamesFor(1841666).includes("Apache") && !newsNamesFor(2011641).includes("Ferguson"));
  check("Alphabet keeps \"Google\" from the alias file, as before", newsNamesFor(1652044).includes("Google"));
  check("\"Encana\" for Ovintiv, \"Bancolombia\" for Grupo Cibest, \"CompuCredit\" for Atlanticus (batch 55)",
    newsNamesFor(1792580).includes("Encana") && newsNamesFor(2058897).includes("Bancolombia") && newsNamesFor(1464343).includes("CompuCredit"));
  check("  …but never a name whose brand left with a business sold or spun off: no \"Aaron's\" for PROG Holdings",
    !newsNamesFor(1808834).some((n) => /aaron/i.test(n)), JSON.stringify(newsNamesFor(1808834)));
  check("  …nor \"Openwave\" or \"Unwired Planet\" for Great Elm, which sold both in 2012 and 2016 (batch 58)",
    newsNamesFor(1831096).length === 0 && mentions("UK Supreme Court rules in Unwired Planet v Huawei", aliasesFor({ kind: "company", displayName: "Great Elm Group, Inc.", ticker: "GEG" }, ["Great Elm Group", ...newsNamesFor(1831096)])) === "none",
    JSON.stringify(newsNamesFor(1831096)));

  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  if (fail) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
