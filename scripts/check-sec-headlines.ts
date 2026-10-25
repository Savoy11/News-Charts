import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { PoolClient } from "pg";
import {
  DATELINE_WITHIN,
  HEADLINE_VERSION,
  afterCoverPage,
  decodeDocument,
  findLead,
  headlineCase,
  listedRelease,
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
 * An 8-K's press-release headline as its title (batch 42), and a foreign company's 6-K's (batch 43).
 *
 *   npm run check:sec-headlines
 *
 * Every 8-K was titled by its item — "Other events (8-K 8.01)" — which says what kind of thing was
 * reported and not what it was, and every 6-K just "6-K filing". Offline by construction: the
 * documents are real exhibits and 6-Ks, read from EDGAR on 2026-10-24 and 2026-10-25 and kept in
 * `scripts/fixtures/sec-headlines.json` (their first few thousand characters, presentation
 * attributes dropped), and every EDGAR request below is answered by a stand-in.
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
  check("a bullet's mark set in a cell of its own joins the line it marks, so a page of bullets takes a line each",
    JSON.stringify(textLines("<p>•</p><p>Revenue up 6%</p><p>o</p><p>Cloud up 9%</p>")) === JSON.stringify(["• Revenue up 6%", "• Cloud up 9%"]));
  check("…and an empty bullet before the dateline is dropped, the dateline kept at the start of its line",
    textLines("<p>·</p><p>Zurich/Basel, 29 March 2023 – UBS today said</p>")[0] === "Zurich/Basel, 29 March 2023 – UBS today said");
  const footnoted = "<p>Novartis International AG</p><p>Novartis starts 2019 with strong sales and double digit core1 operating income growth, Pluvicto" +
    "TM launch</p><p>Basel, April 24, 2019 – Novartis today reported…</p>";
  check("a footnote's number and a trademark's letters set on a word are dropped from a headline",
    pressReleaseHeadline(footnoted) === "Novartis starts 2019 with strong sales and double digit core operating income growth, Pluvicto launch",
    String(pressReleaseHeadline(footnoted)));
  check("…but a model's number is kept", pressReleaseHeadline(footnoted.replace("core1 operating income growth, PluvictoTM launch", "PS5 sales growth")) ===
    "Novartis starts 2019 with strong sales and double digit PS5 sales growth");
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
    // an accented capital is a letter of its word, not the end of it: never "NestlÉ"
    ["NESTLÉ REPORTS FIRST-HALF RESULTS", "Nestlé Reports First-Half Results"],
    ["SOCIÉTÉ GÉNÉRALE ANNOUNCES ÉLAN DEAL", "Société Générale Announces Élan Deal"],
    // a name not written as a word keeps its own spelling: never "Jpmorgan", "Unitedhealth", "Nvidia"
    ["JPMORGAN CHASE REPORTS THIRD-QUARTER 2022 NET INCOME", "JPMorgan Chase Reports Third-Quarter 2022 Net Income"],
    ["UNITEDHEALTH GROUP REPORTS FIRST QUARTER RESULTS", "UnitedHealth Group Reports First Quarter Results"],
    ["NVIDIA REPORTS RECORD REVENUE", "NVIDIA Reports Record Revenue"],
    ["EXXONMOBIL'S DUTCH GAS INTERESTS", "ExxonMobil's Dutch Gas Interests"],
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

  console.log("\nA foreign company's 6-K");
  const [, , , shellIndex, nioIndex] = fixture.indexes;
  check("an 8-K's own document is never read for its release: it is the form, and the release is the exhibit",
    m.primary === null && n.primary === null);
  const sh = releaseExhibits(shellIndex.html);
  check(shellIndex.why, sh.exhibits.length === 0 && /\/f6k_110223\.htm$/.test(sh.primary ?? ""), JSON.stringify(sh));
  const ni = releaseExhibits(nioIndex.html);
  check(nioIndex.why, ni.exhibits.length === 1 && ni.exhibits[0].endsWith("/tm2314258d1_ex99-1.htm") && /\/tm2314258d1_6k\.htm$/.test(ni.primary ?? ""),
    JSON.stringify(ni));
  const shell = fixture.cases.find((c) => c.filer === "Shell plc (6-K)")!;
  const shellIndexUrl = "https://www.sec.gov/Archives/edgar/data/1306965/000117184323006632/0001171843-23-006632-index.htm";
  e = edgar({ [shellIndexUrl]: shellIndex.html, [`https://www.sec.gov${sh.primary}`]: shell.doc });
  const fromPrimary = await readFilingHeadline(1306965, "000117184323006632", e.get);
  check("Shell's announcement, read from the 6-K's own document under its cover page: two requests",
    fromPrimary?.headline === shell.headline && fromPrimary?.exhibit === "f6k_110223.htm" && e.asked.length === 2, JSON.stringify(fromPrimary));
  const nio = fixture.cases.find((c) => c.filer === "NIO Inc. (6-K)")!;
  const nioIndexUrl = "https://www.sec.gov/Archives/edgar/data/1736541/000110465923054714/0001104659-23-054714-index.htm";
  e = edgar({ [nioIndexUrl]: nioIndex.html, [`https://www.sec.gov${ni.exhibits[0]}`]: nio.doc });
  const fromAttachment = await readFilingHeadline(1736541, "000110465923054714", e.get);
  check("NIO's release, read from its attachment first: the 6-K's own document is not asked for",
    fromAttachment?.headline === nio.headline && fromAttachment?.exhibit === "tm2314258d1_ex99-1.htm" && e.asked.length === 2, JSON.stringify(fromAttachment));
  e = edgar({ [nioIndexUrl]: nioIndex.html, [`https://www.sec.gov${ni.exhibits[0]}`]: contract.doc, [`https://www.sec.gov${ni.primary}`]: shell.doc });
  const thenPrimary = await readFilingHeadline(1736541, "000110465923054714", e.get);
  check("…and when the attachment is no release, the 6-K's own document is read next",
    thenPrimary?.headline === shell.headline && thenPrimary?.exhibit === "tm2314258d1_6k.htm" && e.asked.length === 3, JSON.stringify(thenPrimary));
  e = edgar({ [nioIndexUrl]: nioIndex.html, [`https://www.sec.gov${ni.exhibits[0]}`]: contract.doc, [`https://www.sec.gov${ni.primary}`]: contract.doc });
  const neither = await readFilingHeadline(1736541, "000110465923054714", e.get);
  check("neither a release: no headline, the attachment named", neither?.headline === null && neither.exhibit === "tm2314258d1_ex99-1.htm", JSON.stringify(neither));

  const cover = [
    "FORM 6-K",
    "REPORT OF FOREIGN PRIVATE ISSUER PURSUANT TO RULE 13a-16 OR 15d-16 UNDER THE SECURITIES EXCHANGE ACT OF 1934",
    "Commission File Number: 1-32575",
    "Indicate by check mark whether the registrant files or will file annual reports under cover of Form 20-F or Form 40-F.",
    "Form 20-F ☒ Form 40-F ☐",
    "Shell announces commencement of a share buyback programme",
  ];
  check("the SEC's cover page is cut: the announcement starts after its last check box",
    JSON.stringify(afterCoverPage(cover)) === JSON.stringify(cover.slice(5)), JSON.stringify(afterCoverPage(cover)));
  const lead = "Shell plc (the ‘Company’) today announces the commencement of a share buyback programme covering an aggregate contribution of up to $3.5 billion, which is expected to be completed prior to the Company’s Q4 2023 results announcement.";
  const signed = ["Shell announces commencement of a share buyback programme", lead, "SIGNATURES", "Pursuant to the requirements of the Securities Exchange Act of 1934, the registrant has duly caused this report to be signed", "By: /s/ Sean Ashley"];
  check("…but the signature under an announcement is no cover page: once a paragraph of text is passed, nothing above it is cut",
    afterCoverPage(signed)[0] === signed[0], JSON.stringify(afterCoverPage(signed)[0]));
  check("with no dateline, a lead paragraph in which the company announces today marks the release, and its headline is above it",
    findLead(signed)?.line === 1 && pressReleaseHeadline(signed.map((l) => `<p>${l}</p>`).join("")) === "Shell announces commencement of a share buyback programme");
  check("…but not on the first line, with nothing above it to be a headline, nor in a line too short to be a paragraph",
    findLead([lead]) === null && findLead(["Apple Reports Results", "Apple today announced results."]) === null);
  check("a Japanese 6-K's list of what it carries: \"Press release entitled “…”\" gives the title",
    listedRelease(["Documents attached hereto:", "i) Press release entitled “Agreement to Transfer to Sony Certain Epson Business Assets”"]) ===
      "Agreement to Transfer to Sony Certain Epson Business Assets");
  check("…and a quoted title that wraps over lines",
    listedRelease(["Press release, dated April 19, 2001, announcing, \"Novartis group", "sales up by 11% in the first quarter\""]) === "Novartis group sales up by 11% in the first quarter",
    String(listedRelease(["Press release, dated April 19, 2001, announcing, \"Novartis group", "sales up by 11% in the first quarter\""])));

  console.log("\nWhich 8-Ks and 6-Ks are asked about");
  const asked = (label: string, items?: string) => mayCarryRelease(eightK("000001292719000001", "2019-01-01", label, items));
  check("one with exhibits (9.01)", asked("Other events (8-K 8.01)", "Items 8.01 Other events · 9.01 Financial statements and exhibits"));
  check("results, and an officer change filed without listing 9.01, which often carry a release anyway",
    asked("Earnings announcement (8-K)", "Item 2.02 Results of operations") && asked("Officer or director change (8-K 5.02)", "Item 5.02 Officer or director change"));
  check("not a shareholder vote filed bare", !asked("Shareholder vote results (8-K 5.07)", "Item 5.07 Shareholder vote results"));
  check("one from before 2004, whose item numbers meant other things, and one listing none", asked("8-K filing", "Items 5 · 7") && asked("8-K filing"));
  check("amended 8-Ks too", asked("Amended: Officer or director change (8-K/A 5.02)", "Items 5.02 Officer or director change · 9.01 Financial statements and exhibits"));
  check("every 6-K, which lists no items", asked("6-K filing"));
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
  const sixK = withHeadline({ title: "NIO Inc.: 6-K filing", description: undefined as string | undefined }, "NIO Inc. Provides April 2023 Delivery Update");
  check("a 6-K's title: the headline, then (6-K)",
    sixK.title === "NIO Inc.: NIO Inc. Provides April 2023 Delivery Update (6-K)" && sixK.description === "6-K filing. The headline is the press release's, filed with it.",
    `${sixK.title} / ${sixK.description}`);
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
