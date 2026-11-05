import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import tickerIndex from "../data/edgar-tickers.json";
import {
  conformedKey,
  digestEntries,
  digestEntryNames,
  digestIssueRows,
  DigestNameIndex,
  digestNames,
  digestNamesOn,
  digestOnPage,
  digestPdfText,
  EDGAR_PHASED_IN,
  firstNamesIn,
  foldedKey,
  headingParties,
  namesInUse,
  ocrReads,
  parseCompanyIndex,
  parseDigestArchive,
  parseEdgarRecord,
  recordStart,
  type DigestEntry,
  type DigestNames,
  type DigestRow,
  type EdgarRecord,
} from "../lib/secDigest";

/**
 * The SEC News Digest reader and its name rule (batch 87, the 2026-11-02 proposal 1, step 1: the
 * count the owner approved before the source is built).
 *
 *   npm run check:digest
 *
 * The text is real: six issues, one every five years from 1965 to 1990, as `pdftotext -layout`
 * read the PDFs the scout fetched on 2026-11-02 (the reader's own output, compared byte for byte
 * on 2026-11-03), and the 1985 archive page. The names are real: every listed company in the
 * committed index under its title, everyday name and own other names, and every other name EDGAR
 * lists for it (`cik-lookup-data.txt`, last modified 2026-10-31) — so the replay below runs every
 * entry of the six issues against every company, as the count does. The dates are real: the EDGAR
 * records of every company an entry could be (data.sec.gov/submissions, read 2026-11-03), with the
 * names each filed under in its first quarter of EDGAR's 1993–1996 company indexes. Offline.
 */

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: unknown): void {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n      ${JSON.stringify(detail)}`}`);
}
const load = (file: string) => JSON.parse(gunzipSync(readFileSync(join(__dirname, "fixtures", file))).toString("utf8"));
const read = (file: string) => readFileSync(join(__dirname, "..", file), "utf8");

interface Issue {
  day: string;
  url: string;
  text: string;
}
const fx = load("digest-issues.json.gz") as { archive: { year: number; html: string }; issues: Issue[] };
const edgar = load("digest-names.json.gz") as { names: Record<string, string[]> };
const records = (load("digest-records.json.gz") as { records: Record<string, EdgarRecord> }).records;

const ticker = new Map<number, string>();
const titleOf = new Map<number, string>();
const names = new Map<number, DigestNames>();
for (const [cik, t, title] of tickerIndex.companies as [number, string, string][]) {
  if (names.has(cik)) continue; // a company's first ticker in the index's order is its page's
  ticker.set(cik, t);
  titleOf.set(cik, title);
  names.set(cik, digestNames(cik, title, edgar.names[String(cik)] ?? []));
}
const cikOf = (t: string) => [...ticker.entries()].find(([, x]) => x === t)![0];
const index = new DigestNameIndex(names);
const issue = (day: string) => fx.issues.find((i) => i.day === day)!;
const entriesOf = (day: string) => digestEntries(issue(day).text);
/** the names a company had on the day, from its record — every candidate in the six issues has one in the fixture */
const namesOn = (day: string) => (cik: number) => {
  const record = records[String(cik)];
  return record ? digestNamesOn(day, cik, titleOf.get(cik)!, record) : null;
};
const rowsOf = (day: string): DigestRow[] => digestIssueRows(day, entriesOf(day), index, namesOn(day));
const undatedOf = (day: string): DigestRow[] => digestIssueRows(day, entriesOf(day), index);
const on = (rows: DigestRow[], t: string) => rows.filter((r) => ticker.get(r.cik) === t);
const show = (rows: DigestRow[]) => rows.map((r) => `${ticker.get(r.cik)} ${r.kind} ${r.how}`).sort();
const today = (t: string) => digestNames(cikOf(t), titleOf.get(cikOf(t))!);
const heading = (party: string): DigestEntry => ({ kind: "order", party, row: false, line: party });
const row = (party: string): DigestEntry => ({ kind: "8-K report", party, row: true, line: party });

