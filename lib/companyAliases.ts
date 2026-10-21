/**
 * Other names for listed companies — "Google" for Alphabet, "Facebook" for Meta, "P&G" — from
 * Wikidata, held as a committed index the way the EDGAR ticker index is (NC-004). `npm run
 * sync:aliases` builds `data/company-aliases.json` with `buildCompanyAliases`; the company name
 * rungs in `lib/sec.ts` read it, so a search finds a company by a name its EDGAR title does not
 * carry before the site holds it.
 *
 * Neither source alone had the two names that mattered. Alphabet's EDGAR record has no former
 * names, and its Wikidata item no "Google" alias: Google is a separate item, Google Inc., an SEC
 * registrant of its own (CIK 1288776) and now Alphabet's subsidiary. Meta's item has no English
 * alias at all; "Facebook, Inc." is its former *official name*. So three kinds of name are read:
 *
 * - a listed company's own Wikidata label and official names (current and former);
 * - its Wikidata aliases, which are looser and are kept only when related (`related`);
 * - the names of a **former SEC registrant whose parent is now a listed company** — Google Inc.,
 *   Sun Microsystems, Red Hat, Whole Foods Market — which a person still types for the parent.
 *
 * Wikidata's "owned by", "parent of a product" and "manufacturer" links are not read: measured
 * 2026-10-21 they map zinc and chromium to Pfizer, the Titanic to Carnival, the Empire State
 * Building to its REIT and Suzuki to JPMorgan, as a shareholder. A former registrant is a company
 * by construction — it filed with the SEC — and that is the line.
 */

