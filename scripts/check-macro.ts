/**
 * Fed policy decisions and CPI releases on the timeline (NC-080).
 *
 *   npm run check:macro
 *
 * The failure that matters is a wrong date presented as a fact, and the likeliest way to get one
 * is reading the wrong link: the Fed's pages carry strategy statements, swap-line notices and
 * repo-facility releases beside its decisions, and a parser that took "any statement-shaped
 * address" counted the August 2025 strategy statement as a ninth 2025 meeting. So the parsers run
 * on pages captured from the live sites (`npm run macro-report -- --pin`), and the dates are
 * checked against decisions that must be there and releases that must not.
 *
 * Offline: the fixture and a stubbed fetch, nothing else.
 */
import { readFileSync } from "node:fs";
import { parseCpiReleases, parseFomcHistoricalYears, parseFomcStatements } from "../lib/macroParse";
import { MACRO_SUBJECT, fetchCpiReleases, fetchFomcStatements } from "../lib/macro";
import { focusTerms, matchesFocus } from "../lib/focus";
import { SOURCES } from "../lib/ingest/store";
import { MARKER_STYLE } from "../lib/markers";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}
const read = (p: string) => readFileSync(p, "utf8");

const fixture = JSON.parse(read("scripts/fixtures/macro-pages.json"));
const pages: Record<string, string> = fixture.pages;
const dates = (xs: { date: string }[]) => xs.map((x) => x.date);

