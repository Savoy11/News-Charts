import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import EventList, { OPEN_ROW_BUDGET, foldedYears } from "../components/EventList";
import type { TimelineEvent } from "../lib/types";

/**
 * A long event list opens with its older years folded (batch 38).
 *
 *   npm run check:event-folds
 *
 * The open item from batch 35: JPMorgan's page "is still 7.1 MB… what is left is the 4,652 rows
 * the browser lays out." Measured on 2026-10-24 in Chromium, with JPMorgan's real EDGAR, Yahoo and
 * GDELT rows and 3,000 stand-in stories in a scratch database, its page built 32,971 elements,
 * 2,212 of them event rows, and spent 385 ms laying them out; Ford's real page laid out 1,979.
 * Every row was open, from 1799 down, for a reader who came for this year.
 *
 * The rows below are spread over the years the way JPMorgan's and Ford's pages spread theirs
 * (rows per year, as their pages rendered them on main's code).
 */

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

// rows per year on JPMorgan's page, 1984 on (its 17 single rows from 1799 to 1982 are added below)
const JPM: Record<number, number> = {
  1984: 6, 1985: 4, 1986: 4, 1987: 4, 1988: 5, 1989: 4, 1990: 5, 1991: 5, 1992: 4, 1993: 4, 1994: 18, 1995: 25,
  1996: 22, 1997: 19, 1998: 25, 1999: 24, 2000: 33, 2001: 27, 2002: 26, 2003: 17, 2004: 27, 2005: 46, 2006: 48,
  2007: 40, 2008: 40, 2009: 39, 2010: 38, 2011: 44, 2012: 41, 2013: 47, 2014: 46, 2015: 44, 2016: 41, 2017: 80,
  2018: 122, 2019: 89, 2020: 151, 2021: 98, 2022: 141, 2023: 95, 2024: 95, 2025: 120, 2026: 382,
};
const JPM_EARLY = [1799, 1823, 1824, 1851, 1892, 1914, 1920, 1921, 1924, 1930, 1935, 1940, 1955, 1967, 1970, 1980, 1982];
// Ford's newest years
const FORD: Record<number, number> = { 2017: 56, 2018: 48, 2019: 62, 2020: 41, 2021: 56, 2022: 83, 2023: 71, 2024: 54, 2025: 108, 2026: 96 };

let nextId = 1;
/** `n` news rows in `year`, on days through the year. */
function stories(year: number, n: number): TimelineEvent[] {
  return Array.from({ length: n }, (_, i) => {
    const d = i % 336;
    const date = `${year}-${String(Math.floor(d / 28) + 1).padStart(2, "0")}-${String((d % 28) + 1).padStart(2, "0")}`;
    const id = nextId++;
    return { id: `db-${id}`, date, type: "news" as const, title: `Story ${id}`, source: "reuters.com", url: `https://www.reuters.com/${id}`, precision: "day" as const };
  });
}
function filing(date: string): TimelineEvent {
  const id = nextId++;
  return { id: `db-${id}`, date, type: "filing", title: `8-K filing ${id}`, source: "SEC EDGAR", url: `https://www.sec.gov/${id}`, precision: "day" };
}
const sortByDate = (events: TimelineEvent[]) => events.sort((a, b) => a.date.localeCompare(b.date));
const listOf = (perYear: Record<number, number>, early: number[] = []) =>
  sortByDate([...early.flatMap((y) => stories(y, 1)), ...Object.entries(perYear).flatMap(([y, n]) => stories(Number(y), n))]);
const years = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => String(to - i));
const rowsIn = (html: string) => html.split("data-event-row").length - 1;