/** A name with punctuation folded and word breaks kept: "BlackRock, Inc." → "BLACKROCK INC". */
export const nameKey = (s: string): string =>
  s.toUpperCase().replace(/['’]/g, "").replace(/[^A-Z0-9&]+/g, " ").trim();

/** One Wikidata item's names and where they point. */
export interface WikidataCompany {
  qid: string;
  /** the listed company these names find */
  targetCik: number;
  /** "own" — the listed company's item; "former" — a former registrant now under it */
  kind: "own" | "former";
  labels: string[];
  officialNames: string[];
  aliases: string[];
  /** how many Wikipedias have an article on the item: a measure of how well known it is */
  sitelinks: number;
  /** the tickers the item traded under, from Wikidata — read for a former registrant only */
  tickers?: string[];
}

/**
 * Where a name came from: one of the company's own names, current or former ("name"); a looser
 * Wikidata alias ("alias"); or a former registrant now under it ("former").
 */
export type AliasKind = "name" | "alias" | "former";

/** name key → [listed company's CIK, the Wikidata item, where the name came from, 1 if news may use it] */
export type AliasEntry = [number, string, AliasKind, 0 | 1];

export interface AliasIndexFile {
  syncedOn: string;
  source: string;
  aliases: Record<string, AliasEntry>;
}

export type DropReason =
  | "qualified"
  | "web address"
  | "too short"
  | "digits"
  | "generic"
  | "unrelated"
  | "ambiguous"
  | "another company's name"
  | "redundant"
  | "known wrong"
  | "not this company"
  | "listed itself"
  | "little known";

/**
 * Wikidata statements known to be wrong, by item, with the evidence. Kept short on purpose: a
 * rule that drops a class of bad names belongs in `buildCompanyAliases`, not here.
 */
export const KNOWN_WRONG: Record<string, string> = {
  // Still lists AT&T as parent organization; WarnerMedia was spun off and merged into Warner
  // Bros. Discovery on 2022-04-08.
  Q191715: "WarnerMedia left AT&T in 2022",
};

/**
 * Items whose names still find the company in search but may not claim its news, because the
 * brand went elsewhere when the company kept the filings. Same rule as `KNOWN_WRONG`: a class of
 * cases belongs in `newsMay`, and only the exceptions here.
 */
export const KNOWN_NOT_NEWS: Record<string, string> = {
  // Motorola, Inc. renamed itself Motorola Solutions in 2011 and spun the phones off as Motorola
  // Mobility (Lenovo's since 2014): a "Motorola" headline since then is nearly always a phone.
  Q259011: "the Motorola brand went with Motorola Mobility in 2011",
};

/**
 * A one-word name means one company only when that company is well known: "Google" and "Aetna"
 * do, while Wikidata's "English" for a bank TriCo bought, or "Credible" for a Fox unit, are words
 * first. Measured by the Wikipedias with an article on the item; a two-letter ampersand name
 * ("P&G", "J&J") needs more, because "D&B" is Dun & Bradstreet to most people, not Dave &
 * Buster's, and Dun & Bradstreet is no longer listed to claim it.
 */
export const ONE_WORD_MIN_SITELINKS = 10;
export const TWO_LETTER_MIN_SITELINKS = 30;

/** Words that say nothing about which company is meant. */
const GENERIC = new Set(
  "THE A AN OF AND & INC INCORPORATED CORP CORPORATION CO COMPANY COMPANIES GROUP HOLDING HOLDINGS LTD LIMITED PLC LLC LP SA NV AG SE INTERNATIONAL INTL TRUST".split(
    " "
  )
);

const significant = (key: string): string[] => key.split(" ").filter((w) => w && !GENERIC.has(w));

/** The words an initialism skips: "INTERNATIONAL" is the I in IBM, so it is not one of them. */
const UNINITIALLED = new Set("THE A AN OF AND & INC INCORPORATED CORP CORPORATION CO COMPANY LTD LIMITED PLC LLC LP SA NV AG SE".split(" "));

/** "INTERNATIONAL BUSINESS MACHINES CORP" → "IBM"; "PROCTER & GAMBLE" → "PG". */
const initials = (key: string): string =>
  key
    .split(" ")
    .filter((w) => w && !UNINITIALLED.has(w))
    .map((w) => w[0])
    .join("");

/**
 * Whether a loose alias belongs to the names it sits beside: it shares a word with one of them
 * that says something ("Ford Motors" beside "Ford Motor Company"), or it is their initials
 * ("IBM", "P&G"). Wikidata's aliases also hold a P&G shampoo ("Rejoice"), nicknames ("Big G"),
 * misspellings ("Wallmart") and a merger partner ("Continental" for United Airlines); none of
 * those does either.
 */
function related(alias: string, names: string[]): boolean {
  const own = new Set(names.flatMap((n) => significant(nameKey(n))));
  const words = significant(nameKey(alias));
  if (words.some((w) => own.has(w))) return true;
  const letters = nameKey(alias).replace(/[^A-Z]/g, "");
  return names.some((n) => {
    const i = initials(nameKey(n));
    // two letters only with an ampersand ("P&G", "J&J"); "AA" and "CS" mean too many things
    return i.length >= 2 && letters === i && (i.length >= 3 || alias.includes("&"));
  });
}

/** Whether a one-word name belongs to an item too little known for the word to mean it. */
function obscure(name: string, sitelinks: number): DropReason | null {
  const key = nameKey(name);
  if (key.includes(" ")) return null;
  const letters = key.replace(/[^A-Z0-9]/g, "");
  const need = key.includes("&") && letters.length <= 2 ? TWO_LETTER_MIN_SITELINKS : ONE_WORD_MIN_SITELINKS;
  return sitelinks < need ? "little known" : null;
}

/** Why a name cannot be one, before it is compared with any other company's. */
function junk(name: string, beside: string[]): DropReason | null {
  if (/[()]/.test(name)) return "qualified"; // "Caterpillar Inc. (Peoria, IL)"
  if (/\bwww\b|\.(?:com|net|org|io|co)\b/i.test(name)) return "web address"; // "ibm.com"
  const key = nameKey(name);
  if (/\d/.test(key) && !beside.some((b) => /\d/.test(b))) return "digits"; // "18M" for IBM
  const compact = key.replace(/ /g, "");
  if (compact.length < 3) return "too short";
  const words = key.split(" ");
  if (words.length === 1 && compact.length < 4 && !key.includes("&")) return "too short"; // "Sun"
  if (!significant(key).length) return "generic";
  return null;
}

/** What the builder needs to know about the EDGAR index, without importing it. */
export interface EdgarIndexView {
  /** company CIK and title, in the SEC's order (roughly by size) */
  companies: [number, string][];
  /** the company name rungs without aliases */
  titleMatch: (name: string) => { cik: number; exact: boolean } | null;
  /** a title's everyday name — "Ingersoll Rand Inc." → "Ingersoll Rand" (`commonName`) */
  commonName: (title: string) => string;
  /** the tickers the index lists for a company */
  tickersOf: (cik: number) => string[];
}

/**
 * A one-word name finds news only when the word is the company's: a very well-known company
 * ("Google", "Facebook"), or a coined word with a capital inside it ("MicroStrategy",
 * "DowDuPont"). "Square" for Block and "Anthem" for Elevance are words first — searched for, they
 * would bring back every Times Square story and every national anthem.
 */
export const NEWS_ONE_WORD_MIN_SITELINKS = 50;
const coined = (name: string) => /[a-z][A-Z]/.test(name) || /[\d&]/.test(name);

/**
 * Whether a name may find and score a company's news, not only resolve a search (batch 25).
 *
 * News is dated, and a name may only claim it when the company behind the name *is* this one:
 * - its own names, current and former — Meta's "Facebook, Inc." until 2021 is Meta's own
 *   history, so a 2018 Facebook headline belongs on META;
 * - a former registrant whose ticker carried on under the listed company — Google Inc.'s GOOG
 *   and GOOGL became Alphabet's in 2015, and Google's news from 2004 is Alphabet's history;
 * - never an acquired company's: Sun Microsystems' 1990s news is not Oracle's, nor Red Hat's
 *   IBM's (measured: the former registrants whose tickers carried on are Google, the American,
 *   United and Alaska airlines, US Foods, and three subsidiaries filed under their parent's
 *   ticker; every acquisition fails the test). Nor a looser alias, nor an item in
 *   `KNOWN_NOT_NEWS`.
 */
function newsMay(name: string, kind: AliasKind, item: WikidataCompany, carriedOn: boolean): boolean {
  if (kind === "alias" || (kind === "former" && !carriedOn) || KNOWN_NOT_NEWS[item.qid] !== undefined) return false;
  if (nameKey(name).includes(" ")) return true;
  return item.sitelinks >= NEWS_ONE_WORD_MIN_SITELINKS || coined(name);
}

/**
 * The alias index from Wikidata's names, against the EDGAR index it must agree with.
 *
 * - **The item must be the company.** A listed company's own item is trusted only when one of
 *   its names is related to the EDGAR title — any of them, since a renamed company's label is often
 *   the old name ("Coach" for Tapestry, "Parametric Technology" for PTC). One item carrying
 *   Snowflake's CIK was named only "Castor Maritime", and would have sent Castor's searches there.
 * - **Another company's name stays its own.** A name that is another listed company's exact title,
 *   or its everyday name, is dropped: Trane's former name "Ingersoll-Rand" is today's Ingersoll
 *   Rand Inc. A former registrant named like a listed company *is* that company, so none of its
 *   names are borrowed: Wikidata still has SeaWorld's "United Parks & Resorts" under Blackstone,
 *   which sold it in 2017, and it is listed in its own right.
 * - **A whole name beats part of one only for the larger company.** A name that already finds a
 *   different company by title prefix is kept only when its own company comes first in the SEC's
 *   order: "J&J" is Johnson & Johnson rather than J&J Snack Foods, while "United", "Constellation"
 *   and "Prudential" keep the larger company the prefix finds. The kept ones are returned in
 *   `overrides`, so a sync can be read before it is committed.
 * - A name that already finds its own company is redundant — unless news may use it and it is not
 *   the name the feeds are already asked for — and one claimed for two companies is nobody's.
 */
export function buildCompanyAliases(
  items: WikidataCompany[],
  index: EdgarIndexView
): {
  aliases: Record<string, AliasEntry>;
  dropped: { name: string; qid: string; reason: DropReason }[];
  overrides: { key: string; to: number; prefixHit: number }[];
} {
  const titleOf = new Map<number, string>();
  const order = new Map<number, number>();
  const everyday = new Map<string, number>();
  index.companies.forEach(([cik, title], i) => {
    if (!titleOf.has(cik)) titleOf.set(cik, title);
    if (!order.has(cik)) order.set(cik, i);
    for (const k of [nameKey(title), nameKey(index.commonName(title))]) if (!everyday.has(k)) everyday.set(k, cik);
  });

  const dropped: { name: string; qid: string; reason: DropReason }[] = [];
  type Claim = { qid: string; kind: AliasKind; news: boolean };
  const claims = new Map<string, Map<number, Claim>>();
  const rank: Record<AliasKind, number> = { name: 0, former: 1, alias: 2 };
  for (const item of items) {
    const names = [...item.labels, ...item.officialNames];
    const all = [...names, ...item.aliases];
    const title = titleOf.get(item.targetCik) ?? "";
    const listedAs = (n: string) => everyday.get(nameKey(index.commonName(n))) ?? everyday.get(nameKey(n));
    const why =
      KNOWN_WRONG[item.qid] !== undefined
        ? "known wrong"
        : item.kind === "own" && !all.some((n) => related(n, [title]))
          ? "not this company"
          : item.kind === "former" && names.some((n) => (listedAs(n) ?? item.targetCik) !== item.targetCik)
            ? "listed itself"
            : null;
    if (why) {
      for (const n of all) dropped.push({ name: n, qid: item.qid, reason: why });
      continue;
    }
    // Each name and its everyday form: Meta's former official name is "Facebook, Inc.", and
    // what people type is "Facebook".
    const everydayToo = (list: string[]) => [...new Set(list.flatMap((n) => [n, index.commonName(n)]))];
    const candidates = [
      ...everydayToo(names).map((n) => ({ n, loose: false })),
      ...everydayToo(item.aliases).map((n) => ({ n, loose: true })),
    ];
    const tickers = new Set(index.tickersOf(item.targetCik).map((t) => t.toUpperCase()));
    const carriedOn = (item.tickers ?? []).some((t) => tickers.has(t.toUpperCase()));
    for (const { n, loose } of candidates) {
      const reason =
        junk(n, [...names, title]) ?? (loose && !related(n, [...names, title]) ? "unrelated" : null) ?? obscure(n, item.sitelinks);
      if (reason) {
        dropped.push({ name: n, qid: item.qid, reason });
        continue;
      }
      const key = nameKey(n);
      const kind: AliasKind = item.kind === "former" ? "former" : loose ? "alias" : "name";
      const claim: Claim = { qid: item.qid, kind, news: newsMay(n, kind, item, carriedOn) };
      const byCik = claims.get(key) ?? new Map<number, Claim>();
      const had = byCik.get(item.targetCik);
      byCik.set(
        item.targetCik,
        had ? { ...(rank[had.kind] <= rank[kind] ? had : claim), news: had.news || claim.news } : claim
      );
      claims.set(key, byCik);
    }
  }

  const aliases: Record<string, AliasEntry> = {};
  const overrides: { key: string; to: number; prefixHit: number }[] = [];
  for (const key of [...claims.keys()].sort()) {
    const byCik = claims.get(key)!;
    const [[cik, { qid, kind, news }]] = [...byCik];
    const drop = (reason: DropReason) => dropped.push({ name: key, qid, reason });
    if (byCik.size > 1) {
      drop("ambiguous");
      continue;
    }
    const hit = index.titleMatch(key);
    if (hit?.cik === cik) {
      // Search already finds the company by this name, but news may still need it: Wikidata's
      // "American Airlines" is what headlines say, and the feeds are asked for the everyday form
      // of the title, "American Airlines Group". Kept for news only when it does not contain
      // that form — a longer name finds nothing the feed's own query does not.
      const title = titleOf.get(cik) ?? "";
      const asked = nameKey(index.commonName(title));
      // "Oracle Corporation" adds nothing to a feed already asked for "Oracle"
      if (!news || hit.exact || ` ${key} `.includes(` ${asked} `)) {
        drop("redundant");
        continue;
      }
    }
    const owner = everyday.get(key);
    if (hit?.exact || (owner !== undefined && owner !== cik)) {
      drop("another company's name");
      continue;
    }
    if (hit && hit.cik !== cik) {
      if ((order.get(cik) ?? Infinity) > (order.get(hit.cik) ?? Infinity)) {
        drop("ambiguous");
        continue;
      }
      overrides.push({ key, to: cik, prefixHit: hit.cik });
    }
    aliases[key] = [cik, qid, kind, news ? 1 : 0];
  }
  return { aliases, dropped, overrides };
}
