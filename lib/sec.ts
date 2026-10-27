import { CompanyInfo, TimelineEvent } from "./types";
import { DEAL_FORM, FOR_ANOTHER_COMPANY, MATERIAL_FORMS, PROSPECTUS, STAKE_FORM, describeItems, leadItem, reportsResults } from "./secForms";
import {
  SIMILARITY_FLOOR,
  distinctiveWords,
  everyWordIn,
  matchWords,
  trigrams,
  wordSimilarity,
  worthFuzzyMatching,
} from "./fuzzy";

const UA = { "User-Agent": "News Charts Research marcusowens94@gmail.com" };

interface TickerRow {
  cik_str: number;
  ticker: string;
  title: string;
}

/**
 * The local EDGAR index — the read path's last network hop, taken off it.
 *
 * Built by `npm run sync:tickers` into `data/edgar-tickers.json` and committed. Every other read
 * path already answered from the database; resolving a ticker still went to sec.gov the first
 * time anybody searched it, so a throttled EDGAR — which a few `npm run refresh` runs are enough
 * to produce, since it rate-limits by User-Agent — made the site's front door look dead.
 *
 * Local first, network still second. The index is a snapshot, so a company that listed after the
 * last sync is not in it; those fall through to the live files exactly as before. What changes is
 * that the common case (every security EDGAR knew at sync time) now costs no request at all.
 */
import rawTickerIndex from "../data/edgar-tickers.json";
import rawCompanyAliases from "../data/company-aliases.json";
import { nameKey, type AliasIndexFile } from "./companyAliases";
import { foldAccents } from "./fold";
import { predecessorsOf } from "./predecessors";
import { commonName } from "./edgarName";
import { eastern } from "./marketTime";

export { commonName };

/**
 * The index's contract, declared rather than inferred.
 *
 * Importing the JSON gives TypeScript a literal type with 28,000-odd key names in it, which is
 * both slow to check and wrong to depend on: the code would stop compiling whenever the data file
 * was regenerated with a field the previous one lacked, which is exactly what a *data* file is
 * expected to do. Declaring the shape makes the dependency explicit and lets an older file be a
 * runtime question — every reader below tolerates a missing name index rather than assuming one.
 */
export interface TickerIndex {
  syncedOn: string;
  companies: [number, string, string][];
  funds: Record<string, number>;
  /** fund series names, written once and referenced by index; absent before the 2026-08-12 sync */
  seriesNames?: string[];
  /** the preferred (exchange-traded, where there is one) share-class symbol per series */
  seriesSymbols?: string[];
  /** the registrant CIK per series — carried, because 36% are not resolvable via `funds` */
  seriesCiks?: number[];
  /** EDGAR's id per series ("S000002839"), whose filing list is the fund's own; absent before batch 67 */
  seriesIds?: string[];
  /** every share-class symbol → its series' index in `seriesNames` */
  symbolSeries?: Record<string, number>;
}

const tickerIndex = rawTickerIndex as unknown as TickerIndex;
const companyAliases = rawCompanyAliases as unknown as AliasIndexFile;
/** When the alias index was built (`npm run sync:aliases`). */
export const COMPANY_ALIASES_SYNCED_ON: string = companyAliases.syncedOn;

let localRows: TickerRow[] | null = null;
function localCompanies(): TickerRow[] {
  if (localRows) return localRows;
  // The SEC's own ordering is preserved by the sync script and load-bearing here: the
  // name-prefix rung below takes the FIRST prefix hit, which is only "the company a person
  // almost certainly means" because the file is ordered roughly by size.
  localRows = tickerIndex.companies.map(([cik_str, ticker, title]) => ({
    cik_str,
    ticker,
    title,
  }));
  return localRows;
}

/** When the committed index was built — surfaced so staleness is visible rather than assumed. */
export const TICKER_INDEX_SYNCED_ON: string = tickerIndex.syncedOn;

/**
 * How old the committed index may get before something says so (NC-051).
 *
 * The date was recorded and read only by `check:tickers`, which asks whether it is a date, not
 * whether it is recent — the file sat 66 days old with nothing anywhere mentioning it. The index
 * is imported at build time, so re-syncing it on the server changes nothing until the site is
 * rebuilt; what can run on a schedule is the warning. A month of new listings is what this lets
 * through before `npm run refresh` starts naming it.
 */
export const TICKER_INDEX_MAX_AGE_DAYS = 35;

/** Whole days between the index's sync date and `now`. */
export function tickerIndexAgeDays(now = new Date(), syncedOn = TICKER_INDEX_SYNCED_ON): number {
  return Math.floor((now.getTime() - Date.parse(`${syncedOn}T00:00:00Z`)) / 86_400_000);
}

async function getTickerMap(): Promise<TickerRow[]> {
  const res = await fetch("https://www.sec.gov/files/company_tickers.json", {
    headers: UA,
    next: { revalidate: 86400 },
  });
  if (!res.ok) return [];
  const json = (await res.json()) as Record<string, TickerRow>;
  return Object.values(json);
}

/**
 * The fund half of EDGAR's ticker index: ETFs and mutual funds.
 *
 * `company_tickers.json` covers operating companies (plus some exchange-traded trusts);
 * `company_tickers_mf.json` covers registered funds — every ETF and mutual fund share class,
 * keyed by symbol. The split is not what the names suggest: **SPY resolves out of the *company*
 * file** (it is a unit investment trust) while VOO and VTI exist only here, so both are needed.
 *
 * Neither file carries a fund NAME. `npm run sync:tickers` fetches those separately from EDGAR's
 * series listing and writes them into the index, so `registrantName` below is now only a fallback
 * for a symbol the name pass missed — it answers with the trust ("VANGUARD INDEX FUNDS") rather
 * than the fund, which is why it was never good enough on its own.
 */
interface MfFile {
  fields: string[];
  data: (string | number)[][];
}

async function getFundTickerMap(): Promise<Map<string, string>> {
  const res = await fetch("https://www.sec.gov/files/company_tickers_mf.json", {
    headers: UA,
    next: { revalidate: 86400 },
  });
  if (!res.ok) return new Map();
  const json = (await res.json()) as MfFile;
  const symbolAt = json.fields.indexOf("symbol");
  const cikAt = json.fields.indexOf("cik");
  if (symbolAt < 0 || cikAt < 0) return new Map();
  const bySymbol = new Map<string, string>();
  for (const row of json.data) {
    const symbol = String(row[symbolAt]).toUpperCase();
    if (symbol && !bySymbol.has(symbol)) {
      bySymbol.set(symbol, String(row[cikAt]).padStart(10, "0"));
    }
  }
  return bySymbol;
}

async function registrantName(cik: string): Promise<string | null> {
  const res = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
    headers: UA,
    next: { revalidate: 86400 },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { name?: string };
  return json.name ?? null;
}