(async () => {
  // ── the archive ──
  const issues = parseDigestArchive(fx.archive.html, 1985);
  check("the 1985 archive page lists 250 issues, each once, oldest first, dated by the page",
    issues.length === 250 && new Set(issues.map((i) => i.url)).size === 250 && issues[0].day === "1985-01-02" &&
      issues[0].url === "https://www.sec.gov/news/digest/1985/dig010285.pdf" && issues[249].day === "1985-12-31" &&
      issues.every((i, k) => i.day.startsWith("1985-") && (k === 0 || issues[k - 1].day <= i.day)),
    { n: issues.length, first: issues[0], last: issues.at(-1) });
  check("a link dated in another year is not the year's", parseDigestArchive(fx.archive.html, 1986).length === 0);

  // ── the full replay: every entry of the six issues against every listed company, under its names that day ──
  check("every company an entry of the six issues could be, under any of its names, has its EDGAR record in the fixture",
    fx.issues.every((i) => digestEntries(i.text).every((e) => index.candidates(e).every((c) => !index.match(e).some((m) => m.cik === c) || !!records[String(c)]))));
  const expected: Record<string, string[]> = {
    "1965-06-15": [],
    "1970-06-15": [],
    "1975-06-16": [
      "ABT 8-K report conformed", "AIR 8-K report conformed", "AXP registration effective caption", "CW 8-K report conformed",
      "EAI order conformed", "HUM registration conformed", "M 8-K report conformed", "MMM 8-K report conformed", "PEP 8-K report conformed",
      "POR registration effective caption", "SO 8-K report conformed", "TCPA 8-K report conformed",
    ],
    "1980-06-16": [],
    "1985-01-02": ["GPJA order conformed"],
    "1990-06-15": [
      "AXP 8-K report folded", "CMS 8-K report folded", "CMS-PB 8-K report folded", "HAS stake conformed", "NL 8-K report conformed",
      "SCE-PM 8-K report folded", "SPGI listing caption", "SPRS 8-K report folded", "STAA stake conformed",
    ],
  };
  for (const [day, want] of Object.entries(expected)) {
    const got = show(rowsOf(day));
    check(`${day}: the rows on listed companies are exactly ${want.length ? want.map((w) => w.split(" ")[0]).join(", ") : "none"}`,
      JSON.stringify(got) === JSON.stringify([...want].sort()), got);
  }
  const undated1975 = undatedOf("1975-06-16").map((r) => ticker.get(r.cik));
  check("1975: under every name, undated, the rows would add ROK and AWK — names those records took later, or records younger than the issue",
    undated1975.includes("ROK") && undated1975.includes("AWK") && !show(rowsOf("1975-06-16")).some((r) => /^(?:ROK|AWK) /.test(r)) &&
      namesInUse("1975-06-16", titleOf.get(cikOf("ROK"))!, records[String(cikOf("ROK"))]).join() === "NEW ROCKWELL INTERNATIONAL CORP" &&
      recordStart(records[String(cikOf("AWK"))])! > EDGAR_PHASED_IN, undated1975);

  // ── the scout's cases ──
  const r1975 = rowsOf("1975-06-16");
  const abt = on(r1975, "ABT")[0];
  check("Abbott's 8-K of May 1975 (item 14) lands on ABT in the 1975-06-16 issue, by its conformed name",
    !!abt && abt.day === "1975-06-16" && abt.kind === "8-K report" && abt.how === "conformed" && /ABBOTT\s+LABORATORIES\s+14\s+05\/75/.test(abt.entries[0].line), abt);
  const mmm = on(r1975, "MMM")[0];
  check("3M's lands under its EDGAR former name, MINNESOTA MINING & MANUFACTURING CO, the list's \"&\" dropped",
    !!mmm && mmm.entries[0].party === "MINNESOTA MINING MANUFACTURING CO" && digestEntryNames(mmm.entries[0], today("MMM"), cikOf("MMM")) === null &&
      names.get(cikOf("MMM"))!.conformed.includes("MINNESOTA MINING & MANUFACTURING CO"), mmm);
  const hum = on(r1975, "HUM")[0];
  check("Humana's S-16 registration lands on HUM, by the registrant the row names",
    !!hum && hum.kind === "registration" && /^S-16\s+HUMANA\s+INC$/.test(hum.entries[0].line), hum);
  const db = on(undatedOf("1985-01-02"), "DB")[0];
  check("Deutsche Bank AG's Investment Company Act order (IC-14293) names DB by its heading, but DB's record began in 2002: no row, as the first-price floor (1996-11-18) would also say",
    !!db && db.kind === "order" && db.entries[0].party === "DEUTSCHE BANK AG" && on(rowsOf("1985-01-02"), "DB").length === 0 &&
      recordStart(records[String(cikOf("DB"))]) === "2002-01-30" && namesInUse("1985-01-02", titleOf.get(cikOf("DB"))!, records[String(cikOf("DB"))]).length === 0 &&
      !digestOnPage("1985-01-02", "1996-11-18"), db);
  const r1990 = rowsOf("1990-06-15");
  const has = on(r1990, "HAS");
  check("Hasbro's five 13D filings of the issue make one row on HAS",
    has.length === 1 && has[0].kind === "stake" && has[0].entries.length === 5 && has[0].entries.every((e) => e.party === "HASBRO INC"), has);
  const regis = entriesOf("1980-06-16").find((e) => e.party === "ST. REGIS PAPER COMPANY");
  check("1980: the registration whose body names its underwriter (\"Morgan Stanley & Co. Incorporated\") is St. Regis Paper's entry, on no page",
    !!regis && regis.kind === "registration" && rowsOf("1980-06-16").length === 0 &&
      digestEntryNames(regis, names.get(cikOf("MS"))!, cikOf("MS")) === null && /Morgan Stanley & Co\. Incorporated/.test(issue("1980-06-16").text));
  const spgi = on(r1990, "SPGI")[0];
  check("McGraw-Hill's 1990 delisting lands on S&P Global, whose record filed as MCGRAW HILL INC in 1994, not on McGraw Hill (MH), whose record began in 2022",
    !!spgi && /^McGraw-Hill, Inc/.test(spgi.entries[0].party) && digestEntryNames(spgi.entries[0], today("SPGI"), cikOf("SPGI")) === null &&
      records[String(cikOf("SPGI"))].firstNames!.join() === "MCGRAW HILL INC" && on(r1990, "MH").length === 0 &&
      on(undatedOf("1990-06-15"), "MH").length === 0 && on(undatedOf("1990-06-15"), "SPGI").length === 0 && digestOnPage(spgi.day, "1973-02-21"), spgi);
  const shared: string[] = [];
  digestIssueRows("1990-06-15", entriesOf("1990-06-15"), index, undefined, (e, ciks) => shared.push(`${e.party.slice(0, 11)}:${ciks.map((c) => ticker.get(c)).sort()}`));
  check("under every name, undated, the two claim it alike and it is neither's: an entry is about one name",
    shared.join() === "McGraw-Hill:MH,SPGI", shared);
  check("the first-price floor: on the first day and after, never before, never with no prices",
    digestOnPage("1990-06-15", "1990-06-15") && !digestOnPage("1990-06-14", "1990-06-15") && !digestOnPage("1990-06-15", null) && !digestOnPage("1990-06-15", undefined));

  // ── reading the sections ──
  const kinds = (day: string) => entriesOf(day).reduce<Record<string, number>>((a, e) => ((a[e.kind] = (a[e.kind] ?? 0) + 1), a), {});
  const k1985 = kinds("1985-01-02");
  check("1985-01-02: the 8-K list read as 70 rows, the 13D and 14D-1 list as 23 companies bought, six orders",
    k1985["8-K report"] === 70 && k1985.stake === 23 && k1985.order === 6, k1985);
  const k1975 = kinds("1975-06-16");
  check("1975-06-16: the 8-K list read as 276 rows, its headings spaced wide (\"SECURITIES      ACT REGISTRATIONS\") still read",
    k1975["8-K report"] === 276 && k1975.registration === 9 && k1975["registration effective"] === 20, k1975);
  const axp = on(r1990, "AXP")[0];
  check("1990: the 8-K list, its heading a graphic the scan lost, opens on its preamble; American Express's row is read back through the OCR",
    !!axp && axp.kind === "8-K report" && axp.how === "folded" && axp.entries[0].party === "AIERICAI EIPRESS CO", axp);
  check("a heading's body is never its party: Georgia Power's order names \"The Southern Company\", which gets no row",
    /subsidiary of The Southern Company/.test(issue("1985-01-02").text) && on(rowsOf("1985-01-02"), "SO").length === 0);
  const e1965 = entriesOf("1965-06-15");
  check("1965's run-in paragraphs read by their capitals lead-in, cut to the parties",
    e1965.some((e) => e.kind === "order" && e.party === "CONSOLIDATED NATURAL GAS") && e1965.some((e) => e.kind === "enforcement" && e.party === "GOLDEN SANDS CORP., OTHER5"),
    e1965.slice(0, 6));
  check("a page's running head is no entry, whatever the OCR made of it (\"NEWS DI2ST June 16 9i5\")",
    entriesOf("1975-06-16").every((e) => !/\bNEWS\s+DI/i.test(e.party)));

  // ── the names' dates ──
  const rec = (t: string) => records[String(cikOf(t))];
  const on1985 = (t: string) => namesInUse("1985-06-03", titleOf.get(cikOf(t))!, rec(t));
  check("before EDGAR a record has the names it filed under in its first quarter: JPMorgan's is Chemical Banking's, Bank of America's NationsBank's, Chubb's ACE's",
    on1985("JPM").join() === "CHEMICAL BANKING CORP" && on1985("BAC").join() === "NATIONSBANK CORP" && on1985("CB").join() === "ACE LTD",
    { JPM: on1985("JPM"), BAC: on1985("BAC"), CB: on1985("CB") });
  check("so 1985's Chase Manhattan, BankAmerica and Chubb are none of theirs",
    digestEntryNames(row("CHASE MANHATTAN CORP"), digestNamesOn("1985-11-01", cikOf("JPM"), titleOf.get(cikOf("JPM"))!, rec("JPM")), cikOf("JPM")) === null &&
      digestEntryNames(row("BANKAMERICA CORP"), digestNamesOn("1985-06-10", cikOf("BAC"), titleOf.get(cikOf("BAC"))!, rec("BAC")), cikOf("BAC")) === null &&
      digestEntryNames(heading("The Chubb Corporation"), digestNamesOn("1985-04-17", cikOf("CB"), titleOf.get(cikOf("CB"))!, rec("CB")), cikOf("CB")) === null &&
      digestEntryNames(row("CHASE MANHATTAN CORP"), names.get(cikOf("JPM"))!, cikOf("JPM")) === "conformed");
  check("within EDGAR each name holds its own days: JPMorgan's record was Chase Manhattan in 1998, Chevron's ChevronTexaco in 2003 and Chevron again in 1994",
    namesInUse("1998-06-01", titleOf.get(cikOf("JPM"))!, rec("JPM")).join() === "CHASE MANHATTAN CORP /DE/" &&
      namesInUse("2003-06-01", titleOf.get(cikOf("CVX"))!, rec("CVX")).join() === "CHEVRONTEXACO CORP" &&
      namesInUse("1994-06-01", titleOf.get(cikOf("CVX"))!, rec("CVX")).join() === titleOf.get(cikOf("CVX")));
  const noIndex: EdgarRecord = { ...rec("SO"), firstNames: undefined };
  check("without the indexes, a record's first name reaches back to its first filing, which EDGAR dates days before the name (Southern Co, 1994-01-21 and -28)",
    namesInUse("1985-06-03", "SOUTHERN CO", noIndex).join() === "SOUTHERN CO" && noIndex.firstFiled === "1994-01-21" && noIndex.formerNames[0].from === "1994-01-28");
  check("a record EDGAR opened after its phase-in has no names before it began (McGraw Hill, 2022; American Water Works, 2007)",
    namesInUse("1990-06-15", titleOf.get(cikOf("MH"))!, rec("MH")).length === 0 && namesInUse("1975-06-16", titleOf.get(cikOf("AWK"))!, rec("AWK")).length === 0 &&
      namesInUse("2023-06-01", titleOf.get(cikOf("MH"))!, rec("MH")).length === 1);
  const q1 = parseCompanyIndex(
    "Company Name                                                  Form Type   CIK         Date Filed  File Name\n" +
      "---------------------------------------------------------------------------------------------------------------------------------------------\n" +
      "ACE LTD                                                       SC 13G           896159      1995-02-14  edgar/data/896159/0000109880-95-000078.txt          \n" +
      "CHEMICAL BANKING CORP                                         10-K405          19617       1995-03-27  edgar/data/19617/0000950123-95-000706.txt           \n",
  );
  const q2 = parseCompanyIndex("CHASE MANHATTAN CORP /DE/                                     10-Q             19617       1996-08-14  edgar/data/19617/0000019617-96-000001.txt\n");
  const firsts = firstNamesIn([q1, q2]);
  check("a quarter's company index read: each filing's name, CIK and day; a record's first names are its first quarter's",
    q1.length === 2 && q1[1].cik === 19617 && q1[1].filed === "1995-03-27" && firsts.get(19617)!.join() === "CHEMICAL BANKING CORP" && firsts.get(896159)!.join() === "ACE LTD");
  check("a submissions file read: former names with their days, and the first filing over the recent list and the older files",
    JSON.stringify(parseEdgarRecord({ formerNames: [{ name: "OLD CO ", from: "1994-01-28T00:00:00.000Z", to: "2001-02-03T00:00:00.000Z" }], filings: { recent: { filingDate: ["2026-01-02"] }, files: [{ filingFrom: "1994-01-21" }] } })) ===
      JSON.stringify({ formerNames: [{ name: "OLD CO", from: "1994-01-28", to: "2001-02-03" }], firstFiled: "1994-01-21" }));

  // ── the rule's pieces ──
  check("a heading is cut to its parties: after AGAINST, before its verb phrase",
    headingParties("PROCEEDINGS INSTITUTED AGAINST HARRY ABRAMS") === "HARRY ABRAMS" &&
      headingParties("CLARENCE E. LONG AND JOSEPH A. LUGO ENJOINED") === "CLARENCE E. LONG AND JOSEPH A. LUGO" &&
      headingParties("CONSOLIDATED NATURAL GAS RECEIVES ORDER") === "CONSOLIDATED NATURAL GAS" && headingParties("MIDDLE SOUTH UTILITIES, INC.") === "MIDDLE SOUTH UTILITIES, INC");
  check("a conformed name's key drops its tag, its punctuation, and \"&\" or AND",
    conformedKey("MINNESOTA MINING & MANUFACTURING CO") === conformedKey("MINNESOTA MINING MANUFACTURING CO") &&
      conformedKey("ENTERGY CORP /DE/") === "ENTERGY CORP" && conformedKey("HASBRO, INC.") === conformedKey("HASBRO INC"));
  check("the OCR's misreadings fold back: N, M, X, L and 1 as I; 0 and Q as O",
    foldedKey("AMERICAN EXPRESS CO") === foldedKey("AIERICAI EIPRESS CO") && foldedKey("CMS ENERGY CORP") === foldedKey("CMS ElERGY CORP") && foldedKey("SOUTHERN CO") !== foldedKey("SOUTHERN INC"));
  check("a misreading is read back one way only, as the scanner printed it: not Mitel for Intel, NCNB for LCNB, INTL INC for MNTN (the 1985 count's, before the rule)",
    ocrReads("AIERICAI EIPRESS CO", "AMERICAN EXPRESS CO") && ocrReads("CMS ElERGY CORP", "CMS ENERGY CORP") && ocrReads("NEWNONT MINING CORP", "NEWMONT MINING CORP") &&
      ocrReads("SMITH A 0 CORP", "SMITH A O CORP") && !ocrReads("MITEL CORP", "INTEL CORP") && !ocrReads("NCNB CORP", "LCNB CORP") && !ocrReads("INTL INC", "MNTN, Inc.") &&
      index.match(row("MITEL CORP")).length === 0 && index.match(row("NCNB CORP")).every((m) => ticker.get(m.cik) !== "LCNB"));
  check("a conformed name of one word names no one: a scan's broken row \"ORANGE\" is not Orange S.A.",
    index.match(row("ORANGE")).length === 0 && names.get(cikOf("FNCTF"))!.conformed.includes("ORANGE"));
  check("a row's registration tag must be the company's: \"FIRST NATIONAL CORP/LAI\" (Louisiana's, 1985) is not Virginia's First National Corp",
    digestEntryNames(row("FIRST NATIONAL CORP/LAI"), names.get(cikOf("FXNC"))!, cikOf("FXNC")) === null &&
      digestEntryNames(row("FIRST NATIONAL CORP"), names.get(cikOf("FXNC"))!, cikOf("FXNC")) === "conformed");
  check("\"AND\" inside a utility's name parts no parties: ARKANSAS POWER AND LIGHT COMPANY is Entergy Arkansas's, not Light S.A.'s (the 1985 count's 14 rows before the rule)",
    index.match(heading("ARKANSAS POWER AND LIGHT COMPANY")).map((m) => ticker.get(m.cik)).join() === "EAI" && index.match(heading("JERSEY CENTRAL POWER AND LIGHT COMPANY")).every((m) => ticker.get(m.cik) !== "LGSXY"));
  check("a legal form's long and short words are one key: STAAR SURGICAL COMPANY is STAAR SURGICAL CO, SERVICE CORPORATION INTERNATIONAL is SERVICE CORP INTERNATIONAL",
    conformedKey("STAAR SURGICAL COMPANY") === conformedKey("STAAR SURGICAL CO") && conformedKey("SERVICE CORPORATION INTERNATIONAL") === "SERVICE CORP INTERNATIONAL");
  check("a misreading is read back in a table's row only, never in a heading",
    digestEntryNames(row("AIERICAI EIPRESS CO"), names.get(cikOf("AXP"))!, cikOf("AXP")) === "folded" &&
      digestEntryNames(heading("AIERICAI EIPRESS CO"), names.get(cikOf("AXP"))!, cikOf("AXP")) === null);
  check("a folded key two listed companies share names neither (NMI Holdings, NLI Holdings)",
    foldedKey("NMI Holdings, Inc.") === foldedKey("NLI HOLDINGS, INC.") && index.match(row("IMI HOLDIIGS IIC")).length === 0 &&
      index.match(row("NMI HOLDINGS INC")).map((m) => ticker.get(m.cik)).join() === "NMIH");
  check("a conformed name two listed companies share names neither (FIRST BANCORP, Puerto Rico's and North Carolina's)",
    index.match(row("FIRST BANCORP")).length === 0);
  check("a one-word name in a heading needs its legal words: \"NEWS\" is not News Corp, \"NEWS CORP\" is",
    index.match(heading("NEWS")).length === 0 && index.match(heading("NEWS CORP")).some((m) => ticker.get(m.cik)?.startsWith("NWS")));
  check("a longer listed name owns the heading: \"PORTLAND GENERAL ELECTRIC COMPANY\" is not General Electric's",
    index.match(heading("PORTLAND GENERAL ELECTRIC COMPANY")).map((m) => ticker.get(m.cik)).join() === "POR");

  // ── the reader and the report ──
  const path = process.env.PATH;
  process.env.PATH = "/nonexistent";
  const missing = await digestPdfText(Buffer.from("%PDF-1.4")).then(() => "read", (e: Error) => e.message);
  process.env.PATH = path;
  check("with no pdftotext on the host the reader says so", missing === "pdftotext is not installed (poppler-utils)", missing);
  const report = read("scripts/digest-report.ts");
  const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
  check("npm run digest-report counts with the library's own rows, dated names and floor, a second apart, stores nothing",
    pkg.scripts["digest-report"] === "tsx scripts/digest-report.ts" && /digestIssueRows\(issue\.day, entries, index\)/.test(report) &&
      /digestIssueRows\(issue\.day, issue\.entries, index, namesOn,/.test(report) &&
      /digestNamesOn\(issue\.day, cik, byCik\.get\(cik\)!\.title, record, before\.get\(cik\)\)/.test(report) &&
      /for \(const q of FIRST_QUARTERS\)/.test(report) && /digestOnPage\(r\.day, floor\.get\(r\.cik\)\)/.test(report) &&
      /const PACE_MS = 1_000;/.test(report) && !/getPool|INSERT|UPDATE /.test(report));
  check("check:digest is in the offline chain", /npm run check:digest\b/.test(pkg.scripts.check) && pkg.scripts["check:digest"] === "tsx scripts/check-digest.ts");

  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  process.exit(fail ? 1 : 0);
})();
