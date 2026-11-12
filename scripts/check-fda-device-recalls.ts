import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import type { PoolClient } from "pg";
import { deterministicScore } from "../lib/enrich/relevance";
import {
  FILE_BEGINS,
  REPORTS_BEGIN,
  classPageUrl,
  deviceRecallEvents,
  deviceRecallQuery,
  eventPage,
  fetchEventClass,
  parseClassPage,
  reportedQuery,
  type DeviceRecord,
} from "../lib/fdaDeviceRecalls";
import { FDA_FIRMS, firmFor } from "../lib/fdaRecalls";
import { CLASS_READS_PER_RUN, MAX_FAILED_PAGES, deviceRecallsFor, resetReported } from "../lib/ingest/fdaDeviceRecallsFor";
import { QUOTAS } from "../lib/ingest/quota";
import { SOURCE_TTL_MINUTES } from "../lib/ingest/refresh";
import { SOURCES } from "../lib/ingest/store";
import type { TimelineEvent } from "../lib/types";
import { COMPANY_SOURCES } from "./ingest";

/**
 * The FDA's device recalls of 2000 to mid-2012, before the enforcement reports (batch 144, the
 * 2026-11-11b proposal 1, approved by the owner on 2026-11-12).
 *
 *   npm run check:fda-device-recalls
 *
 * The records are real: openFDA's device recall file of 2026-11-10, every product record a mapped
 * firm's search phrase finds begun 2000-01-01 to 2012-06-19, with the reports' own events of those
 * years from the device enforcement file, committed as scripts/fixtures/fda-device-recalls.json.gz.
 * So are the classes: each event's page in the FDA's recall database, read on 2026-11-12 for every
 * event the map's firms began then, and three of those pages whole for the reader. Offline.
 */

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: unknown): void {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n      ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 600)}`}`);
}
const root = join(__dirname, "..");
const read = (file: string) => readFileSync(join(root, file), "utf8");

const FX = JSON.parse(gunzipSync(readFileSync(join(root, "scripts/fixtures/fda-device-recalls.json.gz"))).toString("utf8")) as {
  records: [string, string, string, string, string, string][];
  reported: string[];
  classes: Record<string, [1 | 2 | 3 | null, number]>;
  pages: Record<string, string>;
  first: Record<string, string>;
};
const records: DeviceRecord[] = FX.records.map(([res_event_number, recalling_firm, event_date_initiated, product_description, reason_for_recall, cfres_id]) => ({
  res_event_number,
  cfres_id,
  recalling_firm,
  event_date_initiated,
  product_description,
  reason_for_recall,
}));
const reported = new Set(FX.reported);
const classes = new Map<string, 1 | 2 | 3 | null>(Object.entries(FX.classes).map(([e, [c]]) => [e, c]));
const entryOf = (ticker: string) => Object.entries(FDA_FIRMS).find(([, m]) => m.ticker === ticker)!;
const firmsOf = (ticker: string) => entryOf(ticker)[1].firms;
const rowsOf = (ticker: string, from: string | undefined = FX.first[ticker]) => deviceRecallEvents(records, firmsOf(ticker), { classes, reported, from });
const has = (rows: { events: TimelineEvent[] }, id: string) => rows.events.find((e) => e.externalId === id);