/**
 * The name-prefix rung: "ALIBABA" should find "ALIBABA GROUP HOLDING LIMITED", because nobody
 * types the full legal title.
 *
 * **Gated on ambiguity, not on length.** This used to require three characters, described as a
 * guard "against junk prefixes" — but length is a proxy for ambiguity, and a bad one. `"3M "`
 * matches **exactly one** row in the whole index, so the guard was declining an unambiguous
 * answer and telling a visitor that a Dow 30 component is not a listed security. Of the 140
 * distinct two-character title prefixes in the committed index, 94 are unique.
 *
 * So: one match is an answer whatever its length. Several matches still need enough of a query
 * to be meant, and the first is taken because the SEC orders its file roughly by size — which is
 * the only reason "APPLE" reaches Apple Inc rather than Apple Hospitality REIT, and why
 * `check:tickers` asserts that ordering survives every rebuild.
 */
function prefixHit(rows: TickerRow[], titles: string[], fq: string, form: NameForm): TickerRow | null {
  if (!fq) return null;
  const matches = rows.filter((r, i) =>
    form === "words" ? titles[i].startsWith(fq + " ") : titles[i].startsWith(fq) && startsWithWords(r.title, fq)
  );
  if (matches.length === 1) return matches[0];
  return matches.length > 1 && fq.length >= 3 ? matches[0] : null;
}

/**
 * The two forms a name is compared in, so punctuation never decides the answer.
 *
 * EDGAR's titles punctuate however the filer did: "COCA COLA CO" beside "COCA-COLA EUROPACIFIC
 * PARTNERS plc", "MCDONALDS CORP" beside "Macy's, Inc.", "O REILLY AUTOMOTIVE INC". Matched on
 * the raw title, the comma in "BlackRock, Inc." kept "BlackRock" from ever reaching BLK, so the
 * first title that did begin "BLACKROCK " — a closed-end trust, BSTZ — answered; "Coca-Cola" went
 * to CCEP, and 2,727 of 2,794 "Name, Inc." titles could not be found by their own name (audit
 * 2026-10-21 #2).
 *
 * - `words`: punctuation folded, word breaks kept — "BlackRock, Inc." → "BLACKROCK INC",
 *   "Macy's" → "MACYS". Tried first, because a space a person typed is meant: "Pure Cycle" is
 *   Pure Cycle Corp, not PureCycle Technologies, and "Black Stone" is Black Stone Minerals.
 * - `compact`: spaces folded too — "U.S. Bancorp" → "USBANCORP" finds "US BANCORP DE", "Exxon
 *   Mobil" finds "ExxonMobil Holdings Corp", "O'Reilly" finds "O REILLY AUTOMOTIVE". Only when the
 *   words form finds nothing.
 */
type NameForm = "words" | "compact";
const NAME_FORMS: Record<NameForm, (s: string) => string> = {
  words: nameKey,
  compact: (s) => s.toUpperCase().replace(/[^A-Z0-9&]/g, ""),
};

/** Each index's titles in each form, worked out once rather than on every search. */
const formCache = new WeakMap<TickerRow[], Record<NameForm, string[]>>();
function titlesIn(rows: TickerRow[], form: NameForm): string[] {
  let forms = formCache.get(rows);
  if (!forms) {
    forms = { words: rows.map((r) => NAME_FORMS.words(r.title)), compact: rows.map((r) => NAME_FORMS.compact(r.title)) };
    formCache.set(rows, forms);
  }
  return forms[form];
}

const WORD_CHAR = /[A-Z0-9&]/;

/**
 * Whether `title` begins with the compact query and the query ends where one of the title's words
 * does — so "OREILLY" finds "O REILLY AUTOMOTIVE INC", while "META" does not find "METALLA".
 */
function startsWithWords(title: string, cq: string): boolean {
  const t = title.toUpperCase();
  let k = 0;
  for (let i = 0; i < t.length; i++) {
    if (!WORD_CHAR.test(t[i])) continue;
    if (t[i] !== cq[k]) return false;
    if (++k === cq.length) return i + 1 === t.length || !WORD_CHAR.test(t[i + 1]);
  }
  return false;
}

/**
 * A company by its EDGAR title: the whole title in either form, else a title prefix. The two
 * are told apart because an alias — another whole name — ranks between them.
 */
function titleHit(rows: TickerRow[], q: string): { row: TickerRow; exact: boolean } | null {
  for (const form of ["words", "compact"] as const) {
    const fq = NAME_FORMS[form](q);
    const at = fq ? titlesIn(rows, form).indexOf(fq) : -1;
    if (at >= 0) return { row: rows[at], exact: true };
  }
  for (const form of ["words", "compact"] as const) {
    const row = prefixHit(rows, titlesIn(rows, form), NAME_FORMS[form](q), form);
    if (row) return { row, exact: false };
  }
  return null;
}

/**
 * A company by another of its names — "Google" for Alphabet, "Facebook" for Meta, "P&G" — from
 * the committed alias index (`lib/companyAliases.ts`, NC-004). Ranked after an exact title and
 * before a title prefix: a whole name beats part of one, so "Google" no longer reaches a
 * Google-themed ETF through the fund-name rung, while "Apple" is still Apple Inc.
 */
function aliasHit(rows: TickerRow[], q: string): TickerRow | null {
  const entry = companyAliases.aliases[nameKey(q)];
  return entry ? (rows.find((r) => r.cik_str === entry[0]) ?? null) : null;
}

/** The title rungs alone, against the committed index — what `npm run sync:aliases` compares with. */
export function titleMatch(name: string): { cik: number; exact: boolean } | null {
  const hit = titleHit(localCompanies(), name.trim().toUpperCase());
  return hit ? { cik: hit.row.cik_str, exact: hit.exact } : null;
}

/** The tickers the committed index lists for a company. */
export function companyTickers(cik: number): string[] {
  return tickerIndex.companies.filter(([c]) => c === cik).map(([, ticker]) => ticker);
}

/**
 * A company's other names that may find and score its news (batch 25): its own former names and
 * a predecessor whose ticker it carries — "Google" for Alphabet, "Facebook" for Meta — never an
 * acquisition's or a loose alias (`lib/companyAliases.ts`). Shortest first; a name containing
 * another, or the name the feeds already ask for, is left out ("facebook inc" beside "facebook",
 * "oracle corporation" beside "Oracle"); at most three, so a query stays one request.
 *
 * Returned as written, accents folded and a leading "The" dropped — "U.S. Bancorp", not the
 * matching key "u s bancorp", which a Federal Register search does not find (batch 28).
 *
 * When the name asked for is one word, a longer name that adds a real word stays: "Acuity Brands"
 * beside "ACUITY", "Tesla Motors" beside "TESLA". Searched alone, a one-word name that is also a
 * word ("acuity", as in visual acuity) crowds the company's own federal documents out of the
 * results: without "Acuity Brands", Acuity's went from 2 to 1 on a live query (batch 28). A name
 * that only adds a legal form still adds nothing ("Oracle Corporation").
 */
