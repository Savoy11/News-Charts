import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import type { PoolClient } from "pg";
import approvalsFile from "../data/fda-nme-approvals.json";
import tickerIndex from "../data/edgar-tickers.json";
import { deterministicScore } from "../lib/enrich/relevance";
import { dojPossessive } from "../lib/doj";
import { withoutTag } from "../lib/edgarName";
import {
  APPROVALS,
  APPLICANT_NAMES,
  NME_FILE,
  NOT_THE_APPLICANT,
  approvalEvents,
  approvalIsCompany,
  drugsAtFdaUrl,
  readApprovals,
  type FdaApproval,
} from "../lib/fdaApprovals";
import { FDA_FIRMS, firmFor } from "../lib/fdaRecalls";
import { companyNames } from "../lib/frCompany";
import { namesForYear } from "../lib/ingest/frBackfill";
import { fdaApprovalsFor } from "../lib/ingest/fdaApprovalsFor";
import { QUOTAS } from "../lib/ingest/quota";
import { SOURCE_TTL_MINUTES } from "../lib/ingest/refresh";
import { SOURCES } from "../lib/ingest/store";
import { isNotesRecord } from "../lib/releaseNames";
import { newsNamesFor, possessiveNameFor } from "../lib/sec";
import { excelDay, readSheet } from "../lib/xlsx";
import { COMPANY_SOURCES } from "./ingest";

/**
 * The FDA's new-drug approvals (batch 105, the 2026-11-06 proposal 1, approved by the owner on
 * 2026-11-06).
 *
 *   npm run check:fda-approvals
 *
 * The workbook is real: CDER's compilation as www.fda.gov served it on 2026-11-06
 * (scripts/fixtures/fda-nme-2026-11-06.xlsx, 1,387 approvals), read with the repository's own
 * reader, and the committed data file must be exactly what that reading gives. The names are the
 * committed index's, former names aside, so the counts below are what a page gets before its
 * EDGAR former names add more at ingest. Offline.
 */

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: unknown): void {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n      ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 500)}`}`);
}
const root = join(__dirname, "..");
const read = (file: string) => readFileSync(join(root, file), "utf8");
const companies = tickerIndex.companies as [number, string, string][];
const rowOf = (ticker: string) => {
  const r = companies.find(([, t]) => t === ticker);
  if (!r) throw new Error(`no ${ticker} in the ticker index`);
  return r;
};
function namesOf(ticker: string): (year: number) => string[] {
  const [cik, , title] = rowOf(ticker);
  const own = dojPossessive(title, possessiveNameFor(cik));
  return (year) => [...companyNames(title, namesForYear(year, newsNamesFor(cik), [])), ...(own ? [own] : []), withoutTag(title)];
}
const byApp = (application: string) => APPROVALS.find((a) => a.application === application)!;
const named = (name: string) => APPROVALS.find((a) => a.name === name)!;
const on = (ticker: string, a: FdaApproval) => approvalIsCompany(a, rowOf(ticker)[0], namesOf(ticker));
// each company is asked only the approvals whose applicant holds one of its names' letters or one of
// its firms: the rule itself decides, and asking every company every approval takes minutes
const alnum = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
const letters = APPROVALS.map((a) => alnum(a.applicant));
const CANDIDATES = new Map<string, { cik: number; approvals: FdaApproval[] }>();
const asked = new Set<number>();
for (const [cik, ticker] of companies) {
  // one company a CIK, under its first ticker, as ingest holds one page a record
  if (asked.has(cik) || isNotesRecord(cik)) continue;
  asked.add(cik);
  const keys = [...new Set(namesOf(ticker)(2020).map(alnum).filter((k) => k.length >= 2))];
  const firms = [...(FDA_FIRMS[cik]?.firms ?? []), ...(APPLICANT_NAMES[cik]?.names ?? [])];
  const approvals = APPROVALS.filter((a, i) => keys.some((k) => letters[i].includes(k)) || firmFor(a.applicant, a.day, firms) !== null);
  if (approvals.length) CANDIDATES.set(ticker, { cik, approvals });
}
const pagesOf = (a: FdaApproval) => [...CANDIDATES].filter(([t, c]) => c.approvals.includes(a) && on(t, a)).map(([t]) => t);