function main(): void {
  console.log("\nWhich years a list opens folded");
  const jpm = listOf(JPM, JPM_EARLY);
  const jpmFolded = foldedYears(jpm);
  check(`JPMorgan's page: 2026's ${JPM[2026]} rows alone are past the budget of ${OPEN_ROW_BUDGET}, so it opens with 2026 and folds every year before`,
    jpmFolded.length === Object.keys(JPM).length - 1 + JPM_EARLY.length && !jpmFolded.includes("2026") && jpmFolded.includes("1799"),
    `${jpmFolded.length} folded, first ${jpmFolded[0]}`);
  const ford = foldedYears(listOf(FORD));
  check("Ford's: the newest years stay open while they fit (2024–2026, 258 rows), and 2023, which would take it to 329, folds with every year before it",
    JSON.stringify(ford) === JSON.stringify(years(2017, 2023)), JSON.stringify(ford));
  const small = listOf({ 2019: 40, 2024: 60, 2025: 80, 2026: 100 });
  check("a list that fits, as most pages' do, opens whole", foldedYears(small).length === 0 && small.length <= OPEN_ROW_BUDGET);
  check("so does JPMorgan's when a filter leaves fewer rows than the budget",
    foldedYears(jpm.filter((e) => e.date >= "2025-01-01" && Number(e.id.slice(3)) % 2 === 0)).length === 0);

  // filings on the 1st to the 20th of each month condense into one stack a month
  const filings2026 = Array.from({ length: 12 }, (_, m) =>
    Array.from({ length: 40 }, (_, i) => filing(`2026-${String(m + 1).padStart(2, "0")}-${String((i % 20) + 1).padStart(2, "0")}`))).flat();
  const news2026 = Array.from({ length: 30 }, (_, i) => ({ ...stories(2026, 1)[0], date: `2026-${String((i % 12) + 1).padStart(2, "0")}-${25 + (i % 3)}` }));
  const stacked = sortByDate([...filings2026, ...news2026, ...stories(2025, 250), ...stories(2024, 20), ...stories(2023, 20)]);
  check("a stack of filings counts as the one card it is: 480 filings and 30 stories in 2026 are 42 rows, so 2025's 250 still fit",
    JSON.stringify(foldedYears(stacked)) === '["2024","2023"]', JSON.stringify(foldedYears(stacked)));

  console.log("\nWhat the page is sent and lays out first");
  const page = renderToStaticMarkup(createElement(EventList, { events: jpm, persistKey: "news-charts:collapse:/company/JPM" }));
  check(`JPMorgan's list renders 2026's ${JPM[2026]} rows, not all ${jpm.length}`, rowsIn(page) === JPM[2026], `${rowsIn(page)} rows`);
  const header2019 = page.match(/<li id="y-2019"[\s\S]*?<\/li>/)?.[0] ?? "";
  check("a folded year keeps its header, closed, with its count", /aria-expanded="false"/.test(header2019) && header2019.includes(`${JPM[2019]} events`), header2019.slice(0, 120));
  check("its days keep their anchors, so a jump from the chart still finds them", jpm.filter((e) => e.date.startsWith("2019")).every((e) => page.includes(`id="d-${e.date}"`)));
  check("the page says why, and how to open them",
    page.includes("Years before 2026 are folded so this page stays quick to load") && page.includes("Expand all") && !page.includes("Collapse all"));
  const whole = renderToStaticMarkup(createElement(EventList, { events: small }));
  const focused = renderToStaticMarkup(createElement(EventList, { events: jpm, openAll: true }));
  check("a list a focused search narrowed opens every year, however long: the years asked about are the ones a fold would hide",
    rowsIn(focused) === jpm.length && !focused.includes("data-opening-folds"), `${rowsIn(focused)} of ${jpm.length} rows`);
  check("a list that fits renders every row and says nothing", rowsIn(whole) === small.length && !whole.includes("data-opening-folds") && whole.includes("Collapse all"),
    `${rowsIn(whole)} of ${small.length} rows`);

  console.log("\nWired");
  const list = read("components/EventList.tsx");
  check("the opening folds are worked out from the list, not stored, so a filter that shortens it opens everything",
    /const folded = useMemo\(\(\) => new Set\(openAll \? \[\] : yearsToFold\(rows, OPEN_ROW_BUDGET\)\), \[rows, openAll\]\);/.test(list) && /const collapsedYears = chosen\?\.years \?\? folded;/.test(list));
  check("a remembered view is saved only once the reader chooses, and marked as a choice",
    /if \(!persistKey \|\| !hydrated\.current \|\| !chosen\) return;/.test(list) && /chosen: true \}\);/.test(list));
  check("  …and a view saved before, on every visit, is not taken for one", /setChosen\(saved\.chosen \?/.test(list));
  check("company and topic pages open every year while a focus narrows the list",
    ["components/CompanyExplorer.tsx", "components/TopicExplorer.tsx"].every((f) => read(f).includes("openAll={focusResult.active}")));
  check("a jump from the chart opens the folded year it lands in", /const years = c\?\.years \?\? foldedNow\.current;/.test(list) && /openYears\.delete\(year\);/.test(list));

  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  process.exit(fail ? 1 : 0);
}

main();