export function newsNamesFor(cik: number | string): string[] {
  const want = Number(cik);
  const title = tickerIndex.companies.find(([c]) => c === want)?.[2];
  // the name the feeds are already asked for; one containing it ("oracle corporation") adds nothing
  const askedKey = title ? nameKey(commonName(title)) : "";
  const asked = askedKey ? ` ${askedKey} ` : null;
  const addsAWord = (written: string) =>
    !askedKey.includes(" ") && nameKey(commonName(written)).replace(/^THE /, "") !== askedKey;
  const names = Object.entries(companyAliases.aliases)
    .filter(([, [c, , , news]]) => c === want && news === 1)
    .map(([key, [, , , , written]]) => ({
      key: key.replace(/^THE /, ""),
      written: foldAccents(written ?? key).replace(/^the\s+/i, ""),
    }))
    .filter(({ key, written }) => !asked || !` ${key} `.includes(asked) || addsAWord(written))
    .sort((a, b) => a.key.length - b.key.length || a.key.localeCompare(b.key));
  const kept: typeof names = [];
  for (const n of names) if (!kept.some((k) => ` ${n.key} `.includes(` ${k.key} `))) kept.push(n);
  // …and a predecessor's own name, where the present one is not how headlines write the company:
  // "Exxon Mobil" for ExxonMobil Holdings (`lib/predecessors.ts`); first, as the commonest
  const carried = predecessorsOf(want)
    .flatMap((p) => p.news ?? [])
    .filter((n) => nameKey(n) !== askedKey && !kept.some((k) => k.key === nameKey(n)));
  return [...carried, ...kept.map((n) => n.written)].slice(0, 3);
}

/**
 * The company's own name with the apostrophe its SEC title dropped — "McDonald's" for MCDONALDS
 * CORP, "Lowe's" for LOWES COMPANIES INC — as Wikidata writes it, or "" (batch 36). Search never
 * needed it, since the title finds the company, but GDELT holds a possessive without its "'s"
 * (`gdeltEverydayName`).
 */
export function possessiveNameFor(cik: number | string): string {
  return companyAliases.possessive?.[String(Number(cik))] ?? "";
}

/** Every company the committed index lists, CIK and title, in the SEC's order. */
export const TICKER_INDEX_COMPANIES: [number, string][] = tickerIndex.companies.map(([cik, , title]) => [cik, title]);

/**
 * The company rungs, against whichever copy of the index the caller has.
 *
 * Split out so the local snapshot and the live file go through identical matching — two copies
 * of this laddering would drift, and the drift would be invisible: the local one answers almost
 * every query, so a divergence would only ever show up for a newly listed company.
 */
function matchCompany(rows: TickerRow[], q: string): CompanyInfo | null {
  const byTicker = rows.find((r) => r.ticker === q);
  const named = byTicker ? null : titleHit(rows, q);
  const hit = byTicker ?? (named?.exact ? named.row : null) ?? aliasHit(rows, q) ?? named?.row ?? null;
  if (!hit) return null;
  return {
    ticker: hit.ticker,
    cik: String(hit.cik_str).padStart(10, "0"),
    name: hit.title,
  };
}

/** Symbols are short; anything else cannot be one, and asking about it wastes a request. */
const SYMBOL_SHAPE = (q: string) => q.length >= 2 && q.length <= 6 && /^[A-Z0-9.]+$/.test(q);

/** The fund series name behind a share-class symbol — "VFIAX" → "Vanguard 500 Index Fund". */
function fundNameFor(symbol: string): string | null {
  const idx = tickerIndex.symbolSeries?.[symbol];
  if (idx === undefined) return null;
  return tickerIndex.seriesNames?.[idx] ?? null;
}

/**
 * Funds by name — the rung "Vanguard 500" needed and could not have.
 *
 * Same shape as the company name rungs: exact name, then name prefix. What it resolves *to* is
 * the fund's preferred share class, chosen at sync time —
 * "Vanguard 500" is honestly VFINX, VFIAX and VOO, and the ETF class is the one this product is
 * about (2026-08-08 scope refocus). A person who wants a specific class still types its symbol,
 * which rung 2 answers exactly.
 *
 * The minimum length is the same guard the company prefix rung uses: two characters of a fund
 * name match half the industry.
 *
 * **Gated on one fund, not first hit.** Unlike company titles, fund names are generic: seven
 * series start "S&P 500 …" and "S&P 500" answered whichever came first, S&P 500 Index Account
 * (QCEQRX) — and 214 exact names ("Balanced Fund", "Money Market Fund") belong to several funds
 * at once (NC-040). A name that means several funds is not an answer; it falls through to the
 * later rungs and, failing those, to "didn't match". Duplicate rows for the SAME fund — the
 * index lists "Vanguard 500 Index Fund" twice, both VOO — still count as one.
 */
function matchFundName(q: string): CompanyInfo | null {
  const names = tickerIndex.seriesNames ?? [];
  const symbols = tickerIndex.seriesSymbols ?? [];
  const ciks = tickerIndex.seriesCiks ?? [];
  const candidates = fundNameCandidates(q);
  if (new Set(candidates.map((i) => symbols[i])).size !== 1) return null;
  const hit = candidates[0];

  const symbol = symbols[hit];
  // The CIK comes from the series index, NOT from a `funds[symbol]` lookup: EDGAR's series
  // listing knows share classes the fund ticker file omits, and 6,787 of 19,040 series (36%)
  // would otherwise be found by name and then answered with null.
  const cik = ciks[hit];
  if (!symbol || cik === undefined) return null;
  return { ticker: symbol, cik: String(cik).padStart(10, "0"), name: names[hit] };
}

/** The series a fund name matches exactly, else by name prefix — indexes into `seriesNames`. */
function fundNameCandidates(q: string): number[] {
  const names = tickerIndex.seriesNames ?? [];
  if (!names.length || q.length < 3) return [];
  const matching = (test: (name: string) => boolean) =>
    names.flatMap((n, i) => (test(n.toUpperCase()) ? [i] : []));
  const exact = matching((n) => n === q);
  return exact.length ? exact : matching((n) => n.startsWith(q + " "));
}

/**
 * Whether a query names several funds at once — "S&P 500" starts seven series' names, and
 * "Balanced Fund" is the whole name of several. `matchFundName` declines those (NC-040), and the
 * search ladder used to fall through to head-prefix salvage, which took "S&P" alone to S&P Global.
 * A name that means several funds is a question for the visitor, so the ladder offers them.
 */
export function fundNameIsShared(query: string): boolean {
  const symbols = tickerIndex.seriesSymbols ?? [];
  return new Set(fundNameCandidates(query.trim().toUpperCase()).map((i) => symbols[i])).size > 1;
}

