import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { PoolClient } from "pg";
import {
  DATELINE_WITHIN,
  HEADLINE_VERSION,
  decodeDocument,
  headlineCase,
  mayCarryRelease,
  pressReleaseHeadline,
  readFilingHeadline,
  releaseExhibits,
  textLines,
  withHeadline,
} from "../lib/secHeadlines";
import { HEADLINES_PER_RUN, withSecHeadlines } from "../lib/ingest/headlines";
import EventList from "../components/EventList";
import type { TimelineEvent } from "../lib/types";

/**
 * An 8-K's press-release headline as its title (batch 42).
 *
 *   npm run check:sec-headlines
 *
 * Every 8-K was titled by its item — "Other events (8-K 8.01)" — which says what kind of thing was
 * reported and not what it was. Offline by construction: the documents are real exhibits, read
 * from EDGAR on 2026-10-24 and kept in `scripts/fixtures/sec-headlines.json` (their first few
 * thousand characters, presentation attributes dropped), and every EDGAR request below is answered
 * by a stand-in.
 */

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

interface Case {
  filer: string;
  filed: string;
  accession: string;
  url: string;
  why: string;
  headline: string | null;
  doc: string;
}
const fixture = JSON.parse(read("scripts/fixtures/sec-headlines.json")) as {
  cases: Case[];
  indexes: { url: string; why: string; html: string }[];
};

/** A stand-in for EDGAR: URL → body, anything else a 404. */
function edgar(pages: Record<string, string | number>) {
  const asked: string[] = [];
  const get = async (url: string): Promise<Response> => {
    asked.push(url);
    const page = pages[url];
    if (typeof page === "number") return new Response("", { status: page });
    if (page === undefined) return new Response("", { status: 404 });
    return new Response(page, { status: 200 });
  };
  return { get, asked };
}

/** Just enough of a pg client for `sec_headlines`. */
function fakeDb(rows: Map<string, { headline: string | null; version: number }>): PoolClient {
  return {
    query: async (sql: string, params: unknown[]) => {
      if (/^SELECT accession/.test(sql)) {
        const wanted = params[0] as string[];
        return { rows: wanted.filter((a) => rows.has(a)).map((a) => ({ accession: a, ...rows.get(a)! })) };
      }
      if (/^INSERT INTO sec_headlines/.test(sql)) {
        const [accession, headline, , version] = params as [string, string | null, string | null, number];
        rows.set(accession, { headline, version });
        return { rows: [] };
      }
      throw new Error(`unexpected query: ${sql}`);
    },
  } as unknown as PoolClient;
}

function eightK(accession: string, date: string, label: string, items: string | undefined): TimelineEvent {
  return {
    id: `sec-${accession}`,
    date,
    type: label.startsWith("Earnings") ? "earnings" : "filing",
    title: `Boeing Co: ${label}`,
    source: "SEC EDGAR",
    url: `https://www.sec.gov/Archives/edgar/data/12927/${accession}/x.htm`,
    description: items,
    sourceKey: "sec_edgar",
    externalId: accession,
  };
}