async function main(): Promise<void> {
  console.log("The recall database's page: its products and their class");
  const asr = parseClassPage(FX.pages["57177"]);
  check("DePuy's ASR recall of 2010 (event 57177): 68 products on one page, \"1 to 68 of 68 Results\", each Class II", asr?.total === 68 && asr.products === 68 && asr.cls === 2, asr);
  const alaris = parseClassPage(FX.pages["36064"]);
  check("  …the Alaris SE pump (event 36064), a single product: \"1 result found\", Class I", alaris?.total === 1 && alaris.products === 1 && alaris.cls === 1, alaris);
  const fidelis = parseClassPage(FX.pages["45403"]);
  check("  …Medtronic's Sprint Fidelis leads (event 45403): four products, Class I", fidelis?.total === 4 && fidelis.products === 4 && fidelis.cls === 1, fidelis);
  const mixed = parseClassPage('<p>1 to 2 of 2 Results</p><table><tr><td><a href="./res.cfm?id=1">Pump</a> </td><td align="center"> 3 </td></tr><tr><td><a href="./res.cfm?id=2">Lead</a></td>\n<td>\n 2\n</td></tr></table>');
  check("  …an event of products of two classes takes the more serious", mixed?.cls === 2 && mixed.products === 2, mixed);
  check("  …a page that gives no count of its products is not read as an answer", parseClassPage("<html><body>Service unavailable</body></html>") === null);
  const none = parseClassPage("<p>0 results found</p>");
  check("  …and one that lists none has no class", none?.total === 0 && none.cls === null, none);

  console.log("\nThe requests");
  const q = decodeURIComponent(deviceRecallQuery(firmsOf("MDT")).replace(/\+/g, " "));
  check("a company's firms are asked in brackets, with the recalls begun before the reports' first day, oldest first, 1,000 a page",
    q.startsWith("https://api.fda.gov/device/recall.json?") && q.includes('search=(recalling_firm:"Medtronic" recalling_firm:"Physio-Control" recalling_firm:"Covidien") AND event_date_initiated:[2000-01-01 TO 2012-06-19]') &&
      q.includes("sort=event_date_initiated:asc") && q.includes("limit=1000"), q);
  const r = decodeURIComponent(reportedQuery().replace(/\+/g, " "));
  check("  …and the reports' device records begun before their first day, for the events they hold", r.includes("/device/enforcement.json?search=recall_initiation_date:[20000101 TO 20120619]"), r);
  check("  …the class from the event's page in the recall database, 500 products a page; the row links to the page itself",
    classPageUrl("45403") === "https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfRES/res.cfm?start_search=1&event_id=45403&PAGENUM=500" &&
      classPageUrl("1", 501).includes("start_search=501") && eventPage("45403") === "https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfRES/res.cfm?start_search=1&event_id=45403");
  check("  …the reports begin on 2012-06-20, the file's real days on 2000-01-01", REPORTS_BEGIN === "2012-06-20" && FILE_BEGINS === "2000-01-01");

  console.log("\nThe rows: the map's rule on the recall's day");
  const mdt = rowsOf("MDT");
  const f = has(mdt, "45403");
  check("Medtronic's Sprint Fidelis recall of 2007-10-15 is Medtronic's, Class I, its four products one row named by the first the FDA entered (model 6930), with the FDA's reason and the recall database's page",
    f?.date === "2007-10-15" && f.title === "Class I device recall: Medtronic Sprint Fidelis 6930 Steroid eluting (4 products)" && /voluntarily suspended worldwide distribution/.test(f.description ?? "") &&
      f.url === eventPage("45403") && f.sourceKey === "fda_device_recalls" && f.dedupBasis === "fda:45403" && f.id === "fda-45403", f);
  const depuy = has(rowsOf("JNJ"), "57177");
  check("  …DePuy's ASR hip recall of 2010-08-23 is Johnson & Johnson's, 68 products, Class II", depuy?.date === "2010-08-23" && /^Class II device recall: .*\(68 products\)$/.test(depuy.title), depuy);
  const cah = rowsOf("CAH");
  check("  …the Alaris SE pump of 2006 is Cardinal Health's, its infusion pumps from 2004-07-07 to the CareFusion spin-off", has(cah, "36064")?.title.startsWith("Class I device recall: ") === true);
  check("  …Physio-Control's defibrillators of 2008–2011 are Medtronic's, which held it from 1998 to its sale, and none is Stryker's, which bought it in 2016",
    mdt.events.filter((e) => /Physio/i.test(records.find((x) => x.res_event_number === e.externalId)?.recalling_firm ?? "")).length > 0 &&
      !rowsOf("SYK").events.some((e) => /Physio/i.test(records.find((x) => x.res_event_number === e.externalId)?.recalling_firm ?? "")));

  console.log("\nAn acquisition's past is never the buyer's: the map's days for 2000–2012 (batch 144)");
  const bsx = rowsOf("BSX");
  check("Guidant's VENTAK PRIZM recalls of 2005-06-17 and 2005-07-25, filed under \"Boston Scientific CRM Corp\", are on no page; its CRM recall of 2006-05-15 is Boston Scientific's",
    !has(bsx, "32391") && !has(bsx, "32738") && !!has(bsx, "35525") && firmFor("Boston Scientific CRM Corp", "2006-04-20", firmsOf("BSX")) === null && firmFor("Boston Scientific Corporation", "2005-01-01", firmsOf("BSX")) !== null);
  const jnj = rowsOf("JNJ");
  check("  …Mentor's recalls of 2003–2008 are not Johnson & Johnson's (Mentor Texas, from 2009-01-26), nor Acclarent's of 2006 (from 2010-01-20)",
    !has(jnj, "29132") && !has(jnj, "38623") && !has(jnj, "34524") && firmFor("Acclarent, Inc.", "2012-01-30", firmsOf("JNJ")) !== null);
  const ge = rowsOf("GE");
  check("  …Datex-Ohmeda's recalls before GE's results release of 2003-10-10 named Instrumentarium bought are not GE's; its Giraffe OmniBed recall of 2003-10-17 is (its monitor recall that day is Class III)",
    !has(ge, "25501") && !has(ge, "26765") && !!has(ge, "27490") && !has(ge, "27599") && classes.get("27599") === 3);
  const dhr = rowsOf("DHR");
  check("  …Sybron's dental companies are Danaher's from 2006-05-16: Sybron's recall of 2003 and Ormco's of 2004 are not; Kerr's of 2008 (\"Kerr Corp\", 42 products) is",
    !has(dhr, "25811") && !has(dhr, "30515") && !has(dhr, "34769") && /\(42 products\)$/.test(has(dhr, "49506")?.title ?? ""));
  check("  …Leica Microsystems is Danaher's from its 10-Q of 2005-07-21: Leica's recall of 2005-04-12 is not, its recall of 2008 is", !has(dhr, "35385") && !!has(dhr, "50163"));
  check("  …Viasys's units are Cardinal's from 2007-06-21: Pulmonetic's recall of 2004, filed as \"Cardinal Health 203\", is not; its ventilators of 2008 are",
    !has(cah, "29978") && !!has(cah, "46850") && firmFor("Cardinal Health 303 dba Cardinal Health", "2009-09-01", firmsOf("CAH")) === null);
  check("  …Chattem's recall of 2008 is not Sanofi's, whose Chattem dates from 2010-02-09", !has(rowsOf("SNY"), "46784") && firmFor("Chattem Inc", "2010-02-09", firmsOf("SNY")) !== null);
  check("  …and Ascent's reprocessed wand of 2009-06-01, filed as \"Stryker Sustainability Solutions\", is not Stryker's", !has(rowsOf("SYK"), "61296") && firmFor("Stryker Sustainability Solutions, Inc.", "2015-01-01", firmsOf("SYK")) !== null);

  console.log("\nWhat gives no row");
  const held = FX.reported.filter((id) => records.some((x) => x.res_event_number === id));
  const heldSet = new Set(held);
  const anyHeld = Object.values(FDA_FIRMS).some((m) => deviceRecallEvents(records, m.firms, { classes, reported, from: undefined }).events.some((e) => heldSet.has(e.externalId ?? "")));
  check(`a recall the reports hold is theirs: none of the ${held.length} held events the file also has is given here`, held.length > 100 && !anyHeld, held.length);
  const noClass = deviceRecallEvents(records, firmsOf("MDT"), { classes: new Map(), reported, from: undefined });
  check("  …a recall whose class is not read yet waits, and is no row", noClass.events.length === 0 && noClass.awaiting.includes("45403"), noClass.awaiting.length);
  const third = deviceRecallEvents(records, firmsOf("MDT"), { classes: new Map([...classes, ["45403", 3]]), reported, from: undefined });
  const empty = deviceRecallEvents(records, firmsOf("MDT"), { classes: new Map([...classes, ["45403", null]]), reported, from: undefined });
  check("  …a recall of Class III gives none, nor one whose page listed no product", !has(third, "45403") && !has(empty, "45403") && !third.awaiting.includes("45403"));
  const pen = deviceRecallEvents(records, firmsOf("PEN"), { classes, reported, from: "2015-09-18" });
  const penAll = deviceRecallEvents(records, firmsOf("PEN"), { classes, reported, from: undefined });
  check("  …a recall begun before the company's first price is on no page, nor read: Penumbra's of 2009–2011 before its listing of 2015",
    pen.events.length === 0 && pen.awaiting.length === 0 && penAll.events.length + penAll.awaiting.length > 0, penAll.events.length);
  const odd = deviceRecallEvents([{ res_event_number: "66526", recalling_firm: "Intuitive Surgical, Inc.", event_date_initiated: "0012-11-30" }, { res_event_number: "9", recalling_firm: "Medtronic Inc", event_date_initiated: "2012-06-20" }], [...firmsOf("ISRG"), ...firmsOf("MDT")], { classes: new Map([["66526", 1], ["9", 1]]), reported: new Set(), from: undefined });
  check("  …and a mistyped year, or a recall begun from the reports' first day, is outside the file's range", odd.events.length === 0 && odd.awaiting.length === 0);

  console.log("\nThe classes read, 2026-11-12");
  const classed = Object.values(FX.classes);
  const byClass = [1, 2, 3, null].map((c) => classed.filter(([x]) => x === c).length);
  console.log(`  ${classed.length} events: Class I ${byClass[0]}, II ${byClass[1]}, III ${byClass[2]}, none listed ${byClass[3]}`);
  check("every event the map's firms began before the reports has its class read", classed.length === CLASSES_READ, classed.length);
  check("  …Class I, II and III, and pages that listed none, as read", JSON.stringify(byClass) === JSON.stringify(CLASS_MIX), byClass);

  console.log("\nThe population, from first prices where read");
  const pages: Record<string, number> = {};
  const unread: Record<string, number> = {};
  let rows = 0;
  let before2017 = 0;
  let classI = 0;
  for (const [, m] of Object.entries(FDA_FIRMS)) {
    const first = FX.first[m.ticker];
    const got = deviceRecallEvents(records, m.firms, { classes, reported, from: first });
    if (got.awaiting.length) throw new Error(`${m.ticker} awaits ${got.awaiting.length} classes`);
    if (!got.events.length) continue;
    if (!first) unread[m.ticker] = got.events.length;
    else {
      pages[m.ticker] = got.events.length;
      rows += got.events.length;
      before2017 += got.events.filter((e) => e.date < "2017").length;
      classI += got.events.filter((e) => e.title.startsWith("Class I ")).length;
    }
  }
  const top = Object.entries(pages).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  console.log(`  ${rows} rows on ${top.length} pages (${classI} Class I), ${before2017} before 2017: ${top.map(([t, n]) => `${t} ${n}`).join(", ")}`);
  console.log(`  first price not read: ${Object.values(unread).reduce((s, n) => s + n, 0)} on ${Object.keys(unread).length}: ${JSON.stringify(unread)}`);
  check(`${POPULATION.rows} rows on ${POPULATION.pages} pages from first prices, all before 2017, ${POPULATION.classI} of them Class I`,
    rows === POPULATION.rows && top.length === POPULATION.pages && before2017 === rows && classI === POPULATION.classI, { rows, pages: top.length, before2017, classI });
  check(`  …the most on ${POPULATION.top}`, top.slice(0, 6).map(([t, n]) => `${t} ${n}`).join(", ") === POPULATION.top, top.slice(0, 6));
  check(`  …and ${POPULATION.unread} more on ${POPULATION.unreadPages} companies whose first price is not read`,
    Object.values(unread).reduce((s, n) => s + n, 0) === POPULATION.unread && Object.keys(unread).length === POPULATION.unreadPages, unread);

  console.log("\nIngest: the classes read once and kept, a few hundred a run");
  const ok = <T>(value: T) => ({ ok: true as const, value, httpStatus: 200 });
  const mdtRecords = records.filter((x) => firmFor(x.recalling_firm ?? "", x.event_date_initiated ?? "", firmsOf("MDT")));
  const db: FakeDb = { listed: "1980-03-17", classes: new Map() };
  const asked: string[] = [];
  const fetchClass: typeof fetchEventClass = async (event) => {
    asked.push(event);
    const c = classes.get(event);
    return c === undefined ? { ok: false, outcome: "error", detail: "not in the fixture", requests: 1 } : { ok: true, cls: c, products: 1, requests: 1 };
  };
  const deps = (left: number) => ({ budget: { left }, fetchRecords: async () => ok(mdtRecords), fetchReported: async () => ok(reported), fetchClass, sleep: async () => undefined });
  const awaitingAll = deviceRecallEvents(mdtRecords, firmsOf("MDT"), { classes: new Map(), reported, from: db.listed ?? undefined }).awaiting.length;
  const first = await deviceRecallsFor(fakeDb(db), 1, entryOf("MDT")[0], deps(50));
  check(`a run reads the classes still owed while its budget lasts, oldest first, keeps them, and says how many wait: Medtronic's ${awaitingAll}, 50 a run`,
    asked.length === 50 && db.classes.size === 50 && new RegExp(`^50 recall classes read; ${awaitingAll - 50} recalls await their class \\(this run's class reads are spent\\)$`).test(first.detail ?? ""), first.detail);
  asked.length = 0;
  const second = await deviceRecallsFor(fakeDb(db), 1, entryOf("MDT")[0], deps(10_000));
  check("  …the next reads only the rest, never a kept one again, and gives every row", asked.length === awaitingAll - 50 && db.classes.size === awaitingAll && second.events.length === rowsOf("MDT", db.listed ?? undefined).events.length && !/await/.test(second.detail ?? ""), { asked: asked.length, rows: second.events.length });
  asked.length = 0;
  const third2 = await deviceRecallsFor(fakeDb(db), 1, entryOf("MDT")[0], deps(10_000));
  check("  …and then asks the recall database nothing", asked.length === 0 && third2.detail === undefined && third2.outcome === "ok");
  const busy = await deviceRecallsFor(fakeDb({ listed: "1980-03-17", classes: new Map() }), 1, entryOf("MDT")[0], {
    ...deps(10),
    fetchClass: async () => ({ ok: false, outcome: "throttled", httpStatus: 429, detail: "busy", requests: 1 }),
  });
  check("  …a refused page stops the reads, the answer says so, and the recalls already classed are still given", /the recall database refused event \d+: throttled 429/.test(busy.detail ?? "") && busy.outcome === "empty", busy.detail);
  const asked2: string[] = [];
  const stuck = await deviceRecallsFor(fakeDb({ listed: "1980-03-17", classes: new Map() }), 1, entryOf("MDT")[0], {
    ...deps(10),
    fetchClass: async (event) => {
      asked2.push(event);
      return asked2.length === 1 ? { ok: false, outcome: "error", httpStatus: 400, detail: "bad request", requests: 1 } : { ok: true, cls: 2, products: 1, requests: 1 };
    },
  });
  check("  …a page that fails (a passing 400) is skipped, never holding up the recalls after it, and asked again on the next run",
    asked2.length === 10 && /^9 recall classes read; \d+ recalls await their class/.test(stuck.detail ?? ""), stuck.detail);
  let fails = 0;
  await deviceRecallsFor(fakeDb({ listed: "1980-03-17", classes: new Map() }), 1, entryOf("MDT")[0], {
    ...deps(50),
    fetchClass: async () => (fails++, { ok: false, outcome: "error", httpStatus: 500, detail: "down", requests: 1 }),
  });
  check(`  …and a run stops after ${MAX_FAILED_PAGES} failed pages`, fails === MAX_FAILED_PAGES, fails);
  const spent = { left: 3 };
  await deviceRecallsFor(fakeDb({ listed: "1980-03-17", classes: new Map() }), 1, entryOf("MDT")[0], { ...deps(0), budget: spent, fetchClass: async () => ({ ok: false, outcome: "throttled", httpStatus: 429, detail: "busy", requests: 1 }) });
  check("  …and every company's reads in the process: a throttle spends the budget", spent.left === 0);
  check(`  …a process reads at most ${CLASS_READS_PER_RUN} pages`, CLASS_READS_PER_RUN === 200);
  const unmapped = await deviceRecallsFor(fakeDb(db), 1, 320193, deps(10));
  check("  …a company with no mapped firm costs no request", unmapped.outcome === "empty" && /no FDA-regulated firm/.test(unmapped.detail ?? ""));
  const noPrices = await deviceRecallsFor(fakeDb({ listed: null, classes: new Map() }), 1, entryOf("MDT")[0], deps(10));
  check("  …one with no prices yet is asked again on the next run", noPrices.outcome === "error" && /no prices/.test(noPrices.detail ?? ""));
  const refused = await deviceRecallsFor(fakeDb(db), 1, entryOf("MDT")[0], { ...deps(10), fetchRecords: async () => ({ ok: false as const, failure: { events: [], outcome: "throttled" as const, httpStatus: 429 } }) });
  check("  …and a refused records read is the run's failure, never \"no recalls\"", refused.outcome === "throttled");

  // the real readers, through a faked fetch: the reports' events read once a process, the class pages in order
  const realFetch = globalThis.fetch;
  const hits: string[] = [];
  globalThis.fetch = (async (u: RequestInfo | URL) => {
    const url = String(u);
    hits.push(url);
    if (url.includes("/device/enforcement.json")) return new Response(JSON.stringify({ meta: { results: { total: 1 } }, results: [{ event_id: "57878" }] }));
    if (url.includes("/device/recall.json")) return new Response(JSON.stringify({ meta: { results: { total: 1 } }, results: [{ res_event_number: "45403", recalling_firm: "Medtronic Inc", event_date_initiated: "2007-10-15", product_description: "Lead" }] }));
    if (url.includes("res.cfm")) return new Response(FX.pages["45403"]);
    return new Response("", { status: 500 });
  }) as typeof fetch;
  try {
    resetReported();
    const dbA: FakeDb = { listed: "1980-03-17", classes: new Map() };
    const a = await deviceRecallsFor(fakeDb(dbA), 1, entryOf("MDT")[0], { budget: { left: 5 }, sleep: async () => undefined });
    await deviceRecallsFor(fakeDb(dbA), 2, entryOf("SYK")[0], { budget: { left: 5 }, sleep: async () => undefined });
    check("the reports' older events are asked once a process, for every company", hits.filter((h) => h.includes("/device/enforcement.json")).length === 1, hits.length);
    check("  …and a class page read through the real reader is kept and gives the row", a.events.length === 1 && dbA.classes.get(45403)?.[0] === 1 && hits.some((h) => h.includes("event_id=45403&PAGENUM=500")), a);
    const twoPages = await fetchEventClass("57177", { sleep: async () => undefined });
    check("  …an event's page is read once when it lists every product", twoPages.ok && twoPages.requests === 1);
  } finally {
    globalThis.fetch = realFetch;
    resetReported();
  }

  console.log("\nRegistered, licensed, wired");
  const src = SOURCES.find((s) => s.key === "fda_device_recalls");
  check("the source is registered as id 40, public domain under CC0, cleared for commercial use, with the day its licence was read",
    src?.id === 40 && src.license === "public domain (CC0 1.0)" && src.commercialOk === true && src.reviewedOn === "2026-11-12", src);
  check("  …asked for every mapped company, after the reports, once a day, within openFDA's keyless 1,000 a day",
    COMPANY_SOURCES.indexOf("fda_device_recalls") === COMPANY_SOURCES.indexOf("fda_enforcement") + 1 && SOURCE_TTL_MINUTES.fda_device_recalls === 1440 && QUOTAS.fda_device_recalls?.perDay === 1000);
  const ingest = read("scripts/ingest.ts");
  check("  …ingest runs it beside the reports, only for a mapped company", /if \(fdaFirms\) \{[\s\S]*?run\("fda_enforcement"[\s\S]*?run\("fda_device_recalls"[\s\S]*?deviceRecallsFor\(client, subjectId, company\.cik\)/.test(ingest));
  check("  …its classes are kept in db/051", /CREATE TABLE IF NOT EXISTS fda_device_classes/.test(read("db/051_fda_device_classes.sql")));
  const score = deterministicScore({ sourceKey: "fda_device_recalls", kind: "recall", title: f?.title ?? "" } as never, { kind: "company" } as never, []);
  check("  …a recall is scored without the model, as the reports' are", score?.score === 1, score);
  check("  …and the live check covers it", /covers: \["fda_device_recalls"\]/.test(read("scripts/check-live.ts")));

  console.log(`\n${pass}/${pass + fail} checks passed`);
  if (fail) process.exit(1);
}

// pinned from the fixture's real records and classes (2026-11-12)
// 2,608 events: the 2,604 read for the map's firms and the four "Kerr Corp" adds; 283 are Class III,
// against the scout's estimate of about 60 from the reports' mix since 2012
const CLASSES_READ = 2608;
const CLASS_MIX = [93, 2232, 283, 0];
const POPULATION = { rows: 1981, pages: 19, classI: 73, top: "SYK 262, GE 243, PHG 234, ABT 216, MDT 202, JNJ 175", unread: 345, unreadPages: 18 };

interface FakeDb {
  listed: string | null;
  classes: Map<number, [number | null, number]>;
}
function fakeDb(db: FakeDb): PoolClient {
  return {
    query: async (sql: string, params: unknown[] = []) => {
      const s = sql.trim();
      if (/FROM prices/.test(s)) return { rows: [{ listed: db.listed }] };
      if (/^SELECT event_number, class FROM fda_device_classes/.test(s)) {
        const want = new Set(params[0] as number[]);
        return { rows: [...db.classes].filter(([e]) => want.has(e)).map(([event_number, [cls]]) => ({ event_number, class: cls })) };
      }
      if (/^INSERT INTO fda_device_classes/.test(s)) {
        db.classes.set(params[0] as number, [params[1] as number | null, params[2] as number]);
        return { rows: [] };
      }
      throw new Error(`unexpected query: ${s.slice(0, 80)}`);
    },
  } as unknown as PoolClient;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