/**
 * Whether the committed index already answers the whole query — the same in-process rungs
 * `resolveCompany` runs before it touches the network, so no request is made.
 *
 * Prompt search asks this before reading a query as a sentence. "Jack in the Box" is a company's
 * name, not "Jack" with the qualifier "in the Box", and "Transamerica Global Equity" is a fund,
 * not "Transamerica Global" with a stock suffix to strip — the parser would split both.
 */
export function namesSecurity(query: string): boolean {
  const q = query.trim().toUpperCase();
  if (!q) return false;
  return Boolean(
    matchCompany(localCompanies(), q) || (SYMBOL_SHAPE(q) && tickerIndex.funds[q] !== undefined) || matchFundName(q)
  );
}

/** One near match offered when a search finds nothing — never a route on its own. */
export interface SecuritySuggestion {
  ticker: string;
  name: string;
  score: number;
  /** "name" and "prefix" once "&" is read as "and"; anything else is resemblance */
  via: "name" | "prefix" | "fuzzy";
}

/** At most this many — a "did you mean" is a short list or it is a second search page. */
export const SUGGEST_LIMIT = 3;

interface SuggestEntry {
  ticker: string;
  name: string;
  grams: string[];
  /**
   * A company's everyday name ("TESLA" for "Tesla, Inc."), to match the other way round: inside
   * the query. "Tesla Motors" is how people still say it, and the extra word sinks the forward
   * score to 0.46. Companies only — a fund name is too generic to be found inside a phrase.
   * Absent when the everyday name has no distinctive word.
   */
  core?: { grams: Set<string>; words: string[] };
}

interface SuggestIndex {
  entries: SuggestEntry[];
  /** trigram → the entries that contain it, so a query scores only names it shares enough with */
  byGram: Map<string, number[]>;
}

let suggestIndex: SuggestIndex | null = null;

/**
 * Every security the committed index can name, one entry each: a company under its first ticker
 * (the SEC lists the common share first — GOOGL before GOOG, BRK-B before BRK-A), then each fund
 * series under its preferred share class. Built on first use and kept: it is the same file for
 * the life of the process.
 */
function getSuggestIndex(): SuggestIndex {
  if (suggestIndex) return suggestIndex;
  const entries: SuggestIndex["entries"] = [];
  const tickers = new Set<string>();
  const ciks = new Set<number>();
  for (const [cik, ticker, title] of tickerIndex.companies) {
    if (ciks.has(cik) || tickers.has(ticker)) continue;
    ciks.add(cik);
    tickers.add(ticker);
    const everyday = commonName(title);
    const words = distinctiveWords(everyday);
    const grams = new Set(trigrams(everyday));
    entries.push({
      ticker,
      name: title,
      grams: trigrams(title),
      core: words.length ? { grams, words } : undefined,
    });
  }
  const names = tickerIndex.seriesNames ?? [];
  const symbols = tickerIndex.seriesSymbols ?? [];
  names.forEach((name, i) => {
    const symbol = symbols[i];
    // the index lists some series twice under one symbol; once is enough to offer it
    if (!symbol || tickers.has(symbol)) return;
    tickers.add(symbol);
    entries.push({ ticker: symbol, name, grams: trigrams(name) });
  });
  const byGram = new Map<string, number[]>();
  entries.forEach((e, id) => {
    for (const g of new Set(e.grams)) {
      const ids = byGram.get(g);
      if (ids) ids.push(id);
      else byGram.set(g, [id]);
    }
  });
  suggestIndex = { entries, byGram };
  return suggestIndex;
}

/**
 * Near matches for a query the ladder could not answer, from the committed index alone — no
 * request, no database, so a misspelt or "and"-for-"&" name gets an answer when both are down.
 *
 * The corpus search already forgives typos (`findCandidates`, db/020), but only for what the site
 * holds; every security not yet ingested is found here, where matching was exact or by prefix, so
 * "Johnson and Johnson" and "Procter and Gamble" ended at "didn't match a listed security".
 *
 * Scored with the corpus search's own measure and floor and gated by the same distinctive-word
 * test, with one addition: every distinctive word typed has to be in the name (`everyWordIn`).
 * Ranked by score, then how the name matched, then the shorter name — `findCandidates`' own
 * tie-break, because with equal scores the shorter name is the more exact answer.
 *
 * Only when no name holds what was typed does it look the other way, for a company whose everyday
 * name is in the query word for word — "tesla motors" → Tesla. Never ahead of a name that does:
 * "apple hospitalty" is Apple Hospitality REIT misspelt, not Apple Inc with a word added.
 */
export function suggestSecurities(query: string, limit = SUGGEST_LIMIT): SecuritySuggestion[] {
  // folded first, or "Zürich" is matched as "z" and "rich" (batch 28)
  const q = foldAccents(query).trim();
  if (!worthFuzzyMatching(q)) return [];
  const grams = new Set(trigrams(q));
  const ordered = trigrams(q);
  const words = distinctiveWords(q);
  const { entries, byGram } = getSuggestIndex();

  // A name sharing fewer than this many of the query's trigrams cannot reach the floor.
  const need = Math.ceil(SIMILARITY_FLOOR * grams.size);
  const shared = new Uint16Array(entries.length);
  for (const g of grams) for (const id of byGram.get(g) ?? []) shared[id]++;

  const typed = matchWords(q);
  const phrase = typed.join(" ");
  const scored: SecuritySuggestion[] = [];
  for (let id = 0; id < entries.length; id++) {
    const e = entries[id];
    if (shared[id] < need || !everyWordIn(words, e.grams)) continue;
    const score = wordSimilarity(grams, e.grams);
    if (score < SIMILARITY_FLOOR) continue;
    const nameWords = matchWords(e.name).join(" ");
    const via = nameWords === phrase ? "name" : nameWords.startsWith(phrase + " ") ? "prefix" : "fuzzy";
    scored.push({ ticker: e.ticker, name: e.name, score: Math.round(score * 100) / 100, via });
  }
  if (!scored.length) {
    const inQuery = new Set(typed);
    for (const e of entries) {
      if (!e.core || !e.core.words.every((w) => inQuery.has(w))) continue;
      const score = wordSimilarity(e.core.grams, ordered);
      if (score >= SIMILARITY_FLOOR) {
        scored.push({ ticker: e.ticker, name: e.name, score: Math.round(score * 100) / 100, via: "fuzzy" });
      }
    }
  }
  const RANK = { name: 0, prefix: 1, fuzzy: 2 } as const;
  scored.sort(
    (a, b) => b.score - a.score || RANK[a.via] - RANK[b.via] || a.name.length - b.name.length
  );
  return scored.slice(0, limit);
}