async function main(): Promise<void> {
  const positives = fixture.cases.filter((c) => c.headline);
  const negatives = fixture.cases.filter((c) => !c.headline);

  console.log(`\nHeadlines read from ${positives.length} real press releases, 1994–2026`);
  for (const c of positives) {
    const got = pressReleaseHeadline(c.doc);
    check(`${c.filer} ${c.filed}: ${c.why}`, got === c.headline, got === c.headline ? c.headline! : `got ${JSON.stringify(got)}`);
  }

  console.log(`\nExhibits that are not press releases give none (${negatives.length})`);
  for (const c of negatives) {
    const got = pressReleaseHeadline(c.doc);
    check(`${c.filer} ${c.filed}: ${c.why}`, got === null, got ? `got ${JSON.stringify(got)}` : "");
  }
  check(`a dateline is looked for in the first ${DATELINE_WITHIN} lines only`, DATELINE_WITHIN === 40);

  console.log("\nReading a document");
  // Node's own windows-1252 decoder returns 0x96/0x97 as control codes, so this is spelled out
  const bytes = new Uint8Array([...Buffer.from("CHICAGO, June 26, 2007 ", "latin1"), 0x97, ...Buffer.from(" Boeing today said", "latin1")]);
  check("a document in Windows-1252 keeps its dashes: a dateline's dash is what the reading turns on",
    decodeDocument(bytes) === "CHICAGO, June 26, 2007 — Boeing today said", JSON.stringify(decodeDocument(bytes)));
  check("…and one in UTF-8 is read as UTF-8", decodeDocument(Buffer.from("Nestlé — “Q3”", "utf8")) === "Nestlé — “Q3”");
  check("&#151; and &#146;, the Windows way of writing a dash and an apostrophe, read as them",
    textLines("<p>BENTONVILLE, Ark., Nov. 21, 2008 &#151; Wal-Mart&#146;s board</p>")[0] === "BENTONVILLE, Ark., Nov. 21, 2008 — Wal-Mart’s board");
  check("an accented letter by name: &eacute;", textLines("<p>Nestl&eacute;</p>")[0] === "Nestlé");
  check("a paragraph's own line breaks are only word wrap", textLines("<p>Boeing Sets 787\nFirst Delivery Date</p>").length === 1);
  check("an image placeholder is dropped", textLines("<p>[AMAZON.COM Graphic] AMAZON.COM ANNOUNCES</p>")[0] === "AMAZON.COM ANNOUNCES");
  check("plain text keeps its lines, and a contacts column beside the headline becomes its own line",
    JSON.stringify(textLines("<TEXT>\nSCHERING-PLOUGH ANNOUNCES SALE        Steve Galpin, Jr.\n</TEXT>")) ===
      JSON.stringify(["SCHERING-PLOUGH ANNOUNCES SALE", "Steve Galpin, Jr."]));

  console.log("\nA headline written in capitals, recased");
  const recased: [string, string][] = [
    ["FORD'S 1993 PROFIT REFLECTED WORLDWIDE IMPROVEMENT", "Ford's 1993 Profit Reflected Worldwide Improvement"],
    ["IBM REPORTS 2003 FOURTH-QUARTER EARNINGS", "IBM Reports 2003 Fourth-Quarter Earnings"],
    ["McDONALD'S REPORTS 24TH CONSECUTIVE MONTH OF POSITIVE SALES", "McDonald's Reports 24th Consecutive Month of Positive Sales"],
    ["ORACLE REPORTS NON-GAAP EPS UP 40%", "Oracle Reports Non-GAAP EPS up 40%"],
    ["WAL-MART BOARD ADOPTS MAJORITY VOTE STANDARD", "Wal-Mart Board Adopts Majority Vote Standard"],
    ["UPS NAMES JOHN T. STANKEY TO ITS BOARD", "UPS Names John T. Stankey to Its Board"],
    ["CRAIG JELINEK WILL STEP DOWN AS CEO, RON VACHRIS ELECTED", "Craig Jelinek Will Step Down as CEO, Ron Vachris Elected"],
    ["GE TO EXPLORE A SPIN-OFF OF U.S. APPLIANCES", "GE to Explore a Spin-Off of U.S. Appliances"],
  ];
  for (const [from, to] of recased) check(`"${from}"`, headlineCase(from) === to, headlineCase(from));
  check("a headline in mixed case is the filer's own and kept as written",
    headlineCase("Apple reports third quarter results") === "Apple reports third quarter results");

  console.log("\nA filing's index page");
  const [modern, noRelease, old] = fixture.indexes;
  const m = releaseExhibits(modern.html);
  check(`${modern.why}`, m.exhibits.length === 1 && m.exhibits[0].endsWith("a6848077ex99.htm") && m.documents > 1, JSON.stringify(m.exhibits));
  const n = releaseExhibits(noRelease.html);
  check(`${noRelease.why}`, n.exhibits.length === 0 && n.documents > 1);
  const o = releaseExhibits(old.html);
  check(`${old.why}`, o.exhibits.length === 0 && o.documents === 0 && /0000037996-94-000015\.txt$/.test(o.submission ?? ""), String(o.submission));

  console.log("\nReading one filing, against a stand-in EDGAR");
  const ford = fixture.cases.find((c) => c.filer === "FORD MOTOR CO" && c.filed === "2014-12-12")!;
  const base = "https://www.sec.gov/Archives/edgar/data/37996/000115752311005265";
  const indexUrl = `${base}/0001157523-11-005265-index.htm`;
  let e = edgar({ [indexUrl]: modern.html, [`https://www.sec.gov${m.exhibits[0]}`]: ford.doc });
  const one = await readFilingHeadline(37996, "000115752311005265", e.get);
  check("the index page, then the release: two requests, and the headline with the document it came from",
    one?.headline === ford.headline && one?.exhibit === "a6848077ex99.htm" && e.asked.length === 2, JSON.stringify(one));
  e = edgar({ [indexUrl]: 503 });
  check("EDGAR not answering is a failure, not a filing without a headline: nothing to store, asked again later",
    (await readFilingHeadline(37996, "000115752311005265", e.get)) === null);
  e = edgar({ [indexUrl]: modern.html, [`https://www.sec.gov${m.exhibits[0]}`]: 500 });
  check("…and so is a release that will not load", (await readFilingHeadline(37996, "000115752311005265", e.get)) === null);
  e = edgar({});
  const gone = await readFilingHeadline(37996, "000115752311005265", e.get);
  check("a filing EDGAR does not have reads as one with none", gone?.headline === null && gone.exhibit === null);
  const contract = negatives.find((c) => c.filed === "2009-12-04")!;
  e = edgar({ [indexUrl]: modern.html, [`https://www.sec.gov${m.exhibits[0]}`]: contract.doc });
  const none = await readFilingHeadline(37996, "000115752311005265", e.get);
  check("an exhibit that is no release: read, no headline, the document named", none?.headline === null && none.exhibit === "a6848077ex99.htm");
  const ford1994 = fixture.cases.find((c) => c.filer === "FORD MOTOR CO" && c.filed === "1994-02-10")!;
  const oldIndex = "https://www.sec.gov/Archives/edgar/data/37996/000003799694000015/0000037996-94-000015-index.htm";
  const submission = `<SEC-HEADER>\n</SEC-HEADER>\n<DOCUMENT>\n<TYPE>8-K\n<TEXT>\nFORM 8-K\n</TEXT>\n</DOCUMENT>\n<DOCUMENT>\n<TYPE>EX-20\n${ford1994.doc}\n</DOCUMENT>`;
  e = edgar({ [oldIndex]: old.html, [`https://www.sec.gov${o.submission}`]: submission });
  const fromTxt = await readFilingHeadline(37996, "000003799694000015", e.get);
  check("a 1994 filing: its release read from inside the full submission text", fromTxt?.headline === ford1994.headline, JSON.stringify(fromTxt));
  e = edgar({ [`${base}/0001157523-11-005265-index.htm`]: noRelease.html });
  const bylaws = await readFilingHeadline(37996, "000115752311005265", e.get);
  check("a filing with no release exhibit costs its index page alone", bylaws?.headline === null && e.asked.length === 1);

  console.log("\nWhich 8-Ks are asked about");
  const asked = (label: string, items?: string) => mayCarryRelease(eightK("000001292719000001", "2019-01-01", label, items));
  check("one with exhibits (9.01)", asked("Other events (8-K 8.01)", "Items 8.01 Other events · 9.01 Financial statements and exhibits"));
  check("results, and an officer change filed without listing 9.01, which often carry a release anyway",
    asked("Earnings announcement (8-K)", "Item 2.02 Results of operations") && asked("Officer or director change (8-K 5.02)", "Item 5.02 Officer or director change"));
  check("not a shareholder vote filed bare", !asked("Shareholder vote results (8-K 5.07)", "Item 5.07 Shareholder vote results"));
  check("one from before 2004, whose item numbers meant other things, and one listing none", asked("8-K filing", "Items 5 · 7") && asked("8-K filing"));
  check("amended 8-Ks too", asked("Amended: Officer or director change (8-K/A 5.02)", "Items 5.02 Officer or director change · 9.01 Financial statements and exhibits"));
  check("never a 10-K, a prospectus or a stake",
    !asked("Annual report (10-K)") && !asked("Prospectus (424B2)") && !asked("Investor stake over 5% (SC 13D)"));

  console.log("\nThe title");
  const titled = withHeadline(eightK("000001292710001", "2010-08-27", "Other events (8-K 8.01)", "Items 8.01 Other events · 9.01 Financial statements and exhibits"),
    "Boeing Sets 787 First Delivery Date for Mid-First Quarter 2011");
  check("the headline in the title, the form and item kept at its end", titled.title === "Boeing Co: Boeing Sets 787 First Delivery Date for Mid-First Quarter 2011 (8-K 8.01)", titled.title);
  check("…and the item's name moved into the description, the item list kept after it",
    titled.description === "Other events (8-K 8.01). The headline is the press release's, filed with it. Items 8.01 Other events · 9.01 Financial statements and exhibits",
    titled.description);
  check("a results release stays an earnings event, its title ending (8-K)",
    (() => {
      const r = withHeadline(eightK("000001292710002", "2010-07-28", "Earnings announcement (8-K)", "Items 2.02 Results of operations · 9.01 Financial statements and exhibits"), "Boeing Reports Second-Quarter Results");
      return r.title === "Boeing Co: Boeing Reports Second-Quarter Results (8-K)" && r.type === "earnings";
    })());
  check("an amendment keeps its form", withHeadline(eightK("000001292710003", "2010-01-01", "Amended: Officer or director change (8-K/A 5.02)", undefined), "X Elects Y").title === "Boeing Co: X Elects Y (8-K/A 5.02)");
  check("a pre-2004 8-K's title ends (8-K)", withHeadline(eightK("000001292797000035", "1997-10-27", "8-K filing", "Items 5 · 7"), "Boeing Reports 1997 3rd Quarter Results").title === "Boeing Co: Boeing Reports 1997 3rd Quarter Results (8-K)");

  console.log("\nA run, against a stand-in EDGAR and database");
  const filings = [
    eightK("000001292720000001", "2020-01-29", "Earnings announcement (8-K)", "Items 2.02 Results of operations · 9.01 Financial statements and exhibits"),
    eightK("000001292719000002", "2019-10-25", "Officer or director change (8-K 5.02)", "Items 5.02 Officer or director change · 9.01 Financial statements and exhibits"),
    eightK("000001292719000003", "2019-04-29", "Shareholder vote results (8-K 5.07)", "Item 5.07 Shareholder vote results"),
    eightK("000001292718000004", "2018-12-17", "Other events (8-K 8.01)", "Items 8.01 Other events · 9.01 Financial statements and exhibits"),
    eightK("000001292718000005", "2018-04-25", "Earnings announcement (8-K)", "Items 2.02 Results of operations · 9.01 Financial statements and exhibits"),
  ];
  const db = new Map<string, { headline: string | null; version: number }>([
    ["000001292718000004", { headline: "Boeing Raises Dividend 20 Percent", version: HEADLINE_VERSION }],
  ]);
  const order: string[] = [];
  const reader = async (_cik: string, acc: string) => {
    order.push(acc);
    return acc.endsWith("02") ? { headline: null, exhibit: "ex99.htm" } : { headline: `Headline ${acc.slice(-1)}`, exhibit: "ex99.htm" };
  };
  let run = await withSecHeadlines(fakeDb(db), "12927", filings, { limit: 2, read: reader });
  check("a run reads at most its limit, newest first, and never one already stored or one that cannot carry a release",
    JSON.stringify(order) === JSON.stringify(["000001292720000001", "000001292719000002"]), JSON.stringify(order));
  check("a stored headline is applied without asking EDGAR",
    run.events[3].title === "Boeing Co: Boeing Raises Dividend 20 Percent (8-K 8.01)", run.events[3].title);
  check("a filing read and found to have none is stored as such, and keeps its item title",
    db.get("000001292719000002")?.headline === null && run.events[1].title === "Boeing Co: Officer or director change (8-K 5.02)");
  check("the run says what it did and what is left", run.stats.eligible === 4 && run.stats.read === 2 && run.stats.found === 1 && run.stats.left === 1 && run.stats.titled === 2,
    JSON.stringify(run.stats));
  order.length = 0;
  run = await withSecHeadlines(fakeDb(db), "12927", filings, { read: reader });
  check("the next run picks up where it stopped, asking nothing twice",
    JSON.stringify(order) === JSON.stringify(["000001292718000005"]) && run.stats.left === 0 && run.stats.titled === 3, JSON.stringify(order));
  db.set("000001292720000001", { headline: "Old reading", version: HEADLINE_VERSION - 1 });
  order.length = 0;
  run = await withSecHeadlines(fakeDb(db), "12927", filings, { read: reader });
  check("a headline from an older reading is read again", JSON.stringify(order) === JSON.stringify(["000001292720000001"]) && db.get("000001292720000001")?.version === HEADLINE_VERSION);
  const failing = new Map<string, { headline: string | null; version: number }>();
  let tries = 0;
  run = await withSecHeadlines(fakeDb(failing), "12927", filings, { read: async () => (tries++, null) });
  check("EDGAR failing: three tries and the run stops, storing nothing, so all are asked again next time",
    tries === 3 && failing.size === 0 && run.stats.failed === 3 && run.stats.left === 4, `${tries} tries, ${failing.size} stored`);
  check(`a run reads at most ${HEADLINES_PER_RUN} filings`, HEADLINES_PER_RUN === 150);

  console.log("\nThe timeline's filing stacks still name their forms");
  const stack = ["2018-12-03", "2018-12-04", "2018-12-05"].map((d, i) => ({
    ...eightK(`00000129271800001${i}`, d, "Other events (8-K 8.01)", undefined),
    title: `Boeing Co: Boeing Statement Regarding 2008 10-K Earnings per Share Data (8-K 8.01)`,
  }));
  const html = renderToStaticMarkup(createElement(EventList, { events: stack }));
  check("a headline naming another form does not rename the stack: it reads 8-K, from the closing brackets",
    html.includes("8-K ×3") && !html.includes("10-K ×"), html.match(/(?:8|10)-K ×\d/)?.[0] ?? "no stack");

  console.log("\nWired");
  const ingest = read("scripts/ingest.ts");
  check("the scheduled ingest titles 8-Ks inside its EDGAR step, and an error there costs the headlines only",
    /const titled = await withSecHeadlines\(client, company\.cik, filings\);/.test(ingest) && /headlines skipped: /.test(ingest) && /let events = filings;/.test(ingest));
  const firstPass = read("lib/ingest/firstPass.ts");
  check("the first pass applies headlines already stored and never reads EDGAR for them",
    /applyHeadlines\(filings, await storedHeadlines\(client,/.test(firstPass) && /for \(const ev of titled\) await upsertEvent/.test(firstPass) && !/readFilingHeadline|withSecHeadlines/.test(firstPass));
  check("the table is created by its migration", /CREATE TABLE IF NOT EXISTS sec_headlines \(\s*accession text PRIMARY KEY/.test(read("db/029_sec_headlines.sql")));
  check("the EDGAR requests carry the contact User-Agent", /"User-Agent": "News Charts Research /.test(read("lib/secHeadlines.ts")));

  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  process.exit(fail ? 1 : 0);
}

main();
