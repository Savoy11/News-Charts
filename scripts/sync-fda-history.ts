import { readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import tickerIndex from "../data/edgar-tickers.json";
import { UA } from "../lib/contact";
import { dojPossessive } from "../lib/doj";
import { andSpellings, withoutTag } from "../lib/edgarName";
import { FDA_HISTORY_DATA, FDA_HISTORY_FILE, type FdaKept, leadOf, namedBy, namedByHand, readHistoricalDocuments } from "../lib/fdaHistory";
import { companyNames } from "../lib/frCompany";
import { namesForYear } from "../lib/ingest/frBackfill";
import { releaseNamesOn } from "../lib/releaseNames";
import { newsNamesFor, possessiveNameFor } from "../lib/sec";

/**
 * Writes `data/fda-history.json.gz` (batch 169): the FDA's own press releases and talk papers of 1962–2014 that
 * name a listed company, from openFDA's historical documents (`FDA_HISTORY_FILE`, one keyless zip of about 14 MB,
 * one request). Each document dated by its head (`documentDay`) is read against every company in the index under
 * its names of the year, as the index, the aliases and the release map give them (`namedBy`), or as the hand read
 * keeps it (`namedByHand`); a document naming one is kept with every company it names. The file ends in 2014, so this is run once, and again after
 * `npm run sync:tickers`, the index deciding which companies are read.
 *
 *   npm run sync:fda-history                     # asks download.open.fda.gov once
 *   npm run sync:fda-history -- --file <path> --read <day>
 *                                                # reads a saved copy of the zip, as fetched that day
 */
const arg = (k: string) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const file = arg("--file");
const readOn = arg("--read") ?? new Date().toISOString().slice(0, 10);
const FROM_YEAR = 1962;

const companies = (tickerIndex as unknown as { companies: [number, string, string][] }).companies;
const alnum = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");

async function main(): Promise<void> {
  const zip = file
    ? readFileSync(file)
    : await (async () => {
        const res = await fetch(FDA_HISTORY_FILE, { headers: { ...UA }, signal: AbortSignal.timeout(300_000) });
        if (!res.ok) throw new Error(`download.open.fda.gov answered ${res.status}`);
        return new Uint8Array(await res.arrayBuffer());
      })();
  const { documents, lastUpdated } = readHistoricalDocuments(zip);
  // the file of 2026-11-22 holds 8,858 documents; far fewer is a broken read
  if (documents.length < 8_500) throw new Error(`only ${documents.length} documents read`);
  const dated = documents.filter((d) => d.day && d.year >= FROM_YEAR);
  const letters = dated.map((d) => alnum(d.text));
  const named = new Map<string, FdaKept["named"]>();
  const seen = new Set<number>();
  const unitYears = Array.from({ length: 2015 - FROM_YEAR }, (_, k) => `${FROM_YEAR + k}-07-01`);
  for (const [cik, , title] of companies) {
    if (seen.has(cik)) continue;
    seen.add(cik);
    const own = dojPossessive(title, possessiveNameFor(cik));
    const namesIn = (year: number) => [...companyNames(title, namesForYear(year, newsNamesFor(cik), [])), ...(own ? [own] : []), withoutTag(title)];
    // a cheap first pass over the company's names in any year and its units on any day; the rule itself decides
    const pre = [...new Set([...namesIn(2014), ...namesIn(1980), ...unitYears.flatMap((d) => releaseNamesOn(cik, d))].flatMap(andSpellings).map(alnum).filter((n) => n.length >= 5))];
    dated.forEach((d, j) => {
      const byHand = namedByHand(d, cik);
      if (!byHand && !pre.some((n) => letters[j].includes(n))) return;
      const hit = namedBy(d, cik, [...namesIn(d.year), ...releaseNamesOn(cik, d.day!)]) ?? byHand;
      if (!hit) return;
      (named.get(d.id) ?? named.set(d.id, []).get(d.id)!).push({ cik, ...hit });
    });
  }
  const kept: FdaKept[] = dated
    .filter((d) => named.has(d.id))
    .map((d) => ({ id: d.id, year: d.year, type: d.type, day: d.day!, lead: leadOf(d.text, d.year), named: named.get(d.id)! }))
    .sort((a, b) => a.day.localeCompare(b.day) || a.id.localeCompare(b.id));
  const about =
    `The FDA's historical documents (${FDA_HISTORY_FILE}, openFDA's "other/historicaldocument" file, last updated ${lastUpdated}): its press releases and talk papers ` +
    `of ${FROM_YEAR} on whose head gives a day of their own year and that name a listed company in the index by the prose rule of lib/fdaHistory.ts, each with its kind, ` +
    "its day, its lead and every company it names, with the sentence naming each, as the OCR text gives them. openFDA's content is public domain under CC0 1.0. " +
    "Written by `npm run sync:fda-history` (batch 169) for lib/fdaHistory.ts.";
  const body = { about, read: readOn, lastUpdated, total: documents.length, dated: dated.length, documents: kept };
  writeFileSync(FDA_HISTORY_DATA, gzipSync(Buffer.from(`${JSON.stringify(body)}\n`), { level: 9 }));
  console.log(`${documents.length} documents, ${dated.length} dated of ${FROM_YEAR} on, ${kept.length} naming a listed company → ${FDA_HISTORY_DATA}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