/**
 * Whether a security is a fund — an ETF, a mutual fund, a closed-end fund or an exchange-traded
 * trust — rather than a company, so its page can say so to search engines (batch 10 left every
 * security a Corporation: "telling a fund from a company is not reliable from what is stored").
 * Three things that are, each measured against the committed index on 2026-10-25:
 *
 * - a symbol in the registered-fund half of the index (`symbolSeries`): VOO, QQQ, IVV, VFIAX, IBIT;
 * - a name that says ETF or Fund: SPY, DIA and MDY are unit investment trusts in the company half
 *   with no industry code at all, but "SPDR S&P 500 ETF TRUST" says what it is. The company half
 *   has 384 such names (60 ETF, 324 Fund): closed-end funds, lending funds, crypto trusts, USO's
 *   "United States Oil Fund, LP" — and the 8 whose other words do not say fund, read one by one,
 *   are funds too ("GDL FUND", "BANCROFT FUND LTD");
 * - EDGAR's industry 6221 with a name that says Trust: GLD, IAU and SLV are "SPDR GOLD TRUST" and
 *   kin under "Commodity Contracts Brokers & Dealers". The code alone is not enough — Antalpha
 *   Platform Holding and AIB Data Centers file under it too — and Trust alone is a bank's or a
 *   REIT's name as often.
 *
 * A business development company (Ares Capital) stays a company: it files as one.
 */
export function isFund(security: { ticker: string; name: string; sic?: string | null }): boolean {
  if (tickerIndex.symbolSeries?.[security.ticker.trim().toUpperCase()] !== undefined) return true;
  if (/\b(?:ETF|Fund)\b/i.test(security.name)) return true;
  return security.sic === "6221" && /\bTrust\b/i.test(security.name);
}

/** The other fund series a registrant files — what a fund's page offers as related. */
export interface SiblingFunds {
  /** the registrant's CIK, zero-padded, for a link to its EDGAR listing */
  registrantCik: string;
  /** one entry per series, under its preferred share class, in the index's order */
  funds: { ticker: string; name: string }[];
}

/**
 * The other series filed by a fund's registrant, from the committed index — or null for a symbol
 * that is not a fund series, or a registrant with nothing else.
 *
 * Every fund filing tells the reader it "may concern a sibling fund" (NC-139) and never said which
 * funds those are, though `seriesCiks` has carried every series' registrant since the 2026-08-12
 * sync (2026-10-17 proposal 8). Same registrant per EDGAR is the one "related" a fund page can
 * claim without a judgement: VOO's trust also files VTI, VTV, VUG and eight more.
 */
export function siblingFunds(symbol: string): SiblingFunds | null {
  const at = tickerIndex.symbolSeries?.[symbol.trim().toUpperCase()];
  const names = tickerIndex.seriesNames ?? [];
  const symbols = tickerIndex.seriesSymbols ?? [];
  const ciks = tickerIndex.seriesCiks ?? [];
  if (at === undefined || ciks[at] === undefined) return null;
  const cik = ciks[at];
  // the page's own series, under whichever class it was reached by — VFIAX and VOO are one fund
  const self = new Set([symbols[at], symbol.trim().toUpperCase()]);
  const seen = new Set<string>();
  const funds: SiblingFunds["funds"] = [];
  names.forEach((name, i) => {
    const ticker = symbols[i];
    if (ciks[i] !== cik || !ticker || self.has(ticker) || seen.has(ticker)) return;
    seen.add(ticker);
    funds.push({ ticker, name });
  });
  return funds.length ? { registrantCik: String(cik).padStart(10, "0"), funds } : null;
}

/**
 * EDGAR's id for the fund series a symbol is a share class of — "S000002839" for VOO, and for
 * VFIAX, its sister class — whose filing list is the fund's own (`lib/fundSeries.ts`, batch 67).
 * Null for a symbol that is not a fund series, or an index synced before the ids were kept.
 */
export function fundSeriesId(symbol: string): string | null {
  const at = tickerIndex.symbolSeries?.[symbol.trim().toUpperCase()];
  const id = at === undefined ? undefined : tickerIndex.seriesIds?.[at];
  return id && /^S\d{9}$/.test(id) ? id : null;
}

/**
 * The ticker a query names, from the committed index alone — rungs 1–3 below without the
 * registrant enrichment or the live files, so it never makes a request.
 *
 * For a read path that must not spend the network before the first pass's attempt ledger has
 * granted it: /company/Ford only needs to learn that Ford is F, and the index knows (NC-161).
 */
export function resolveTickerLocally(query: string): string | null {
  // the index's names carry no accents, so neither does the query: "L'Oréal" is "L'Oreal" (batch 28)
  const q = foldAccents(query).trim().toUpperCase();
  if (!q) return null;
  const company = matchCompany(localCompanies(), q);
  if (company) return company.ticker;
  if (SYMBOL_SHAPE(q) && tickerIndex.funds[q] !== undefined) return q;
  return matchFundName(q)?.ticker ?? null;
}

/**
 * Resolve any exchange-traded security EDGAR knows: operating companies first, then ETFs and
 * mutual funds by symbol, then funds by name. One resolver on purpose — a fund is a subject
 * exactly the way a company is (a CIK with filings and a priced ticker), and two would drift.
 *
 * Rungs 1–3 are answered from the committed index and cost nothing; only rung 4 leaves the
 * machine, and only for a listing newer than the last `npm run sync:tickers`.
 */
export async function resolveCompany(query: string): Promise<CompanyInfo | null> {
  const q = foldAccents(query).trim().toUpperCase();

  // 1. The committed index — no request at all, which is the point of this rung.
  const local = matchCompany(localCompanies(), q);
  if (local) return local;

  // 2. Funds by SYMBOL, from the local index. The display name comes from the index too, when
  //    the series pass has named it — so "VOO" answers "Vanguard 500 Index Fund" with no
  //    request. Only a symbol the name pass missed falls back to the registrant lookup, which
  //    is an enrichment and degrades to the symbol itself.
  if (SYMBOL_SHAPE(q)) {
    const localCik = tickerIndex.funds[q];
    if (localCik !== undefined) {
      const cik = String(localCik).padStart(10, "0");
      const named = fundNameFor(q);
      if (named) return { ticker: q, cik, name: named };
      const name = await registrantName(cik).catch(() => null);
      return { ticker: q, cik, name: name ?? q };
    }
  }

  // 3. Funds by NAME — "Vanguard 500" → VOO. The rung company names already had, which funds
  //    could not have while the only fund source was a symbol list.
  const byName = matchFundName(q);
  if (byName) return byName;

  // 4. Only now the network, and only for what the snapshot could not know: anything listed
  //    since the last `npm run sync:tickers`. Everything above this line is free and offline.
  const rows = await getTickerMap();
  const live = matchCompany(rows, q);
  if (live) return live;

  if (SYMBOL_SHAPE(q)) {
    const funds = await getFundTickerMap().catch(() => new Map<string, string>());
    const cik = funds.get(q);
    if (cik) {
      const name = await registrantName(cik).catch(() => null);
      return { ticker: q, cik, name: name ?? q };
    }
  }
  return null;
}

