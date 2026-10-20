/**
 * What the Federal Reserve and BLS pages hold, as the site reads them — and a trimmed copy of
 * each page to pin as `check:macro`'s fixture.
 *
 *   npm run macro-report              # summary only
 *   npm run macro-report -- --pin     # also rewrite scripts/fixtures/macro-pages.json
 *
 * The parsers in lib/macroParse.ts trust a label and an address, chosen by reading these pages
 * (NC-080). If the Fed or BLS redesigns them, `check:live` fails; this shows what changed and
 * re-pins the fixture from the new pages. Read-only apart from `--pin`, and it needs a host that
 * reaches www.federalreserve.gov and www.bls.gov.
 */
import { writeFileSync } from "node:fs";
import { parseCpiReleases, parseFomcHistoricalYears, parseFomcStatements } from "../lib/macroParse";

const UA = { "User-Agent": "News Charts Research marcusowens94@gmail.com" };
const FED = "https://www.federalreserve.gov/monetarypolicy";

/** The year pages pinned: one per era of the Fed's statement addresses. */
const PINNED_YEARS = [1994, 2001, 2008, 2020];

async function get(url: string): Promise<string> {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return res.text();
}

/**
 * The parts of a page the checks need: a window around each link matching `pattern`, merged
 * where windows overlap. Small enough to commit, real enough that a parser passing on it would
 * pass on the page.
 */
function excerpt(html: string, pattern: RegExp, before = 700, after = 250): string {
  const spans: [number, number][] = [];
  for (const m of html.matchAll(pattern)) {
    const s: [number, number] = [Math.max(0, m.index! - before), Math.min(html.length, m.index! + m[0].length + after)];
    const last = spans.at(-1);
    if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]);
    else spans.push(s);
  }
  return spans.map(([a, b]) => html.slice(a, b)).join("\n<!-- … -->\n");
}

async function main(): Promise<void> {
  const pin = process.argv.includes("--pin");
  const calendar = await get(`${FED}/fomccalendars.htm`);
  const index = await get(`${FED}/fomc_historical_year.htm`);
  const cpi = await get("https://www.bls.gov/bls/news-release/cpi.htm");

  const current = parseFomcStatements(calendar);
  console.log(`FOMC calendar: ${current.length} statements, ${current[0]?.date} to ${current.at(-1)?.date}`);
  const years = parseFomcHistoricalYears(index);
  console.log(`FOMC year pages: ${years.length} (${years.at(-1)}–${years[0]})`);
  const releases = parseCpiReleases(cpi);
  console.log(`CPI archive: ${releases.length} releases, ${releases[0]?.date} to ${releases.at(-1)?.date}`);
  console.log(`  newest: ${releases.at(-1)?.date} — ${releases.at(-1)?.referenceMonth}`);

  const pages: Record<string, string> = {
    // every meeting row of the newest two years, plus the August 2025 strategy statement
    fomcCalendar: excerpt(calendar, /<strong>\s*Statement:\s*<\/strong>|Statement on Longer-Run Goals/gi),
    fomcHistoryIndex: excerpt(index, /fomchistorical(?:19(?:3[6-9]|9[0-9])|20[0-2][0-9])\.htm/gi, 40, 40),
    cpiArchive: excerpt(cpi, /cpi\.nr0\.htm|cpi_\d{8}\.htm/gi, 120, 120),
  };
  for (const y of PINNED_YEARS) {
    const page = await get(`${FED}/fomchistorical${y}.htm`);
    const found = parseFomcStatements(page);
    console.log(`  ${y}: ${found.length} statements`);
    // the Statement links, and the press releases and strategy statements that are not decisions
    pages[`fomcHistorical${y}`] = excerpt(page, />\s*(?:Statement|Press Release|Statement on Longer-Run Goals[^<]*)\s*<\/a>/gi, 300, 60);
    await new Promise((r) => setTimeout(r, 1000));
  }

  if (pin) {
    const fixture = {
      provenance: `Trimmed from the live pages on ${new Date().toISOString().slice(0, 10)} by \`npm run macro-report -- --pin\`: www.federalreserve.gov (calendar, history index, year pages ${PINNED_YEARS.join(", ")}) and www.bls.gov (CPI release archive).`,
      provisional: false,
      pages,
    };
    writeFileSync("scripts/fixtures/macro-pages.json", JSON.stringify(fixture, null, 1) + "\n");
    console.log("\npinned scripts/fixtures/macro-pages.json");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
