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
import { OWN_RECORD_FROM, PREDECESSORS, ownPastLabelled, ownRecordFrom, predecessorsOf } from "../lib/predecessors";
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

  // batch 108, the 2026-11-07 audit's question 1: MRK's record was Schering-Plough's until it took
  // old Merck's name and ticker at the merger of 2009-11-03
  check("Merck's history is old Merck's record to the merger, and its own record is MRK's from it, Schering-Plough's before",
    predecessorsOf(cikOf("MRK"))[0]?.cik === 64978 && predecessorsOf(cikOf("MRK"))[0]?.until === "2009-11-04" && ownRecordFrom(cikOf("MRK")) === "2009-11-04" && cikOf("MRK") === 310158);
  check("  …and every record with such a day is a mapped successor whose day is its handover's or after",
    Object.entries(OWN_RECORD_FROM).every(([c, r]) => predecessorsOf(c).length > 0 && r.from >= predecessorsOf(c)[0].until && tickersOf(Number(c)).includes(r.ticker) && r.why.length > 40 && r.label.includes(r.name)));
  records["0000310158"] = {
    name: "Merck & Co., Inc.",
    formerNames: [{ name: "SCHERING PLOUGH CORP", from: "1994-03-07T00:00:00.000Z", to: "2009-10-29T00:00:00.000Z" }],
    filings: {
      recent: block([
        ["2026-10-30", "10-Q", "0000310158-26-000050"],
        ["2009-11-04", "8-K", "0001193125-09-223917"], // the merger, on the successor's record
        ["2009-10-29", "10-Q", "0000950123-09-054872"], // Schering-Plough's last quarter
        ["2005-03-01", "10-K", "0000310158-05-000010"], // Schering-Plough's annual report
      ]),
    },
  };
  records["0000064978"] = {
    name: "MERCK SHARP & DOHME LLC",
    formerNames: [
      { name: "MERCK SHARP & DOHME CORP.", from: "2009-09-28T00:00:00.000Z", to: "2022-11-21T00:00:00.000Z" },
      { name: "MERCK & CO INC", from: "1994-03-16T00:00:00.000Z", to: "2009-11-02T00:00:00.000Z" },
    ],
    filings: {
      recent: block([
        ["2015-05-01", "424B2", "0000064978-15-000020"], // the subsidiary's debt, after the merger
        ["2009-11-04", "8-K", "0001193125-09-223934"], // its delisting and change of control
        ["2009-11-02", "10-Q", "0000950123-09-055961"], // old Merck's last quarter
        ["2008-02-28", "10-K", "0000950123-08-002050"], // old Merck's annual report
      ]),
    },
  };
  (globalThis as { fetch: unknown }).fetch = async (input: RequestInfo | URL) => {
    const key = /CIK(\d{10})\.json$/.exec(String(input))?.[1] ?? "";
    const body = records[key];
    return { ok: body !== undefined, status: body ? 200 : 404, json: async () => body } as unknown as Response;
  };
  const mrkRenames: Rename[] = [];
  let mrk: Awaited<ReturnType<typeof getFilingsDeep>> = [];
  try {
    mrk = await getFilingsDeep({ ticker: "MRK", cik: "0000310158", name: "Merck & Co., Inc." }, false, mrkRenames);
  } finally {
    globalThis.fetch = realFetch;
  }
  const mrkIds = new Set(mrk.map((e) => e.id));
  check("MRK's page has old Merck's annual report and last quarter, and its own record's filings from the merger on",
    ["sec-000095012308002050", "sec-000095012309055961", "sec-000119312509223917", "sec-000031015826000050"].every((id) => mrkIds.has(id)), [...mrkIds].join(", "));
  // the owner's call of 2026-11-07 (batch 110): Schering-Plough's past stays, labelled as its
  check("  …and Schering-Plough's annual report and last quarter, its record's own past; not old Merck's own 8-K of its delisting, nor the subsidiary's debt after",
    mrkIds.has("sec-000031015805000010") && mrkIds.has("sec-000095012309054872") && !mrkIds.has("sec-000119312509223934") && !mrkIds.has("sec-000006497815000020"));
  check("  …Schering-Plough's own rename into Merck's name is on the page, a name its cases are read by; old Merck's into its subsidiary's at the merger is not",
    mrkRenames.some((r) => r.from === "SCHERING PLOUGH CORP") && !mrk.some((e) => /MERCK SHARP/i.test(e.title)) && !mrkRenames.some((r) => /MERCK SHARP/i.test(`${r.from} ${r.to}`)),
    `${mrk.filter((e) => e.type === "corporate_action").map((e) => e.title).join(" | ")} · ${JSON.stringify(mrkRenames)}`);
  const page = (id: string) => ownPastLabelled(mrk.find((e) => e.id === id)!, 310158);
  const label = "Schering-Plough, before its 2009 merger with Merck";
  check("  …on the page, Schering-Plough's filings say whose and are titled with its name; old Merck's and MRK's own after the merger are as filed",
    page("sec-000031015805000010").title === "Schering-Plough: Annual report (10-K)" && page("sec-000031015805000010").source.endsWith(` · ${label}`) &&
      page("sec-000095012308002050").title === "Merck & Co., Inc.: Annual report (10-K)" && !page("sec-000095012308002050").source.includes(label) &&
      !page("sec-000031015826000050").source.includes(label) && page("sec-000031015826000050").title === "Merck & Co., Inc.: Quarterly report (10-Q)",
    ["sec-000031015805000010", "sec-000095012308002050", "sec-000031015826000050"].map((id) => `${page(id).title} | ${page(id).source}`).join(" ; "));
  const row = (date: string, title: string, description?: string) => ownPastLabelled({ date, title, source: "Justice Department", url: "https://www.justice.gov/x", description }, 310158);
  check("  …and a case or approval before the merger naming Schering-Plough or its Organon, and not Merck, is labelled; one naming Merck, or both, is old Merck's own",
    row("2004-07-30", "Schering-Plough to Pay $345 Million to Resolve Criminal and Civil Liabilities").source.endsWith(label) &&
      row("2009-08-13", "FDA approves Saphris (asenapine), a new molecular entity", "Approved August 13, 2009 on Organon USA's NDA 22117").source.endsWith(label) &&
      !row("2008-02-07", "Merck to Pay More than $650 Million").source.includes(label) && !row("2000-03-22", "EPA consent decree", "Schering Corporation; Merck & Co., Inc.").source.includes(label) &&
      !row("2011-05-13", "FDA approves Victrelis", "on Schering's NDA").source.includes(label) && !ownPastLabelled({ date: "2004-07-30", title: "Schering-Plough to Pay", source: "x" }, 320193).source.includes(label));

  // ─── batch 132: the 17 pages the full-text search missed, from their filing lists ────────────
  console.log("\nBatch 132: the older records of 17 companies, from their filing lists (the owner's call of 2026-11-10)");
  type ListRow = [string, string, string, string];
  const lists = (await import("./fixtures/predecessor-lists-b132.json")).default as unknown as {
    records: Record<string, { name: string; formerNames: { name: string; from: string; to: string }[]; filings: ListRow[] }>;
  };
  const B132: Record<string, number[]> = {
    CMCSA: [22301], ORCL: [777676], DUK: [30371], TT: [1160497, 50485], RF: [36032], VMC: [103973], MGEE: [61339],
    CNP: [48732, 202131], DVN: [837330], ASH: [1305014, 7694], "BRK-B": [109694], NOC: [72945], OKE: [74154],
    NI: [823392], LAMR: [899045], ALKS: [874663], CBRL: [25373],
  };
  check("the 17 pages read their predecessors' records, Trane, Ashland and CenterPoint two each, newest first",
    Object.entries(B132).every(([t, ciks]) => JSON.stringify(predecessorsOf(cikOf(t)).map((p) => p.cik)) === JSON.stringify(ciks)),
    Object.entries(B132).filter(([t, ciks]) => JSON.stringify(predecessorsOf(cikOf(t)).map((p) => p.cik)) !== JSON.stringify(ciks)).map(([t]) => t).join(", "));
  const notices = Object.entries(B132).flatMap(([t, ciks]) => predecessorsOf(cikOf(t)).map((p) => {
    const rows = [cikOf(t), ...ciks].flatMap((c) => lists.records[String(c)]?.filings ?? []);
    return { t, p, row: rows.find((r) => r[2] === p.notice) };
  }));
  const WITH_NOTICE = ["CMCSA", "ORCL", "DUK", "RF", "VMC", "MGEE", "DVN", "LAMR"];
  check("each handover's filing is in the lists, filed on its `until`: ten notices of succession (8-K12B or 8-K12G3), ten 8-Ks",
    notices.every(({ t, p, row }) => !!row && (row[0] === p.until || (t === "OKE" && row[0] === "1997-11-28"))) &&
      notices.filter(({ row }) => /^8-K12[BG]3?$/.test(row?.[1] ?? "")).length === 10 && notices.filter(({ row }) => row?.[1] === "8-K").length === 10 && notices.length === 20 &&
      WITH_NOTICE.every((t) => notices.some((n) => n.t === t && /^8-K12/.test(n.row?.[1] ?? ""))) &&
      notices.some((n) => n.t === "TT" && n.p.cik === 1160497 && n.row?.[1] === "8-K12B") && notices.some((n) => n.t === "CNP" && n.p.cik === 48732 && n.row?.[1] === "8-K12B"),
    notices.filter(({ t, p, row }) => !row || (row[0] !== p.until && t !== "OKE")).map(({ t, p }) => `${t} ${p.cik}`).join(", "));
  check("  …ONEOK's day is the one after its old record's last annual report, filed two days after the handover",
    predecessorsOf(cikOf("OKE"))[0]?.until === "1997-11-29" && lists.records["74154"].filings.some((r) => r[0] === "1997-11-28" && r[1] === "10-K"));

  const asList = (c: number) => {
    const r = lists.records[String(c)];
    const rows = [...r.filings].sort((a, b) => b[0].localeCompare(a[0]));
    return {
      name: r.name,
      formerNames: r.formerNames.map((f) => ({ name: f.name, from: `${f.from}T00:00:00.000Z`, to: `${f.to}T00:00:00.000Z` })),
      filings: {
        recent: {
          form: rows.map((x) => x[1]), filingDate: rows.map((x) => x[0]), accessionNumber: rows.map((x) => x[2]),
          primaryDocument: rows.map(() => "doc.htm"), items: rows.map((x) => x[3]),
        },
      },
    };
  };
  (globalThis as { fetch: unknown }).fetch = async (input: RequestInfo | URL) => {
    const key = /CIK(\d{10})\.json$/.exec(String(input))?.[1];
    const body = key && lists.records[String(Number(key))] ? asList(Number(key)) : undefined;
    return { ok: body !== undefined, status: body ? 200 : 404, json: async () => body } as unknown as Response;
  };
  const pages: Record<string, { ids: Set<string>; titles: string[]; renames: Rename[] }> = {};
  try {
    for (const t of Object.keys(B132)) {
      const renames: Rename[] = [];
      const ev = await getFilingsDeep({ ticker: t, cik: String(cikOf(t)).padStart(10, "0"), name: lists.records[String(cikOf(t))].name }, false, renames);
      pages[t] = { ids: new Set(ev.map((e) => e.id)), titles: ev.filter((e) => e.type === "corporate_action").map((e) => e.title), renames };
    }
  } finally {
    globalThis.fetch = realFetch;
  }
  const has = (t: string, a: string) => pages[t].ids.has(`sec-${a.replace(/-/g, "")}`);
  check("Comcast's page holds old Comcast's 8-K of 2001-12-20, the month of the AT&T Broadband agreement, and not its subsidiary's 8-K of the handover day",
    has("CMCSA", "0000950103-01-501627") && !has("CMCSA", "0000950103-02-001195"));
  check("Oracle's holds the two 8-Ks of the PeopleSoft purchase its new parent was formed for (2004-12-14, 2005-01-03)",
    has("ORCL", "0001193125-04-212307") && has("ORCL", "0001193125-05-000450"));
  check("Duke's holds Duke Energy's 8-K of 1997-06-27 and not Duke Energy Carolinas' annual report of 2007",
    has("DUK", "0000950168-97-001683") && !has("DUK", "0001193125-07-055893"));
  check("  …and the rename from Duke Power in 1997, not the predecessor's into a subsidiary's name at the handover",
    pages.DUK.titles.includes("Renamed from DUKE POWER CO /NC/ to DUKE ENERGY CORP") && !pages.DUK.titles.some((x) => /Duke Power CO LLC|Carolinas/i.test(x)) &&
      pages.DUK.renames.some((r) => r.from === "DUKE POWER CO /NC/") && !pages.DUK.renames.some((r) => /LLC|Carolinas/i.test(r.to)), pages.DUK.titles.join(" | "));
  check("Vulcan's holds the Florida Rock agreement's 8-K of 2007-02-20", has("VMC", "0000950123-07-002471"));
  check("Trane reads two steps: Ingersoll-Rand Company Limited's annual report of 2002, and Ingersoll-Rand Company's quarterly report of 2001",
    has("TT", "0001160497-02-000005") && has("TT", "0000050485-01-500028") && !has("TT", "0000950134-02-000013"));
  check("Ashland reads two steps: the old Ashland's annual report of 2004 and the parent of 2005's 8-K of its first day, not that record's shell filings before it",
    has("ASH", "0000007694-04-000179") && has("ASH", "0001305014-05-000007") && !has("ASH", "0001193125-04-170209") &&
      !pages.ASH.titles.some((x) => /New EXM/i.test(x)) && pages.ASH.titles.includes("Renamed from ASHLAND OIL INC to ASHLAND INC"), pages.ASH.titles.join(" | "));
  check("CenterPoint reads the old Houston Industries' proxy of 1997 and Houston Industries' record from the 1997 merger, not Houston Lighting & Power's own filings before it",
    has("CNP", "0000899243-97-000566") && has("CNP", "0000950129-97-004776") && has("CNP", "0000899243-97-001516") && !has("CNP", "0000899243-97-000096"));
  check("  …its rename from Houston Industries to Reliant Energy is on the page; the utility's of 1997 and the record's into CenterPoint Houston are not",
    pages.CNP.titles.includes("Renamed from HOUSTON INDUSTRIES INC to RELIANT ENERGY INC") && !pages.CNP.titles.some((x) => /HOUSTON LIGHTING|CENTERPOINT ENERGY HOUSTON/i.test(x)) &&
      !pages.CNP.renames.some((r) => /HOUSTON LIGHTING/i.test(r.from)), pages.CNP.titles.join(" | "));
  check("ONEOK's holds the old record's last annual report (filed 1997-11-28), not its 8-K of 1997-12-12",
    has("OKE", "0000950134-97-009044") && !has("OKE", "0000950134-97-009286"));
  check("Lamar's holds the old record's 8-K of 1999-07-07, not Lamar Media's quarterly report of 1999-11-12",
    has("LAMR", "0000906280-99-000165") && !has("LAMR", "0000950134-99-009877"));
  check("  …and no rename: the record was LAMAR MEDIA CORP for six days in July 1999 and back, EDGAR's churn before the handover, and took the name for good the day before it",
    !pages.LAMR.titles.some((x) => /LAMAR MEDIA/i.test(x)) && !pages.LAMR.renames.some((r) => /LAMAR MEDIA/i.test(`${r.from} ${r.to}`)),
    `${pages.LAMR.titles.join(" | ")} · ${JSON.stringify(pages.LAMR.renames)}`);
  check("  …while every other predecessor's own renames before its handover stay: First Alabama Bancshares, Northrop, NIPSCO Industries, Oracle Systems, Ashland Oil",
    pages.RF.renames.some((r) => r.from === "FIRST ALABAMA BANCSHARES INC") && pages.NOC.renames.some((r) => r.from === "NORTHROP CORP") &&
      pages.NI.renames.some((r) => r.from === "NIPSCO INDUSTRIES INC") && pages.ORCL.renames.some((r) => r.from === "ORACLE SYSTEMS CORP") &&
      pages.ASH.renames.some((r) => r.from === "ASHLAND OIL INC") && !pages.NOC.renames.some((r) => /SYSTEMS/.test(r.to)) && !pages.ORCL.renames.some((r) => r.to === "Oracle Systems"));

  // ─── batch 133: the rest of the population, from the scan of every listed company's list ─────
  console.log("\nBatch 133: the scan of every listed company's filing list, and batch 117's records read again");
  const lists133 = (await import("./fixtures/predecessor-lists-b133.json")).default as unknown as typeof lists;
  const B133: Record<string, number[]> = {
    ED: [23632], PCG: [75488], OGE: [74145], TDS: [96966], IDA: [49648], SR: [57183], NEM: [71824], HST: [314733], GPK: [886239, 892793],
    VLO: [21271], SPG: [912564], MERC: [75659], NVRI: [45876], CHH: [1018146], MPU: [1036848], LEN: [58696], HR: [899749], IRM: [1004317],
    PPL: [317187], DTE: [28385], URI: [1047166], TROW: [80255], NBR: [798943], FMS: [1019600], KB: [1143680], RIG: [1083269, 314047],
    ACN: [1134538], ICE: [1174746], ZG: [1334814], PFSI: [1568669],
  };
  check("the 30 pages read their predecessors' records, Graphic Packaging and Transocean two each, newest first",
    Object.entries(B133).every(([t, ciks]) => JSON.stringify(predecessorsOf(cikOf(t)).map((p) => p.cik)) === JSON.stringify(ciks)),
    Object.entries(B133).filter(([t, ciks]) => JSON.stringify(predecessorsOf(cikOf(t)).map((p) => p.cik)) !== JSON.stringify(ciks)).map(([t]) => t).join(", "));
  const handovers = Object.entries(B133).flatMap(([t, ciks]) => predecessorsOf(cikOf(t)).map((p) => {
    const rows = [cikOf(t), ...ciks].flatMap((c) => lists133.records[String(c)]?.filings ?? []);
    return { t, p, row: rows.find((r) => r[2] === p.notice) };
  }));
  const forms133: Record<string, number> = {};
  for (const h of handovers) forms133[h.row?.[1] ?? "none"] = (forms133[h.row?.[1] ?? "none"] ?? 0) + 1;
  check("each handover's filing is in the lists on its `until`: 13 notices of succession (8-K12B, 8-K12G3), 4 of the older form (8-B12B), 13 8-Ks, a registration and a deregistration",
    handovers.length === 32 && handovers.every(({ t, p, row }) => !!row && (row[0] === p.until || (t === "ZG" && row[0] === "2015-02-17"))) &&
      JSON.stringify(Object.entries(forms133).sort()) === JSON.stringify(Object.entries({ "8-K12B": 6, "8-K12G3": 7, "8-B12B": 4, "8-K": 13, "8-A12B": 1, "15-12B": 1 }).sort()),
    JSON.stringify(forms133));
  check("  …Newmont's rests on its new parent's registration (8-A12B) and Valero's on its old record's deregistration (15-12B), each filed on its day",
    handovers.find((h) => h.t === "NEM")?.row?.[1] === "8-A12B" && handovers.find((h) => h.t === "VLO")?.row?.[1] === "15-12B" &&
      lists133.records["71824"].filings.some((r) => r[0] === "2002-02-15" && r[1] === "15-12B"));
  check("  …Zillow's day is the one after the old record's annual report for 2014, filed on the handover day",
    predecessorsOf(cikOf("ZG"))[0]?.until === "2015-02-18" && lists133.records["1334814"].filings.some((r) => r[0] === "2015-02-17" && r[1] === "10-K"));

  (globalThis as { fetch: unknown }).fetch = async (input: RequestInfo | URL) => {
    const key = /CIK(\d{10})\.json$/.exec(String(input))?.[1];
    const r = key ? lists133.records[String(Number(key))] : undefined;
    let body: unknown;
    if (r) {
      const rows = [...r.filings].sort((a, b) => b[0].localeCompare(a[0]));
      body = {
        name: r.name,
        formerNames: r.formerNames.map((f) => ({ name: f.name, from: `${f.from}T00:00:00.000Z`, to: `${f.to}T00:00:00.000Z` })),
        filings: { recent: { form: rows.map((x) => x[1]), filingDate: rows.map((x) => x[0]), accessionNumber: rows.map((x) => x[2]), primaryDocument: rows.map(() => "doc.htm"), items: rows.map((x) => x[3]) } },
      };
    }
    return { ok: body !== undefined, status: body ? 200 : 404, json: async () => body } as unknown as Response;
  };
  type Ev = Awaited<ReturnType<typeof getFilingsDeep>>[number];
  const p133: Record<string, { ev: Ev[]; ids: Set<string>; titles: string[]; renames: Rename[] }> = {};
  try {
    for (const t of Object.keys(B133)) {
      const renames: Rename[] = [];
      const ev = await getFilingsDeep({ ticker: t, cik: String(cikOf(t)).padStart(10, "0"), name: lists133.records[String(cikOf(t))].name }, false, renames);
      p133[t] = { ev, ids: new Set(ev.map((e) => e.id)), titles: ev.filter((e) => e.type === "corporate_action").map((e) => e.title), renames };
    }
  } finally {
    globalThis.fetch = realFetch;
  }
  const on = (t: string, a: string) => p133[t].ids.has(`sec-${a.replace(/-/g, "")}`);
  // the 2026-11-10 audit of batches 131–136, finding 3 (batch 137)
  check("PPL's page holds its 10-Q for the quarter to 1995-03-31, filed under the utility's record on 1995-05-04, after the handover, and IDACORP's its 10-Q to 1998-09-30, filed 1998-11-06 (the 2026-11-10 audit); each utility's own 8-K of the handover day stays off",
    on("PPL", "0000317187-95-000022") && on("IDA", "0000049648-98-000024") && !on("PPL", "0000317187-95-000018") && !on("IDA", "0000898080-98-000235") &&
      predecessorsOf(cikOf("PPL"))[0]?.until === "1995-04-27" && predecessorsOf(cikOf("IDA"))[0]?.until === "1998-10-01" &&
      Object.values(PREDECESSORS).flat().filter((p) => p.after?.length).map((p) => p.cik).sort((a, b) => a - b).join(" ") === "49648 317187");
  check("Con Edison's page holds Consolidated Edison of New York's annual report of 1997, not the utility's own 8-K after the handover",
    on("ED", "0000023632-97-000005") && !on("ED", "0000023632-98-000007"));
  check("Graphic Packaging reads two steps: Graphic Packaging International's annual report of 2003 and the record from the 2003 merger, not Riverwood's own past",
    on("GPK", "0000898430-03-002029") && on("GPK", "0001047469-05-008145") && !on("GPK", "0001005477-97-000874") &&
      p133.GPK.titles.includes("Renamed from ACX TECHNOLOGIES INC to GRAPHIC PACKAGING INTERNATIONAL CORP") && !p133.GPK.titles.some((x) => /RIVERWOOD/.test(x)),
    p133.GPK.titles.join(" | "));
  check("Transocean reads three records back: the Delaware company's quarter of 1999 and the Cayman company's annual report of 2008, not that shell's own name of 1999",
    on("RIG", "0000899243-99-000985") && on("RIG", "0001140361-08-005230") && p133.RIG.titles.includes("Renamed from SONAT OFFSHORE DRILLING INC to TRANSOCEAN OFFSHORE INC") &&
      !p133.RIG.titles.some((x) => /TEXAS/.test(x)), p133.RIG.titles.join(" | "));
  check("the old Host Marriott's 98 days as HOST MARRIOTT SERVICES CORP in 1995 are no renames on Host's page: a name given back within half a year is churn",
    !p133.HST.titles.some((x) => /HOST MARRIOTT SERVICES/.test(x)) && !p133.HST.renames.some((r) => /SERVICES/.test(`${r.from} ${r.to}`)), p133.HST.titles.join(" | "));
  const lab = (t: string, a: string) => {
    const e = p133[t].ev.find((x) => x.id === `sec-${a.replace(/-/g, "")}`);
    return e ? ownPastLabelled(e, cikOf(t)) : undefined;
  };
  check("Healthcare Realty's page: Healthcare Trust of America's own 8-K before the 2022 merger is labelled as its; old Healthcare Realty's of the same week and the record's after the merger are as filed",
    !!lab("HR", "0001360604-22-000053")?.source.endsWith("Healthcare Trust of America, before its 2022 merger with Healthcare Realty") &&
      lab("HR", "0001360604-22-000053")!.title.startsWith("Healthcare Trust of America:") &&
      on("HR", "0000899749-22-000103") && !lab("HR", "0000899749-22-000103")!.source.includes("Healthcare Trust of America") &&
      !lab("HR", "0001193125-22-198653")!.source.includes("Healthcare Trust of America"),
    `${lab("HR", "0001360604-22-000053")?.title} | ${lab("HR", "0001360604-22-000053")?.source}`);
  check("Lennar's page: Pacific Greystone's quarter of 1997 is labelled as its; old Lennar's quarter is the company's",
    !!lab("LEN", "0001047469-97-002327")?.source.endsWith("Pacific Greystone, before its 1997 merger with Lennar") && on("LEN", "0000950170-97-001235") &&
      !lab("LEN", "0000950170-97-001235")!.source.includes("Greystone"));
  check("Zillow's page holds the old Zillow's annual report for 2014, filed on the handover day, and not its amendment of the next day",
    on("ZG", "0001193125-15-050643") && !on("ZG", "0001193125-15-052711"));
  check("T. Rowe Price's page holds T. Rowe Price Associates' annual report of 2000", on("TROW", "0000080255-00-000380"));
  check("Simon's page holds Simon DeBartolo Group's 8-K of 1998-08-24 and its rename of 1996, not SPG Properties' quarter after the merger nor that rename",
    on("SPG", "0000912564-98-000058") && !on("SPG", "0000912564-98-000059") &&
      p133.SPG.titles.includes("Renamed from SIMON PROPERTY GROUP INC to SIMON DEBARTOLO GROUP INC") && !p133.SPG.titles.some((x) => /SPG PROPERTIES/.test(x)), p133.SPG.titles.join(" | "));
  check("Choice Hotels' page holds the old Choice Hotels' quarter of 1997", on("CHH", "0000950109-97-006360"));
  check("Enviri's page holds Harsco's rename to Enviri of 2023 and not the old record's 8-K of the handover day",
    p133.NVRI.titles.includes("Renamed from HARSCO CORP to ENVIRI Corp") && !on("NVRI", "0001193125-26-251741"), p133.NVRI.titles.join(" | "));
  check("PennyMac's page holds the old PennyMac's annual report of 2018, and not its rename into PNMAC Holdings the day before the handover",
    on("PFSI", "0001558370-18-001782") && !p133.PFSI.titles.some((x) => /PNMAC/.test(x)) && !p133.PFSI.renames.some((r) => /PNMAC/.test(r.to)));
  check("  …and the three records that took a listed company's name are labelled from their handover, each a mapped successor",
    ["LEN", "HR", "IRM"].every((t) => ownRecordFrom(cikOf(t)) === predecessorsOf(cikOf(t))[0]?.until));

  const read = (await import("node:fs")).readFileSync(`${__dirname}/../lib/store/read.ts`, "utf8");
  check("  …the page's read labels them: each row by its subject's record",
    /sj\.cik AS subject_cik/.test(read) && /const own = ownPastLabelled\(ev, r\.subject_cik\);/.test(read));

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