const containingCache = new Map<string, string[]>();
const phrase = (s: string) =>
  s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();

/**
 * The everyday names of other listed companies that contain this one's as a phrase — "portland
 * general electric" for "general electric", "ford motor credit" for "ford motor". When a title
 * carries the longer name, the mention belongs to that company, not this one.
 */
export function listedNamesContaining(everyday: string): string[] {
  const own = phrase(everyday);
  const cached = containingCache.get(own);
  if (cached) return cached;
  const found = new Set<string>();
  for (const r of localCompanies()) {
    const theirs = phrase(commonName(r.title));
    if (theirs !== own && ` ${theirs} `.includes(` ${own} `)) found.add(theirs);
  }
  const list = [...found];
  containingCache.set(own, list);
  return list;
}

export interface Industry {
  /** 4-digit SIC code, e.g. "3674" */
  sic: string;
  /** EDGAR's own label, e.g. "Semiconductors & Related Devices" */
  description: string;
}

/**
 * Every EDGAR submissions record carries an SIC code, so peer grouping is
 * authoritative rather than inferred — and free. Shares the fetch cache with
 * getFilings(), so asking for both costs one request.
 */
export async function getIndustry(company: CompanyInfo): Promise<Industry | null> {
  const res = await fetch(`https://data.sec.gov/submissions/CIK${company.cik}.json`, {
    headers: UA,
    next: { revalidate: 3600 },
  });
  if (!res.ok) return null;
  const json = await res.json();
  const sic = String(json?.sic ?? "").trim();
  const description = String(json?.sicDescription ?? "").trim();
  if (!/^\d{3,4}$/.test(sic) || !description) return null;
  return { sic: sic.padStart(4, "0"), description };
}

/**
 * Filings from EDGAR. Annual and quarterly reports, results 8-Ks and fund shareholder reports
 * become "earnings" events; other material forms become "filing" events.
 */
/**
 * One block of EDGAR's parallel filing arrays — `filings.recent`, or an older shard, which carry
 * the same columns. Split out so both go through identical typing and labelling: two copies would
 * drift, and the drift would only ever show on filings old enough that nobody was looking.
 */
interface FilingBlock {
  form?: string[];
  filingDate?: string[];
  accessionNumber?: string[];
  primaryDocument?: string[];
  items?: string[];
  fileNumber?: string[];
  acceptanceDateTime?: string[];
}

/**
 * When EDGAR accepted a filing, as an instant, or null when it does not say (batch 68). The stamp is
 * UTC: Apple's results 8-K of 2026-07-30 reads "2026-07-30T20:30:28.000Z", and its filing page says
 * accepted 16:30:28. Until 2002 EDGAR kept most filings' day only, stamped midnight New York time
 * — all of Ford's 366 filings of 1994 to 2001 and 22 of its 64 in 2002, though one of Apple's 1994
 * filings has a time — so a stamp of exactly midnight Eastern is a day, not a time, and is dropped.
 */
export function acceptedAt(raw: string | undefined): string | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(raw)) return null;
  const et = eastern(raw);
  if (!et || et.time === "00:00:00") return null;
  return raw.replace(/\.\d+Z$/, "Z");
}

/** One 424B prospectus, held back so a day's worth can become one row (`prospectusEvents`). */
interface Prospectus {
  form: string;
  date: string;
  accession: string;
  doc: string;
}

