import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

/**
 * Which listed company's or fund's page a security's CUSIP is (batch 179, for the 13F holdings; the N-PORT holdings of
 * batch 180 read it too). The SEC's fails-to-deliver files, twice a month since 2004, give every security that failed to
 * settle with its CUSIP, its ticker then and a description ("037833100|AAPL|APPLE INC;COM NPV"); one a month from June
 * 2012 is read. A CUSIP is the page of the ticker it last had, where that ticker is in EDGAR's index (letters and digits
 * compared: "BRKB" is BRK-B) and the description agrees with the company's names (`namesAgree`): its first word is the
 * first word of its EDGAR title, an alias, a predecessor's name or an EDGAR former name, and where that word is a
 * common one ("First", "American", "United") its second word too. A ticker another company took up later (CardioNet's
 * BEAT, HeartBeam's since 2021) so keeps the old CUSIP off the new company's page. `npm run sync:13f` writes the map to
 * `data/13f/cusips.json.gz`.
 */

export const CUSIP_MAP_FILE = join(__dirname, "..", "data", "13f", "cusips.json.gz");

const STOP = new Set(["THE", "A"]);

/** A first word too common to name a company alone: its second word must agree too. */
export const COMMON_FIRST_WORDS = new Set([
  "FIRST", "AMERICAN", "AMERICA", "UNITED", "NATIONAL", "GENERAL", "INTERNATIONAL", "GLOBAL", "NEW", "CHINA", "US", "BANK", "CITIZENS",
  "COMMUNITY", "PACIFIC", "WESTERN", "SOUTHERN", "NORTHERN", "EASTERN", "CENTRAL", "SECURITY", "PEOPLES", "HOME", "CAPITAL", "ENERGY",
]);

/** A name's words in capitals, punctuation off, a run of single letters one word: "U.S.PHYSICAL" and "U S PHYSICAL" are "US PHYSICAL", "C&F" and "C & F" "CF". */
export function nameWords(name: string): string[] {
  const out: string[] = [];
  let run = "";
  for (const x of name.toUpperCase().replace(/&/g, "").replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter(Boolean)) {
    if (x.length === 1) {
      run += x;
      continue;
    }
    if (run) out.push(run);
    run = "";
    out.push(x);
  }
  if (run) out.push(run);
  return out.filter((x) => !STOP.has(x));
}

/** Two words as one, or one a cut of the other of four letters or more, as the files cut their descriptions ("HATHWY"). */
const like = (a: string, b: string, min = 4) => a === b || (Math.min(a.length, b.length) >= min && (a.startsWith(b) || b.startsWith(a)));

/** A fund's or a trust's description, which can lead with its sponsor's brand ("STATE STREET SPDR S&P 500 ETF" is SPY's, "SPDR S&P 500 ETF TRUST"). */
// ("SHS" is not one: a foreign company's shares are written so, "MDXHEALTH SA SHS NEW(BELGIUM)")
const FUND_LIKE = /\b(?:ETF|ETN|FUND|FD|TR|TRUST|PORTFOLIO)\b/;

/**
 * Whether a security's description names one of the company's names: its first word, and its second where the first is
 * common; a fund's description its first word among its first three, as its sponsor's brand can lead it.
 */
export function namesAgree(description: string, names: Iterable<string>): boolean {
  const d = nameWords(description);
  if (!d.length || d[0].length < 2) return false;
  const leads = FUND_LIKE.test(description.toUpperCase()) ? d.slice(0, 3) : d.slice(0, 1);
  for (const name of names) {
    const f = nameWords(name);
    const at = f.length ? leads.findIndex((w) => like(f[0], w)) : -1;
    if (at < 0) continue;
    if (at > 0) return true;
    if (COMMON_FIRST_WORDS.has(f[0]) && !(f[1] && d[1] && like(f[1], d[1], 3))) continue;
    return true;
  }
  return false;
}

/** A ticker as the files and the index both compare it: its letters and digits. */
export const tickerKey = (t: string) => t.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** What the files give a CUSIP: its last ticker, that ticker's last description, and the days it was first and last seen. */
export interface Seen {
  symbol: string;
  description: string;
  first: string;
  last: string;
}

/** Reads one fails-to-deliver file's rows (SETTLEMENT DATE|CUSIP|SYMBOL|QUANTITY (FAILS)|DESCRIPTION|PRICE) into the CUSIPs seen. */
export function readFailsFile(text: string, seen: Map<string, Map<string, Seen>>): void {
  for (const line of text.split(/\r?\n/)) {
    const p = line.split("|");
    if (p.length < 5 || !/^\d{8}$/.test(p[0])) continue;
    const cusip = p[1].trim().toUpperCase();
    const symbol = p[2].trim().toUpperCase();
    if (!/^[0-9A-Z]{9}$/.test(cusip) || !symbol) continue;
    const day = `${p[0].slice(0, 4)}-${p[0].slice(4, 6)}-${p[0].slice(6, 8)}`;
    const bySymbol = seen.get(cusip) ?? seen.set(cusip, new Map()).get(cusip)!;
    const s = bySymbol.get(symbol);
    if (!s) bySymbol.set(symbol, { symbol, description: p[4].trim(), first: day, last: day });
    else {
      if (day > s.last) {
        s.last = day;
        s.description = p[4].trim();
      }
      if (day < s.first) s.first = day;
    }
  }
}

/**
 * The map: each CUSIP seen to the index ticker it last had, where its description agrees with that company's names; and
 * the refused, each with its ticker, description, days and the company the ticker is now.
 */
export function buildCusipMap(
  seen: ReadonlyMap<string, ReadonlyMap<string, Seen>>,
  tickers: ReadonlyMap<string, { ticker: string; cik: number }>,
  namesOf: (cik: number) => Iterable<string>,
): { map: Record<string, string>; refused: { cusip: string; symbol: string; description: string; first: string; last: string; ticker: string; cik: number }[] } {
  const map: Record<string, string> = {};
  const refused: { cusip: string; symbol: string; description: string; first: string; last: string; ticker: string; cik: number }[] = [];
  for (const [cusip, bySymbol] of seen) {
    const latest = [...bySymbol.values()].sort((a, b) => b.last.localeCompare(a.last) || a.symbol.localeCompare(b.symbol))[0];
    const company = tickers.get(tickerKey(latest.symbol));
    if (!company) continue;
    if (namesAgree(latest.description, namesOf(company.cik))) map[cusip] = company.ticker;
    else refused.push({ cusip, symbol: latest.symbol, description: latest.description, first: latest.first, last: latest.last, ticker: company.ticker, cik: company.cik });
  }
  return { map, refused };
}

let cached: { path: string; map: Map<string, string> } | null = null;

/** The committed map, CUSIP to ticker. */
export function cusipMap(path = CUSIP_MAP_FILE): ReadonlyMap<string, string> {
  if (cached?.path === path) return cached.map;
  const body = existsSync(path) ? (JSON.parse(gunzipSync(readFileSync(path)).toString("utf8")) as { map: Record<string, string> }) : { map: {} };
  cached = { path, map: new Map(Object.entries(body.map)) };
  return cached.map;
}