async function main(): Promise<void> {
  console.log("\nThe fixture is the real pages");
  check("captured from the live sites, not written by hand", fixture.provisional === false && /www\.federalreserve\.gov/.test(fixture.provenance) && /www\.bls\.gov/.test(fixture.provenance), fixture.provenance);

  console.log("\nFOMC decisions are the links labelled as statements");
  const calendar = parseFomcStatements(pages.fomcCalendar);
  check("the current calendar's decisions, eight a year", calendar.length === 46 && dates(calendar).filter((d) => d.startsWith("2025")).length === 8,
    `${calendar.length}, 2025: ${dates(calendar).filter((d) => d.startsWith("2025")).length}`);
  check("  …and not the 22 August 2025 strategy statement, which sits on the same page as a link of its own",
    !dates(calendar).includes("2025-08-22") && /2025-08-22|monetary20250822a/.test(pages.fomcCalendar));
  check("  …nor January 2026's, which shares its meeting's row (\"…b.htm\")",
    calendar.filter((d) => d.date === "2026-01-28").length === 1 && calendar.find((d) => d.date === "2026-01-28")!.url.endsWith("monetary20260128a.htm"));
  check("  …and each is the HTML statement, not its PDF or implementation note",
    calendar.every((d) => /\/newsevents\/pressreleases\/monetary\d{8}a\.htm$/.test(d.url)), calendar.find((d) => !/a\.htm$/.test(d.url))?.url);

  const era = (y: number) => parseFomcStatements(pages[`fomcHistorical${y}`]);
  check("1994: the first statements, under /fomc/…default.htm", era(1994).length === 6 && dates(era(1994))[0] === "1994-02-04", dates(era(1994)).join(", "));
  check("2001: /boarddocs/press/general/ addresses, the 17 September emergency cut included",
    era(2001).length === 11 && dates(era(2001)).includes("2001-09-17"));
  check("2008: the emergency cut of 22 January and December's, both \"…b.htm\" — the suffix is not the rule",
    era(2008).length === 11 && ["2008-01-22", "2008-12-16"].every((d) => dates(era(2008)).includes(d)));
  const y2020 = dates(era(2020));
  check("2020: the Sunday 15 March cut is a decision", y2020.length === 10 && y2020.includes("2020-03-15"), y2020.join(", "));
  check("  …the 19 and 31 March swap-line and repo releases are not", !y2020.includes("2020-03-19") && !y2020.includes("2020-03-31"));
  check("  …nor the 27 August strategy statement", !y2020.includes("2020-08-27"));
  const years = parseFomcHistoricalYears(pages.fomcHistoryIndex);
  check("the history index names every year page back to 1936", years.includes(1936) && years.includes(1994) && years.includes(2020), `${years.at(-1)}–${years[0]}`);

  console.log("\nThe rule, on the cases a page could throw at it");
  check("a statement dated before February 1994 is not taken — there were none",
    parseFomcStatements('<a href="/boarddocs/press/general/1993/19930203/">Statement</a>').length === 0);
  check("an address that is not a real day is not a date",
    parseFomcStatements('<a href="/newsevents/pressreleases/monetary20240231a.htm">Statement</a>').length === 0);
  check("a statement-shaped address under another label is not a decision",
    parseFomcStatements('<a href="/newsevents/pressreleases/monetary20240131a.htm">Statement on Longer-Run Goals</a>').length === 0);

  console.log("\nCPI releases: dated by address, named by their link");
  const cpi = parseCpiReleases(pages.cpiArchive);
  check("every release in the archive, February 2008 onward", cpi.length === 224 && cpi[0].date === "2008-02-20", `${cpi.length}, from ${cpi[0]?.date}`);
  const jan2024 = cpi.find((c) => c.date === "2024-02-13");
  check("13 February 2024 is the January 2024 CPI", jan2024?.referenceMonth === "January 2024", jan2024?.referenceMonth);
  const late = cpi.find((c) => c.date === "2025-10-24");
  check("a release that slipped keeps its own month: the September 2025 CPI, out on 24 October", late?.referenceMonth === "September 2025", late?.referenceMonth);
  check("  …and the October 2025 release that never came is not invented", !cpi.some((c) => c.referenceMonth === "October 2025"));
  check("the PDFs and the current-edition link are not extra releases", new Set(dates(cpi)).size === cpi.length && !cpi.some((c) => /\.pdf$|nr0/.test(c.url)));

  console.log("\nFetching, with a stubbed network");
  const realFetch = globalThis.fetch;
  const seen: { url: string; ua: string }[] = [];
  const serve = (status: Record<string, number> = {}) =>
    (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      seen.push({ url, ua: String((init?.headers as Record<string, string>)?.["User-Agent"] ?? "") });
      for (const [k, v] of Object.entries(status)) if (url.includes(k)) return new Response("", { status: v });
      const body = url.endsWith("fomccalendars.htm") ? pages.fomcCalendar
        : url.endsWith("fomc_historical_year.htm") ? pages.fomcHistoryIndex
        : url.includes("bls.gov") ? pages.cpiArchive
        : pages[`fomcHistorical${url.match(/fomchistorical(\d{4})/)?.[1]}`] ?? "<html></html>";
      return new Response(body, { status: 200 });
    }) as typeof fetch;
  try {
    globalThis.fetch = serve();
    const light = await fetchFomcStatements();
    check("a scheduled run reads the calendar alone", light.outcome === "ok" && light.events.length === 46 && seen.length === 1, `${light.events.length} from ${seen.length} request(s)`);
    check("  …and says who is asking — bls.gov refuses scripts that do not", seen.every((s) => /@/.test(s.ua)));
    seen.length = 0;
    const full = await fetchFomcStatements({ history: true, gapMs: 0 });
    check("a backfill reads every year page from 1994 to the calendar's first year, and no other",
      seen.filter((s) => /fomchistorical\d{4}/.test(s.url)).length === 27 && !seen.some((s) => /fomchistorical(19[3-8]\d|199[0-3]|202[1-9])/.test(s.url)),
      `${seen.filter((s) => /fomchistorical/.test(s.url)).length} year pages`);
    check("  …and adds what they hold, once per date", full.outcome === "ok" && full.events.length === 46 + 6 + 11 + 11 + 10, `${full.events.length}`);

    globalThis.fetch = serve({ "fomchistorical2008": 500 });
    const broken = await fetchFomcStatements({ history: true, gapMs: 0 });
    check("a year page that fails keeps what was read and says the history is incomplete",
      broken.outcome === "error" && broken.events.length >= 46 && /history incomplete/.test(broken.detail ?? ""), `${broken.outcome} ${broken.events.length} ${broken.detail}`);
    globalThis.fetch = serve({ "fomccalendars": 429 });
    check("a throttled calendar is throttled, not empty", (await fetchFomcStatements()).outcome === "throttled");
    globalThis.fetch = (async () => new Response("<html>redesigned</html>", { status: 200 })) as typeof fetch;
    const reshaped = await fetchFomcStatements();
    check("a calendar with no statements on it is a page that changed, reported as an error",
      reshaped.outcome === "error" && /no FOMC statements/.test(reshaped.detail ?? ""));
    check("  …and so is a CPI archive with no releases", (await fetchCpiReleases()).outcome === "error");
    globalThis.fetch = serve();
    const releases = await fetchCpiReleases();
    check("the CPI archive becomes one event per release", releases.outcome === "ok" && releases.events.length === 224);

    console.log("\nWhat lands on the timeline");
    const fomc = full.events.find((e) => e.date === "2020-03-15")!;
    const cpiEv = releases.events.find((e) => e.date === "2024-02-13")!;
    check("an FOMC row: the economy kind, its own source, keyed by date",
      fomc.type === "macro" && fomc.sourceKey === "fed_fomc" && fomc.dedupBasis === "fomc:2020-03-15" && /federalreserve\.gov/.test(fomc.url ?? ""));
    check("  …titled without claiming a cut or a hike — the address gives the date, not the decision",
      !/cut|hike|raise|lower/i.test(fomc.title), fomc.title);
    check("a CPI row names its month", cpiEv.type === "macro" && cpiEv.sourceKey === "bls_cpi" && cpiEv.title === "CPI report: consumer prices for January 2024", cpiEv.title);
    check("a search about interest rates finds the Fed rows (lib/concepts.ts)", matchesFocus(fomc, focusTerms("interest rates")) && matchesFocus(fomc, focusTerms("rate hikes")));
    check("  …and one about inflation finds the CPI rows", matchesFocus(cpiEv, focusTerms("inflation")) && !matchesFocus(cpiEv, focusTerms("interest rates")));
  } finally {
    globalThis.fetch = realFetch;
  }

  console.log("\nRegistered everywhere a kind and a source must be");
  for (const key of ["fed_fomc", "bls_cpi"] as const) {
    const s = SOURCES.find((x) => x.key === key);
    check(`${key}: public domain, commercial use allowed, reviewed`, s?.license === "public domain" && s.commercialOk === true && /^\d{4}-\d{2}-\d{2}$/.test(s.reviewedOn));
  }
  check("the database knows the kind", /ADD VALUE IF NOT EXISTS 'macro'/.test(read("db/027_macro_kind.sql")) && /'exploit','macro'[,)]/.test(read("docs/EVENTS-SCHEMA.md")) && /'macro'/.test(read("db/001_init.sql")));
  check("the chart has a marker for it", MARKER_STYLE.macro?.color === "#34d399");

  console.log("\nOn a company page: there when asked for, never the company's own");
  const pageData = read("lib/page-data.ts");
  check("company pages load the economy subject by its slug", /loadMacroEvents\(MACRO_SUBJECT\.slug\)/.test(pageData) && MACRO_SUBJECT.slug === "us-economy");
  check("  …into a field of their own, out of what /compare and the follow badge read", /^\s+macro,$/m.test(pageData) &&
    // the events are the company's and its sector's alone, bounded for the cache since batch 35
    /boundPageNews\(\s*dropCompanyPrehistory\(pageFilings\(\[\.\.\.events, \.\.\.withoutSharedSectorRows\(events, sector\)\], subject\.cik\)\)/.test(pageData));
  check("  …and the cached page shape moves on, so no cached page lacks the field", /\["held-company-page", "v[5-9]"\]/.test(pageData));
  const explorer = read("components/CompanyExplorer.tsx");
  check("the Economy chip starts off", /DEFAULT_OFF: ReadonlySet<EventType> = new Set<EventType>\(\["macro"\]\)/.test(explorer) && /useState<Set<EventType>>\(\(\) => new Set<EventType>\(DEFAULT_TYPES\)\)/.test(explorer));
  check("  …a link of the default view carries no ?types=", /ALL_TYPES\.some\(\(t\) => active\.has\(t\) !== DEFAULT_TYPES\.includes\(t\)\)/.test(explorer));
  check("  …a focus that matches the Fed or CPI rows turns it on, unless the reader chose", /macroMatchesFocus && !chosen/.test(explorer));
  check("  …and the economy before an IPO is not the company's run-up to it", /e\.type !== "macro"/.test(explorer));
  check("the economy subject's own page shows its events", /\{ key: "macro", label: "Fed & inflation" \}/.test(read("components/TopicExplorer.tsx")));

  console.log("\nKept current");
  const refresh = read("scripts/refresh.ts");
  check("the scheduler sends the economy subject to its own ingester, not to Wikipedia", /s\.slug === MACRO_SUBJECT\.slug\) return await ingestMacro\(client\)/.test(refresh));
  check("  …and creates it on a database that lacks it", /if \(!held\.length\) rows\.push\(\{ slug: MACRO_SUBJECT\.slug/.test(refresh));
  const ingest = read("scripts/ingest.ts");
  check("the first run backfills the FOMC history by itself", /Number\(rows\[0\]\?\.n \?\? 0\) === 0/.test(ingest) && /npm run ingest -- --macro|--macro \[history\]/.test(ingest));
  check("the homepage does not suggest the economy subject in place of a topic", /AND s\.slug <> \$2/.test(read("lib/subjects-index.ts")) && /\[limit, MACRO_SUBJECT\.slug\]/.test(read("lib/subjects-index.ts")));
  check("the footer credits both publishers", /Federal Reserve/.test(read("app/layout.tsx")) && /Bureau of Labor Statistics/.test(read("app/layout.tsx")));

  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  if (fail) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