function filingsFromBlock(
  block: FilingBlock,
  company: CompanyInfo,
  registrant: string,
  prospectuses: Prospectus[],
  othersStakes: string[]
): TimelineEvent[] {

  /**
   * Operating-company forms AND registered-fund forms. The set used to cover companies only,
   * so an ETF or mutual fund resolved perfectly, priced perfectly — and rendered a miss page,
   * because a trust like SPY files 497s, 485s and shareholder reports, never a 10-K, and every
   * one of them fell through the filter. Verified against SPY's own submissions: its recent
   * list is 497 ×80, N-30D ×48, 485BPOS ×27, NPORT-P ×27 … and not one form the old set knew.
   *
   * A fund's shareholder report (N-CSR, and N-30D in the older records) is its results
   * announcement — typed `earnings` so it sits on the same chip a company's 10-K does.
   */
  const wanted = new Set([
    // operating companies — 20-F and 40-F are a foreign private issuer's annual report
    "8-K", "10-K", "10-Q", "S-1", "DEF 14A", "20-F", "40-F", "6-K",
    // registered funds
    "N-CSR", "N-CSRS", "N-30D", "N-CEN", "NPORT-P", "485APOS", "485BPOS", "497", "497K", "N-1A",
  ]);
  const FUND_LABELS: Record<string, { label: string; earnings: boolean }> = {
    "N-CSR": { label: "Shareholder report (N-CSR)", earnings: true },
    "N-CSRS": { label: "Semi-annual shareholder report (N-CSRS)", earnings: true },
    "N-30D": { label: "Shareholder report (N-30D)", earnings: true },
    "N-CEN": { label: "Annual fund census (N-CEN)", earnings: false },
    "NPORT-P": { label: "Portfolio holdings (NPORT-P)", earnings: false },
    "485APOS": { label: "Registration amendment (485APOS)", earnings: false },
    "485BPOS": { label: "Registration amendment (485BPOS)", earnings: false },
    "497": { label: "Prospectus update (497)", earnings: false },
    "497K": { label: "Summary prospectus (497K)", earnings: false },
    "N-1A": { label: "Fund registration (N-1A)", earnings: false },
  };
  const events: TimelineEvent[] = [];
  const n = block.form?.length ?? 0;
  for (let i = 0; i < n; i++) {
    const form = block.form?.[i] ?? "";
    const material = MATERIAL_FORMS[form];
    const prospectus = PROSPECTUS.test(form);
    if (!wanted.has(form) && !material && form !== "8-K/A" && !prospectus) continue;
    const date = block.filingDate?.[i] ?? "";
    const accession = (block.accessionNumber?.[i] ?? "").replace(/-/g, "");
    // A shard row missing either is unusable: no date is nowhere to put it, and no accession is
    // no stable identity, so it would re-insert as a new event on every refresh.
    if (!date || !accession) continue;
    /**
     * A company's record lists the filings it is the subject of *and* the ones it made, and a
     * Schedule 13D or 13G is an investor's stake in an issuer. One about this company carries its
     * own file number (Ford's are all 005-30156); one this company made about another issuer
     * carries none here. Read as stakes in the company, JPMorgan's page showed 190 of its 192
     * recent ones — its stakes in 3M, DigitalOcean and the rest — and Coca-Cola's its stakes in
     * Coca-Cola Consolidated and CCEP (found measuring audit 2026-10-21 #4; 15 sampled filing
     * headers, every one agreeing). They are another issuer's events, and are not kept here. A
     * record with no file numbers at all says nothing either way, and keeps them.
     */
    if (STAKE_FORM.test(form) && block.fileNumber && !block.fileNumber[i]) {
      othersStakes.push(accession);
      continue;
    }
    const doc = block.primaryDocument?.[i] ?? "";
    if (prospectus) {
      prospectuses.push({ form, date, accession, doc });
      continue;
    }
    const items = block.items?.[i] ?? "";
    const fund = FUND_LABELS[form];
    const eightK = form === "8-K" || form === "8-K/A";
    const results = eightK && reportsResults(items);
    /**
     * A 20-F or 40-F is the annual report of a foreign private issuer — BABA, TSM, ASML, SAP, SHOP
     * — and the counterpart of a 10-K, so it is earnings the way a 10-K is. A 6-K is a filing here:
     * it carries anything a home market required, and the submissions list does not say which.
     * Its press release's headline does, and a results release is typed earnings where the
     * headline is put on it (`asResultsRelease`, lib/ingest/headlines.ts; batch 64).
     */
    const annual = form === "10-K" || form === "20-F" || form === "40-F";
    /**
     * An amended 8-K is named the way an 8-K is, and marked as an amendment. One that amends a
     * results release stays a filing: the release itself is already the earnings event, and a
     * second marker would count one quarter twice.
     */
    const amended = form === "8-K/A";
    const isEarnings =
      fund?.earnings ?? material?.earnings ?? (annual || form === "10-Q" || (results && !amended));
    const lead = eightK && !results ? leadItem(items) : null;
    // a tender offer or proxy fight this company made about another one (`DEAL_FORM`, batch 65)
    const forAnother = DEAL_FORM.test(form) && block.fileNumber && !block.fileNumber[i] ? FOR_ANOTHER_COMPANY[form] : undefined;
    const label =
      fund?.label ??
      (material
        ? `${forAnother ?? material.label} (${form})`
        : annual
          ? `Annual report (${form})`
          : form === "10-Q"
            ? "Quarterly report (10-Q)"
            : results
              ? amended
                ? "Amended earnings announcement (8-K/A)"
                : "Earnings announcement (8-K)"
              : lead
                ? `${amended ? "Amended: " : ""}${lead.label} (${form} ${lead.code})`
                : amended
                  ? "Amended current report (8-K/A)"
                  : `${form} filing`);
    /**
     * A fund's CIK is its registrant's — the trust — and the trust files one 497, N-PORT or
     * shareholder report for any of the series it sells. Prefixed with the fund's name, VOO's
     * page showed every sibling's filings as VOO's own (NC-139). EDGAR's submissions list does
     * not say which series a filing covers, so the honest title names who filed it — and so does
     * the description, which one stored row shows on every sibling's page. The series' own list
     * says which are the fund's, at ingest; its page shows those under its name (batch 67).
     */
    const byRegistrant = fund !== undefined;
    // which side of the session it came out on, for the row and for Biggest moves (batch 68)
    const accepted = acceptedAt(block.acceptanceDateTime?.[i]);
    events.push({
      id: `sec-${accession}`,
      date,
      type: isEarnings ? "earnings" : "filing",
      title: `${byRegistrant ? registrant : company.name}: ${label}`,
      source: "SEC EDGAR",
      url: `https://www.sec.gov/Archives/edgar/data/${Number(company.cik)}/${accession}/${doc}`,
      description: byRegistrant
        ? `Filed by ${registrant}, which files for every fund it sells, so this filing may concern ` +
          `a sibling fund.`
        : eightK
          ? describeItems(items)
          : undefined,
      sourceKey: "sec_edgar",
      // the accession number is already globally unique, so document and event identity coincide
      externalId: accession,
      dedupBasis: `sec:${accession}`,
      ...(accepted ? { occurredAt: accepted } : {}),
    });
  }
  return events;
}

/**
 * A day's prospectuses of one form, as one row — a single one links its document, several link
 * the company's EDGAR list of that form up to that day. Grouped after every block is read, so a
 * day split across the recent block and an older shard is still one row with one count.
 */
function prospectusEvents(prospectuses: Prospectus[], company: CompanyInfo): TimelineEvent[] {
  const byDay = new Map<string, Prospectus[]>();
  for (const p of prospectuses) {
    const key = `${p.date}|${p.form}`;
    byDay.set(key, [...(byDay.get(key) ?? []), p]);
  }
  const cik = Number(company.cik);
  return [...byDay.values()].map((day) => {
    const [{ form, date }] = day;
    const one = day.length === 1 ? day[0] : null;
    const basis = `sec:${cik}:${form}:${date}`;
    return {
      id: `sec-${cik}-${form}-${date}`,
      date,
      type: "filing" as const,
      title: `${company.name}: ${one ? "Prospectus" : `Prospectuses ×${day.length}`} (${form})`,
      source: "SEC EDGAR",
      url: one
        ? `https://www.sec.gov/Archives/edgar/data/${cik}/${one.accession}/${one.doc}`
        : `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${company.cik}&type=${encodeURIComponent(form)}&dateb=${date.replace(/-/g, "")}&owner=include&count=40`,
      description: one
        ? "An offering document for new securities."
        : `${day.length} offering documents for new securities filed this day under ${form}, grouped into one row.`,
      sourceKey: "sec_edgar" as const,
      externalId: basis,
      dedupBasis: basis,
    };
  });
}

/** One entry of a submissions record's `formerNames`: a name and the timestamps it was used between. */
export interface FormerName {
  name?: string;
  from?: string;
  to?: string;
}

/** A change of the filer's name: on `on`, `from` became `to`. */
export interface Rename {
  on: string;
  from: string;
  to: string;
}

/**
 * The real renames in a submissions record (2026-10-17 proposal 9). EDGAR keeps every name a
 * filer has used under `formerNames`, each with the day it stopped — "Facebook Inc" until
 * 2021-10-27 — and the site downloaded the record for its filings and read none of it.
 *
 * Oldest first, each paired with the name that replaced it: the next former name, or the current
 * one. A change of case, punctuation, legal suffix or state tag ("APPLE INC" → "Apple Inc.",
 * "XYZ CORP /DE/" → "XYZ CORP") is not a rename and is dropped, by comparing everyday names.
 * A rename that came with a new CIK (Google → Alphabet) is not in the record and isn't covered.
 */
export function renamesFrom(current: string, formerNames: FormerName[] | undefined, today = new Date()): Rename[] {
  const until = today.toISOString().slice(0, 10);
  const dated = (formerNames ?? [])
    .map((f) => ({ name: String(f?.name ?? "").trim(), on: String(f?.to ?? "").slice(0, 10) }))
    .filter((f) => f.name && /^\d{4}-\d{2}-\d{2}$/.test(f.on) && f.on <= until)
    .sort((a, b) => a.on.localeCompare(b.on));
  const same = (a: string, b: string) => phrase(commonName(a)) === phrase(commonName(b));
  return dated
    .map((f, i) => ({ on: f.on, from: f.name, to: dated[i + 1]?.name ?? current.trim() }))
    .filter((r) => r.to && !same(r.from, r.to));
}