/** First trading days as Yahoo gave them on 2026-11-06 (`firstTradeDate`, the scout's reads), which a company's stored prices begin with. */
const FIRST_PRICES: Record<string, string> = {
  LLY: "1972-06-01", JNJ: "1962-01-02", ABBV: "2013-01-02", PG: "1962-01-02", MRK: "1962-01-02", GE: "1962-01-02", NVS: "1996-11-07",
  AZN: "1993-05-12", AMGN: "1983-06-17", GILD: "1992-01-22", ABT: "1980-03-17", NVO: "1981-04-30", PFE: "1972-06-01", VRTX: "1991-07-24",
  BMY: "1972-06-01", GSK: "1980-03-28", SNY: "2002-07-01", MMM: "1962-01-02", REGN: "1991-04-02", TAK: "2010-01-05", TEVA: "1982-02-16",
  BIIB: "1991-09-17", ALC: "2019-04-09", BMRN: "1999-07-26", BLCO: "2022-05-06", BHC: "1994-03-29",
};

async function main(): Promise<void> {
  console.log("\nThe workbook reader (lib/xlsx.ts)");
  const shared = `<sst><si><t>Proprietary Name</t></si><si><t>Applicant</t></si><si><r><t>Eli </t></r><r><t>Lilly &amp; Co</t></r></si><si><t>Prozac</t></si></sst>`;
  const sheet =
    `<worksheet><sheetData>` +
    `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1" t="inlineStr"><is><t>FDA Approval Date</t></is></c></row>` +
    `<row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2" t="s"><v>2</v></c><c r="D2"><v>32505</v></c></row>` +
    `<row r="3"><c r="A3" t="inlineStr"><is><t>Lynkuet</t></is></c><c r="D3" t="s"><v>4</v></c></row>` +
    `</sheetData></worksheet>`;
  const tiny = makeZip([
    ["xl/worksheets/sheet1.xml", sheet, true],
    ["xl/sharedStrings.xml", shared.replace("</sst>", "<si><t>10/24/2025</t></si></sst>"), false],
  ]);
  const rows = readSheet(tiny);
  check("a sheet's cells are read by column, shared, rich and inline strings alike, a skipped column left empty",
    rows.length === 2 && rows[0]["Proprietary Name"] === "Prozac" && rows[0]["Applicant"] === "Eli Lilly & Co" && rows[0]["FDA Approval Date"] === "32505" && rows[1]["Applicant"] === "" && rows[1]["FDA Approval Date"] === "10/24/2025",
    rows);
  check("  …a date is Excel's day serial or a date written as text; anything else is no date",
    excelDay("32505") === "1988-12-28" && excelDay("31146") === "1985-04-09" && excelDay("10/24/2025") === "2025-10-24" && excelDay("2025-09-25 00:00:00") === "2025-09-25" &&
      excelDay("2/30/2025") === null && excelDay("60") === null && excelDay("Pending") === null && excelDay("") === null);
  let refused = "";
  try {
    readSheet(makeZip([["other.xml", "<x/>", false]]));
  } catch (err) {
    refused = String(err);
  }
  check("  …and a zip that is no workbook is refused", /not a workbook/.test(refused), refused);

  console.log("\nThe committed approvals, from the FDA's workbook of 2026-11-06");
  const workbook = readFileSync(join(root, "scripts/fixtures/fda-nme-2026-11-06.xlsx"));
  const fromWorkbook = readApprovals(workbook);
  check("data/fda-nme-approvals.json is exactly the workbook as the reader reads it", JSON.stringify(fromWorkbook) === JSON.stringify(APPROVALS) && (approvalsFile as { read: string }).read === "2026-11-06");
  check("  …1,387 approvals from Lupron (1985-04-09) to Nereus (2025-12-30), 943 before 2017, 279 biologics",
    APPROVALS.length === 1387 && APPROVALS[0].name === "Lupron" && APPROVALS[0].day === "1985-04-09" && APPROVALS.at(-1)!.name === "Nereus" && APPROVALS.at(-1)!.day === "2025-12-30" &&
      APPROVALS.filter((a) => a.day < "2017").length === 943 && APPROVALS.filter((a) => a.kind === "BLA").length === 279,
    `${APPROVALS.length}; ${APPROVALS.filter((a) => a.day < "2017").length} before 2017; ${APPROVALS.filter((a) => a.kind === "BLA").length} BLAs`);
  const textDays = readSheet(workbook).filter((r) => /\//.test(r["FDA Approval Date"]));
  check("  …the 14 approvals of late 2025 whose day the sheet writes as text are read: Bayer's Lynkuet on 2025-10-24",
    textDays.length === 14 && textDays.every((r) => APPROVALS.some((a) => a.name === r["Proprietary Name"] && a.day === excelDay(r["FDA Approval Date"]))) && named("Lynkuet").day === "2025-10-24",
    textDays.length);
  check("  …each with its application, applicant and review: Prozac is NDA 18936, Eli Lilly's, a priority review",
    byApp("18936").name === "Prozac" && byApp("18936").applicant === "Eli Lilly" && byApp("18936").priority && byApp("18936").kind === "NDA" && APPROVALS.every((a) => /^\d+$/.test(a.application)));

  console.log("\nThe applicant on its day is the company");
  check("Prozac (1987-12-29) is Eli Lilly's", pagesOf(named("Prozac")).join() === "LLY");
  check("Lipitor (1996, Parke-Davis) and Celebrex (1998, Searle) are no page's: an acquisition's past is never the buyer's",
    pagesOf(named("Lipitor")).length === 0 && pagesOf(named("Celebrex")).length === 0);
  check("Humira (2002-12-31) is Abbott's, not AbbVie's", pagesOf(named("Humira")).join() === "ABT");
  check("Patanol (1996, Alcon) is not Novartis's, which owned Alcon from 2010; Xtoro (2014, Alcon Research) is; Tryptyr (2025) is Alcon's own",
    !on("NVS", named("Patanol")) && on("NVS", named("Xtoro")) && pagesOf(named("Tryptyr")).join() === "ALC");
  check("Fabrazyme (2003, Genzyme) is not Sanofi's, which bought Genzyme in 2011; Nexviazyme (2021) is",
    !on("SNY", named("Fabrazyme")) && on("SNY", named("Nexviazyme")) && FDA_FIRMS[rowOf("SNY")[0]].firms.find((f) => f.search === "Genzyme")?.from === "2011-04-08");
  check("Actinex (1992, Block Drug) is not Block, Inc.'s", pagesOf(named("Actinex")).length === 0 && !!NOT_THE_APPLICANT[rowOf("XYZ")[0]]);
  check("Seroquel (1997) is AstraZeneca's under Zeneca, its record's earlier name", pagesOf(named("Seroquel")).join() === "AZN");
  check("joint ventures are no owner's: DuPont Merck's Neurolite, Astra Merck's Atacand, Lilly ICOS's Cialis, TAP's Lupron",
    ["Neurolite", "Atacand", "Cialis", "Lupron"].every((n) => pagesOf(named(n)).length === 0));
  check("DuPont's pharmaceuticals of 1986–2001 are not DuPont de Nemours's, whose record is DowDuPont's of 2015", ["Brevibloc", "Sustiva"].every((n) => !on("DD", named(n))));

  console.log("\nUnits bought, from the day each deal closed");
  const units: [string, string, string, string][] = [
    ["BMY", "Zeposia", "Revlimid", "Celgene from 2019-11-20"],
    ["PFE", "Bosulif", "Torisel", "Wyeth from 2009-10-15"],
    ["NVS", "Lutathera", "Netspot", "Advanced Accelerator Applications from 2018-01-22: Lutathera, 2018-01-26"],
    ["LLY", "Retevmo", "Vitrakvi", "Loxo Oncology from 2019-02-15"],
    ["TAK", "Alunbrig", "Iclusig", "Ariad from 2017-02-16"],
    ["TAK", "Ninlaro", "Velcade", "Millennium from 2008-05-14"],
    ["JNJ", "Simponi", "Remicade", "Centocor from October 1999"],
    ["BMY", "Cardiotec", "Isovue", "Squibb after the merger of October 1989"],
  ];
  for (const [t, yes, no, why] of units) check(`  ${why}: ${yes} is ${t}'s, ${no} is not`, on(t, named(yes)) && !on(t, named(no)));
  const hgs = APPROVALS.filter((a) => /^Human Genome Sciences/.test(a.applicant));
  check("  Human Genome Sciences from 2012-08-02: raxibacumab (2012-12-14) is GSK's, Benlysta (2011) is not, and a drug with no proprietary name is titled by its ingredient",
    hgs.length === 2 && on("GSK", hgs.find((a) => a.day === "2012-12-14")!) && !on("GSK", named("Benlysta")) &&
      approvalEvents([hgs.find((a) => a.day === "2012-12-14")!], namesOf("GSK"), { cik: rowOf("GSK")[0] })[0]?.title === "FDA approves raxibacumab, a new biologic");
  check("  …Tibotec's Prezista (2006) is Johnson & Johnson's", on("JNJ", named("Prezista")));
  check("every hand-read name says why, and every day is a day",
    Object.values(APPLICANT_NAMES).every((c) => c.names.every((n) => n.why.length > 15 && [n.from, n.to].every((d) => d === undefined || /^\d{4}-\d{2}-\d{2}$/.test(d)))) &&
      Object.entries(APPLICANT_NAMES).every(([cik, c]) => companies.some(([x, t]) => x === Number(cik) && t === c.ticker)));

  console.log("\nEvery listed company against every approval");
  const out = new Map<string, ReturnType<typeof approvalEvents>>();
  for (const [ticker, c] of CANDIDATES) {
    const ev = approvalEvents(c.approvals, namesOf(ticker), { cik: c.cik });
    if (ev.length) out.set(ticker, ev);
  }
  const total = [...out.values()].reduce((n, v) => n + v.length, 0);
  const before2017 = [...out.values()].flat().filter((e) => e.date < "2017").length;
  check("before any first price: 556 approvals on 87 companies, 352 before 2017 (the first price then keeps off each company's years before it listed: Alcon's before 2019, Bausch + Lomb's before 2022, Organon's before 2021, Sandoz's before Novartis's listing)",
    total === 556 && out.size === 87 && before2017 === 352, `${total} on ${out.size}; ${before2017} before 2017`);
  const floored = Object.entries(FIRST_PRICES).map(([t, from]) => approvalEvents(APPROVALS, namesOf(t), { cik: rowOf(t)[0], from }));
  const onPages = floored.flat();
  check("from the 26 drugmakers' first prices: 435 approvals, 302 before 2017, 66 before EDGAR (1994)",
    onPages.length === 435 && onPages.filter((e) => e.date < "2017").length === 302 && onPages.filter((e) => e.date < "1994").length === 66,
    `${onPages.length}; ${onPages.filter((e) => e.date < "2017").length} before 2017; ${onPages.filter((e) => e.date < "1994").length} before 1994`);
  const top = Object.keys(FIRST_PRICES).map((t, i) => [t, floored[i].length] as const).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t, n]) => `${t} ${n}`).join(", ");
  check("  …most on Johnson & Johnson 47, Merck 45, Novartis 44, Pfizer 41, Bristol-Myers Squibb 39, Lilly 34", top === "JNJ 47, MRK 45, NVS 44, PFE 41, BMY 39, LLY 34", top);
  const nvsBefore = approvalEvents(APPROVALS, namesOf("NVS"), { cik: rowOf("NVS")[0] }).filter((e) => e.date < FIRST_PRICES.NVS);
  check("  …the first price keeps a company's years before its listing off: Novartis's Ciba-Geigy and Sandoz approvals before 1996-11-07", nvsBefore.length === 0 || nvsBefore.every((e) => e.date < "1996-11-07"));

  console.log("\nThe events a page gets");
  const lly = approvalEvents(APPROVALS, namesOf("LLY"), { cik: rowOf("LLY")[0], from: FIRST_PRICES.LLY });
  const prozac = lly.find((e) => e.externalId === "NDA18936");
  check("an approval is the FDA acting, on its day, titled by the drug, linked to Drugs@FDA, keyed by its application",
    prozac?.date === "1987-12-29" && prozac.type === "regulation" && prozac.title === "FDA approves Prozac (fluoxetine hydrochloride), a new molecular entity" &&
      prozac.url === drugsAtFdaUrl("18936") && prozac.url === "https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=overview.process&ApplNo=018936" &&
      prozac.dedupBasis === "fda-approval:59478@NDA18936" && prozac.sourceKey === "fda_approvals" && /treatment of depression\. Approved December 29, 1987 on Eli Lilly's NDA 18936 \(priority review\)\./.test(prozac.description ?? ""),
    prozac);
  check("  …every description fits 600 characters and every key is unique", onPages.every((e) => (e.description ?? "").length <= 600) && floored.every((v) => new Set(v.map((e) => e.dedupBasis)).size === v.length));

  console.log("\nThe company step");
  const step = await fdaApprovalsFor(fakeDb("1972-06-01"), 1, { edgarName: "ELI LILLY & Co", alsoKnownAs: newsNamesFor(59478), cik: 59478 });
  check("the company's approvals from its first price, with no request", step.outcome === "ok" && step.events.length === 34 && step.events.some((e) => e.externalId === "NDA18936"), `${step.outcome} ${step.events.length}`);
  const none = await fdaApprovalsFor(fakeDb(null), 1, { edgarName: "ELI LILLY & Co", alsoKnownAs: [], cik: 59478 });
  const fund = await fdaApprovalsFor(fakeDb("1972-06-01"), 1, { edgarName: "ELI LILLY & Co", alsoKnownAs: [], cik: 59478, fundSeries: true });
  check("  …asked again while it has no prices, and none for a fund's series", none.outcome === "error" && /no prices/.test(none.detail ?? "") && fund.events.length === 0 && fund.outcome === "empty");

  console.log("\nRegistered, licensed, wired");
  const src = SOURCES.find((s) => s.key === "fda_approvals");
  check("the source is id 35, public domain, cleared for commercial use, reviewed 2026-11-06",
    src?.id === 35 && src.license === "public domain" && src.commercialOk && src.reviewedOn === "2026-11-06" && src.attribution === "U.S. Food and Drug Administration", src);
  check("  …the build quotes the FDA's website policy", /are not copyrighted\. They are in the public domain and may be republished/.test(read("lib/fdaApprovals.ts").replace(/\s*\*\s*/g, " ")));
  check("  …a company source, quota and refresh noted, scored without the model",
    (COMPANY_SOURCES as readonly string[]).includes("fda_approvals") && QUOTAS.fda_approvals.perDay === null && SOURCE_TTL_MINUTES.fda_approvals === 1440 &&
      deterministicScore({ eventId: 0, kind: "regulation", title: "FDA approves Prozac", sourceKey: "fda_approvals" }, { kind: "company", displayName: "Eli Lilly", ticker: "LLY" }, ["lilly"])?.score === 0.95);
  check("  …the ingest asks it for every company", /await run\("fda_approvals", [^\n]+\n\s*fdaApprovalsFor\(client, subjectId, \{[^}]*cik: company\.cik, fundSeries \}\),/.test(read("scripts/ingest.ts")));
  check("  …synced by `npm run sync:fda-approvals` from the FDA's workbook, and credited",
    /"sync:fda-approvals": "tsx scripts\/sync-fda-approvals\.ts"/.test(read("package.json")) && NME_FILE === "https://www.fda.gov/media/177921/download?attachment" &&
      /new-drug approvals from the U\.S\. Food and Drug Administration/.test(read("app/layout.tsx").replace(/\s+/g, " ")) &&
      /new-drug approvals from the U\.S\. Food and Drug Administration/.test(read("app/legal/terms/page.tsx").replace(/\s+/g, " ")));

  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  process.exit(fail ? 1 : 0);
}

/** The queries the company step makes: its first price, and its stored former names (none here). */
function fakeDb(listed: string | null): PoolClient {
  return {
    query: async (sql: string) => {
      if (/FROM prices/.test(sql)) return { rows: [{ listed }] };
      if (/sec:%:rename:%/.test(sql)) return { rows: [] };
      throw new Error(`unexpected query: ${sql.slice(0, 80)}`);
    },
  } as unknown as PoolClient;
}

/** A zip of the given files, stored or deflated, as the reader expects one. */
function makeZip(files: [name: string, text: string, deflate: boolean][]): Uint8Array {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, text, deflate] of files) {
    const raw = Buffer.from(text);
    const data = deflate ? deflateRawSync(raw) : raw;
    const n = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(n.length, 26);
    locals.push(local, n, data);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(deflate ? 8 : 0, 10);
    dir.writeUInt32LE(data.length, 20);
    dir.writeUInt32LE(raw.length, 24);
    dir.writeUInt16LE(n.length, 28);
    dir.writeUInt32LE(offset, 42);
    central.push(dir, n);
    offset += 30 + n.length + data.length;
  }
  const dirBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dirBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, dirBytes, end]));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