/** A rename as a dated corporate action — the chip a split or a dividend already sits on. */
export function renameEvents(renames: Rename[], company: CompanyInfo): TimelineEvent[] {
  return renames.map((r) => {
    const basis = `sec:${company.cik}:rename:${r.on}`;
    return {
      id: `sec-rename-${company.cik}-${r.on}`,
      date: r.on,
      type: "corporate_action" as const,
      title: `Renamed from ${r.from} to ${r.to}`,
      source: "SEC EDGAR",
      url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${company.cik}&owner=include&count=40`,
      description: `EDGAR's company record lists ${r.from} as a former name of this filer, in use until this day.`,
      sourceKey: "sec_edgar" as const,
      externalId: basis,
      dedupBasis: basis,
    };
  });
}

/** The everyday former names a company is still searched by — "facebook" for Meta Platforms. */
export function formerNameAliases(renames: Rename[], current: string): string[] {
  const own = phrase(commonName(current));
  const out = new Set<string>();
  for (const r of renames) {
    const alias = commonName(r.from).toLowerCase().replace(/\s+/g, " ").trim();
    if (alias.length >= 3 && phrase(alias) !== own) out.add(alias);
  }
  return [...out];
}

/** The recent block only — what every read path wants, and what the first pass is bounded to. */
export async function getFilings(company: CompanyInfo): Promise<TimelineEvent[]> {
  return getFilingsDeep(company, false);
}

/**
 * A company's filings, and how far back to go.
 *
 * EDGAR's submissions record splits at roughly a thousand filings: `filings.recent` holds the
 * newest, and everything older lives in **separate shard files** listed under `filings.files`.
 * This only ever read `recent`, which for an active filer is nowhere near the whole history —
 * measured against Ford, `recent` reaches back to **2019-05-20**, while two shards hold **3,431
 * more filings going back to 1994-01-20**. Twenty-five years of a company's own primary
 * documents, sitting one request away and never asked for.
 *
 * `includeOlder` is off by default, and the default is what the **first pass** uses: that path
 * runs while a visitor waits, on an 8-second budget, and its job is to flip the page's render
 * gate rather than to be complete. Depth belongs to the scheduler, which has no deadline and
 * refreshes on a window — so `scripts/ingest.ts` opts in and nothing on the read path does.
 */
export async function getFilingsDeep(
  company: CompanyInfo,
  includeOlder: boolean,
  /** filled with the filer's renames, for a caller that also stores them as search aliases */
  renames: Rename[] = [],
  /** filled with the accessions of the filer's own stakes in other issuers, left out of the events */
  othersStakes: string[] = []
): Promise<TimelineEvent[]> {
  /**
   * …and the records it was filed under before a new parent took its ticker (`lib/predecessors.ts`):
   * Exxon Mobil Corporation's for XOM, Google Inc.'s for Alphabet. Each is read as the company's,
   * titled with its present name and linked at the record it lives in, up to the day the successor
   * took over. Asked at the same moment as the company's own record, so it costs no wait.
   */
  const earlier = predecessorsOf(company.cik).map(async (p) => {
    const cik = String(p.cik).padStart(10, "0");
    const theirs: Rename[] = [];
    const events = await recordFilings({ ...company, cik }, includeOlder, theirs, othersStakes);
    // A predecessor that took a subsidiary's name as its ticker passed on ("BlackRock Inc." to
    // "BlackRock Finance, Inc." five days before) renamed itself, not the company: its last rename
    // goes, unless it was into the name the company still had then ("Exxon Corp" to "Exxon Mobil").
    const last = theirs.reduce<Rename | null>((a, r) => (!a || r.on > a.on ? r : a), null);
    const own = (r: Rename) => r !== last || phrase(commonName(r.to)) === phrase(commonName(p.name));
    // the record's span as the company's: before the handover, and from the day the shell it began
    // as became the business, not the shell's rename that day (DraftKings' SPAC, batch 55)
    const inSpan = (date: string, rename = false) => date < p.until && (!p.since || (rename ? date > p.since : date >= p.since));
    renames.push(...theirs.filter((r) => inSpan(r.on, true) && own(r)));
    const dropped = last && !own(last) ? `sec-rename-${cik}-${last.on}` : null;
    return events.filter((e) => inSpan(e.date, e.id.startsWith("sec-rename-")) && e.id !== dropped);
  });
  const [own, ...before] = await Promise.all([recordFilings(company, includeOlder, renames, othersStakes), ...earlier]);
  // one row a filing: one the two records share is the successor's
  const seen = new Set(own.map((e) => e.id));
  return [...own, ...before.flat().filter((e) => !seen.has(e.id) && seen.add(e.id))];
}

/** One EDGAR record's filings: its recent block, and its older shards when asked. */
async function recordFilings(
  company: CompanyInfo,
  includeOlder: boolean,
  renames: Rename[],
  othersStakes: string[]
): Promise<TimelineEvent[]> {
  const res = await fetch(`https://data.sec.gov/submissions/CIK${company.cik}.json`, {
    headers: UA,
    next: { revalidate: 3600 },
  });
  if (!res.ok) return [];
  const json = await res.json();
  const recent = json?.filings?.recent;
  if (!recent) return [];

  // EDGAR's own name for the filer — for a fund, the trust rather than the series.
  const registrant = typeof json?.name === "string" && json.name.trim() ? json.name.trim() : company.name;
  const prospectuses: Prospectus[] = [];
  const events = filingsFromBlock(recent, company, registrant, prospectuses, othersStakes);
  // Renames are in the record already in hand, so they cost nothing. A fund's record is its
  // trust's, and the trust's old names are not the fund's — those are left out.
  if (tickerIndex.funds[company.ticker.toUpperCase()] === undefined) {
    const found = renamesFrom(registrant, json?.formerNames);
    renames.push(...found);
    events.push(...renameEvents(found, company));
  }
  if (!includeOlder) return [...events, ...prospectusEvents(prospectuses, company)];

  const shards: { name?: string }[] = json?.filings?.files ?? [];
  for (const shard of shards) {
    if (!shard?.name) continue;
    try {
      const r = await fetch(`https://data.sec.gov/submissions/${shard.name}`, {
        headers: UA,
        next: { revalidate: 86400 },
      });
      // A shard that will not load costs its own years and nothing else — the recent block is
      // already in hand, and half a history beats none.
      if (!r.ok) continue;
      events.push(...filingsFromBlock(await r.json(), company, registrant, prospectuses, othersStakes));
    } catch {
      continue;
    }
  }
  return [...events, ...prospectusEvents(prospectuses, company)];
}
