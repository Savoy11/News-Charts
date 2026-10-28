import { foldAccents } from "./fold";
import { commonName, listedNamesContaining } from "./sec";
import type { FetchResult, TimelineEvent } from "./types";

/**
 * Federal Register documents that name a company in their title — measured before anything is
 * ingested (2026-10-17 proposal 4).
 *
 * The adapter runs for sectors only. A document whose *title* names the company — an ITC case, an
 * FTC or SEC order, an export listing, a utility order — is that company's event, not its
 * sector's. The owner chose numbers first (2026-10-18): airworthiness directives alone could run
 * to hundreds a year for one plane maker, and how to treat them waits on how many there are. This
 * module is the measurement; `npm run fr-company-report` prints it.
 */

export interface FrAgency {
  name?: string;
  /** the department a sub-agency sits in: the Surface Transportation Board's is Transportation */
  parent_id?: number | null;
}

export interface FrHit {
  title: string;
  publication_date: string;
  type?: string;
  agencies?: FrAgency[];
}

/**
 * The agency that issued a document: the sub-agency, not its department. The API lists the
 * department first, so the label read "Transportation Department" for a Surface Transportation
 * Board notice and "Energy Department" for a FERC one — and which board it was is what says a
 * notice is routine (batch 63). FERC carries its department as a parent; the Surface
 * Transportation Board, an independent board listed after the department, does not (measured
 * 2026-10-27), so an agency after a department is the issuer too. A document several independent
 * agencies issued together keeps the first.
 */
export function issuingAgency(agencies: FrAgency[] | undefined): string | undefined {
  const named = (agencies ?? []).filter((a) => a?.name);
  const sub = named.find((a) => a.parent_id != null);
  if (sub) return sub.name;
  return (named.length > 1 && / Department$/.test(named[0].name!) ? named[1] : named[0])?.name;
}

// apostrophes go, as the alias index's keys drop them: "Angie's List" reads "angies list"
const words = (s: string) =>
  ` ${foldAccents(s).toLowerCase().replace(/['’]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim()} `;

/** Words that mark a name as a company's in a title: "Apple Inc.", "Intel Foundry Corporation". */
const CORPORATE = new Set([
  "inc", "incorporated", "corp", "corporation", "company", "co", "llc", "ltd", "limited", "plc",
  "holdings", "holding", "group", "lp", "sa", "nv", "ag", "se", "asa", "ab", "oyj", "tbk", "sab", "spa",
]);

/**
 * The legal forms `words` splits into letters: "Embraer S.A." reads "embraer s a". Batch 26 took
 * these off the everyday name, which left "EMBRAER" one word, and a one-word name must be followed
 * by a company word — so its own "Embraer S.A." documents stopped matching (22 → 2 live, batch 28).
 */
const SPELLED_FORMS = [["s", "a"], ["n", "v"], ["a", "s"], ["a", "g"], ["l", "p"], ["s", "p", "a"], ["s", "a", "b"]];

/** Whether a company word, or a spelled-out legal form, starts at `tokens[j]`. */
const companyWordAt = (tokens: string[], j: number): boolean =>
  CORPORATE.has(tokens[j]) || SPELLED_FORMS.some((form) => form.every((w, k) => tokens[j + k] === w));

/**
 * The names a company's documents are searched and matched under: its everyday name, then its own
 * other names (`newsNamesFor` — "google" for Alphabet, "goldman sachs" for Goldman Sachs Group,
 * never an acquired company's), each once.
 */
export function companyNames(edgarName: string, alsoKnownAs: readonly string[] = []): string[] {
  // a leading "the" is the article, not part of the name: "the Hartford Core Bond ETF" (batch 28)
  const names = [commonName(edgarName).replace(/^the\s+/i, "")];
  for (const raw of alsoKnownAs) {
    const n = raw.replace(/^the\s+/i, "");
    if (!names.some((m) => words(m) === words(n))) names.push(n);
  }
  return names;
}

/**
 * One full-text search for all of them. The API ORs quoted phrases joined by "|" — measured
 * 2026-10-21: "Alphabet" 98 documents, "Google LLC" 111, the two together 197 — while a written
 * "OR" is just another word to match (12).
 */
export const frSearchTerm = (edgarName: string, alsoKnownAs: string[] = []): string =>
  companyNames(edgarName, alsoKnownAs)
    // an other name under five characters stays out of the search, though it still names the
    // company in a title: "UPS" is in 2,031 documents since 2015, "United Parcel Service" in 374,
    // and the feed reads the newest 1,000 (batch 34)
    .filter((n, i) => i === 0 || n.length >= 5)
    .flatMap((n) => [...new Set([n, joinInitials(n)])])
    .map((n) => `"${n}"`)
    .join(" | ");

/**
 * Initials as federal documents write them: Wikidata's "J. B. Hunt" is "J.B. Hunt" there, and the
 * search treats the two apart — measured 2026-10-22: "J. B. Hunt" 6 documents, "J.B. Hunt" 13;
 * "D. R. Horton" 0, "D.R. Horton" 4 (batch 28).
 */
const joinInitials = (n: string): string => n.replace(/\b([A-Z])\.\s+(?=[A-Z]\.)/g, "$1.");

/**
 * Whether a title names the company — its everyday name or one of its own other names, whole, as a
 * phrase: Google's FTC orders say "Google LLC", never "Alphabet" (batch 27). The everyday name
 * keeps "Motor" in "Ford Motor", so a Gerald R. Ford presidential library notice is not Ford's;
 * whole words keep "Apples From Chile" from being Apple's.
 *
 * Two rules from the owner's live count (2026-10-18), where Apple's 34 "naming" documents were
 * mostly fruit and GE's included "Portland General Electric":
 *  - **a one-word name needs a company word within three words after it** — "Apple Inc." is the
 *    company, "Light Brown Apple Moth" and "Apple Juice" are not;
 *  - **a longer listed company's name owns the mention** — a title carrying "Portland General
 *    Electric" is that utility's, not General Electric's, because both are in the EDGAR index.
 */
export function titleNamesCompany(title: string, edgarName: string, alsoKnownAs: string[] = []): boolean {
  const t = words(title);
  return companyNames(edgarName, alsoKnownAs).some((n, i) => phraseNamesCompany(t, words(n).trim(), i === 0 ? 3 : 1));
}

/**
 * The rules above, for one name against a title already in `words` form. A one-word other name
 * needs its company word straight after it ("Google LLC", "Facebook, Inc."): a famous brand also
 * starts other companies' names, and measured 2026-10-21 the three-word window let in "Amazon
 * Produce Network, LLC", a produce firm, and "Toyota Material Handling, Inc.", a Toyota Industries
 * unit. The company's own documents still match under its everyday name ("Amazon.com Services
 * LLC" carries "AMAZON COM").
 */
function phraseNamesCompany(t: string, name: string, within: number): boolean {
  if (name.length < 2 || !t.includes(` ${name} `)) return false;
  if (!name.includes(" ")) {
    const tokens = t.trim().split(" ");
    const corporate = tokens.some((tok, i) => {
      if (tok !== name) return false;
      for (let j = i + 1; j <= i + within && j < tokens.length; j++) if (companyWordAt(tokens, j)) return true;
      return false;
    });
    if (!corporate) return false;
  }
  return !listedNamesContaining(name).some((longer) => t.includes(` ${longer} `));
}

/**
 * Whether the title carries a longer listed company's name that contains this one — "Portland
 * General Electric" for "General Electric" — so the mention is that company's (the second rule
 * above, for callers holding a raw title and name; batch 32's Justice Department releases).
 */
export function longerListedNameIn(title: string, name: string): boolean {
  const t = words(title);
  return listedNamesContaining(words(name).trim()).some((longer) => t.includes(` ${longer} `));
}

/** Airworthiness directives — the one class the owner has to rule on, so counted on its own. */
export const isAirworthinessDirective = (title: string) => /^airworthiness directives?\b/i.test(title.trim());

export interface CompanyMentions {
  /** documents the full-text search returned */
  searched: number;
  /** of those, documents whose title names the company — what a company feed would keep */
  named: number;
  airworthiness: number;
  /** most first */
  byAgency: [agency: string, count: number][];
  byYear: [year: string, count: number][];
  /** the newest few titles kept, to read what the count is made of */
  examples: string[];
}

export function tallyCompanyMentions(hits: FrHit[], edgarName: string, alsoKnownAs: string[] = []): CompanyMentions {
  const named = hits.filter((h) => titleNamesCompany(h.title, edgarName, alsoKnownAs));
  const count = (key: (h: FrHit) => string) => {
    const m = new Map<string, number>();
    for (const h of named) m.set(key(h), (m.get(key(h)) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  };
  return {
    searched: hits.length,
    named: named.length,
    airworthiness: named.filter((h) => isAirworthinessDirective(h.title)).length,
    byAgency: count((h) => h.agencies?.[0]?.name ?? "unknown agency"),
    byYear: count((h) => h.publication_date.slice(0, 4)).sort((a, b) => b[0].localeCompare(a[0])),
    examples: [...named]
      .sort((a, b) => b.publication_date.localeCompare(a.publication_date))
      .slice(0, 5)
      .map((h) => `${h.publication_date}  ${h.title.replace(/\s+/g, " ").slice(0, 110)}`),
  };
}

/** The Federal Register's full-text hits for a company's names, each as a phrase. */
export async function fetchCompanyMentions(
  edgarName: string,
  since: string,
  alsoKnownAs: string[] = []
): Promise<{ hits: FrHit[]; total: number } | { error: string }> {
  const params = new URLSearchParams({
    per_page: "1000",
    order: "newest",
    "conditions[term]": frSearchTerm(edgarName, alsoKnownAs),
    "conditions[publication_date][gte]": since,
  });
  for (const f of ["title", "publication_date", "type", "agencies"]) params.append("fields[]", f);
  try {
    const res = await fetch(`https://www.federalregister.gov/api/v1/documents.json?${params}`);
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const json = await res.json();
    return { hits: json?.results ?? [], total: Number(json?.count ?? 0) };
  } catch (err) {
    return { error: String(err).slice(0, 160) };
  }
}

/** At most this many documents a daily ask, newest first — a ceiling, not a target. */
export const FR_COMPANY_CAP = 40;

/**
 * How far back a company's documents reach: 1994, where the Federal Register's API begins. The
 * feed stopped at 2015, "a choice, not a limit" (docs/COVERAGE-MAP.md), and in the years the corpus
 * is thinnest (batch 63).
 */
export const FR_COMPANY_FROM = "1994-01-01";

/**
 * The daily ask reads the current year only: each year before it is read once, in full, by the
 * year walk (`lib/ingest/frBackfill.ts`). Asked from 2015 for the newest forty, every run read the
 * same forty, so a company's forty-first-newest document never reached its page.
 */
export const frDailySince = (today = new Date()): string => `${today.getUTCFullYear()}-01-01`;

/** A year the walk reads is this many pages of a thousand at most: Duke Energy's busiest was 224 hits. */
export const FR_YEAR_PAGES = 10;

interface FrDocument extends FrHit {
  document_number: string;
  html_url: string;
}

const FIELDS = ["document_number", "title", "publication_date", "type", "html_url", "agencies"];

/** One page of the full-text search for a company's names, between two days. */
function searchUrl(term: string, since: string, until: string | null, page = 1): string {
  const params = new URLSearchParams({
    per_page: "1000",
    order: "newest",
    "conditions[term]": term,
    "conditions[publication_date][gte]": since,
  });
  if (until) params.set("conditions[publication_date][lte]", until);
  if (page > 1) params.set("page", String(page));
  for (const f of FIELDS) params.append("fields[]", f);
  return `https://www.federalregister.gov/api/v1/documents.json?${params}`;
}

/**
 * A company's own documents among the hits, as timeline events: kept only when the title names it
 * (`titleNamesCompany`) and never airworthiness directives — the owner's rule from the live count,
 * where they were 539 of Boeing's 596.
 *
 * Same identity as the sector feed (`fr:<document number>`), so a document that is both a sector
 * rule and this company's is one event linked to both subjects, not two.
 */
function companyEvents(docs: FrDocument[], edgarName: string, alsoKnownAs: string[]): TimelineEvent[] {
  return docs
    .filter(
      (d) =>
        d.document_number &&
        /^\d{4}-\d{2}-\d{2}$/.test(d.publication_date ?? "") &&
        titleNamesCompany(d.title, edgarName, alsoKnownAs) &&
        !isAirworthinessDirective(d.title)
    )
    .map((d) => {
      const agency = issuingAgency(d.agencies);
      return {
        id: `fr-${d.document_number}`,
        date: d.publication_date,
        type: "regulation" as const,
        title: d.title.replace(/\s+/g, " ").trim(),
        source: agency ? `Federal Register · ${agency}` : "Federal Register",
        url: d.html_url,
        description: d.type,
        sourceKey: "federal_register" as const,
        externalId: d.document_number,
        dedupBasis: `fr:${d.document_number}`,
      };
    });
}

/**
 * The company's own Federal Register documents since a day, newest first, at most
 * `FR_COMPANY_CAP` of them: the daily ask, for the current year.
 */
export async function fetchCompanyRegulations(
  edgarName: string,
  since = frDailySince(),
  alsoKnownAs: string[] = []
): Promise<FetchResult> {
  try {
    const res = await fetch(searchUrl(frSearchTerm(edgarName, alsoKnownAs), since, null), {
      next: { revalidate: 21600 },
    });
    if (res.status === 429 || res.status === 503) return { events: [], outcome: "throttled", httpStatus: res.status };
    if (!res.ok) return { events: [], outcome: "error", httpStatus: res.status };
    const docs: FrDocument[] = (await res.json())?.results ?? [];
    const events = companyEvents(docs, edgarName, alsoKnownAs).slice(0, FR_COMPANY_CAP);
    return { events, outcome: events.length ? "ok" : "empty", httpStatus: 200 };
  } catch (err) {
    return { events: [], outcome: "error", detail: String(err).slice(0, 200) };
  }
}

export interface YearResult extends FetchResult {
  /** the hits the search counted for the year, the company's or not */
  documents: number;
}

/**
 * Every one of the company's documents in a year that is over, each page of the search read, none
 * left out by a cap: the year walk's ask (batch 63). `alsoKnownAs` carries the year's own names —
 * its other names, and an EDGAR former name still in use that year.
 */
export async function fetchCompanyYear(edgarName: string, year: number, alsoKnownAs: string[] = []): Promise<YearResult> {
  const term = frSearchTerm(edgarName, alsoKnownAs);
  const docs: FrDocument[] = [];
  let documents = 0;
  try {
    for (let page = 1; page <= FR_YEAR_PAGES; page++) {
      const res = await fetch(searchUrl(term, `${year}-01-01`, `${year}-12-31`, page));
      if (res.status === 429 || res.status === 503) return { events: [], documents, outcome: "throttled", httpStatus: res.status };
      if (!res.ok) return { events: [], documents, outcome: "error", httpStatus: res.status };
      const json = await res.json();
      documents = Number(json?.count ?? 0);
      docs.push(...(json?.results ?? []));
      if (!json?.next_page_url) break;
    }
  } catch (err) {
    return { events: [], documents, outcome: "error", detail: String(err).slice(0, 200) };
  }
  const events = companyEvents(docs, edgarName, alsoKnownAs);
  return { events, documents, outcome: events.length ? "ok" : "empty", httpStatus: 200 };
}

/**
 * The agencies whose notices naming a company are mostly routine paperwork: a railroad's
 * trackage-rights and abandonment exemptions before the Surface Transportation Board (and the
 * Interstate Commerce Commission before it), a utility's FERC filings and NRC licence notices.
 * Measured 2026-10-27 over 1994–2025: 1,203 of Union Pacific's and CSX's 1,340 documents came from
 * the two rail boards, 579 of Duke Energy's 614 from FERC and the NRC.
 */
export const ROUTINE_AGENCIES = [
  "Surface Transportation Board",
  "Interstate Commerce Commission",
  "Federal Energy Regulatory Commission",
  "Nuclear Regulatory Commission",
];

/**
 * A notice from those agencies that is not routine: a merger or control case, a complaint, an
 * order, a penalty, a settlement, a petition. "Union Pacific Corporation…—Control—Norfolk
 * Southern" and "Intermountain Power Agency v. Union Pacific" keep their own dated rows.
 */
const NOT_ROUTINE =
  /\b(?:complaint|v\.|vs\.|versus|order imposing|order modifying|confirmatory order|civil (?:monetary )?penalt|violation|merger|control\b|investigation|show cause|settlement|declaratory order|petition|enforcement)/i;
/**
 * The 1990s titles run words together where the dash was: "…Norfolk Southern Railway
 * CompanyControl and Operating Leases/Agreements Conrail Inc." (CSX, 1997). Read apart, so the
 * control case keeps its rows (batch 71: eight of its nineteen notices had been grouped).
 */
const wordsApart = (title: string) => title.replace(/([a-z.,])([A-Z])/g, "$1 $2");

const AGENCY_LABEL = /^Federal Register · (.+)$/;

/**
 * Whether a stored company row is one of those routine notices, and whose. A notice, or a document
 * the Federal Register left uncategorized, as it did 25 of CSX's 1994–95 ICC notices; never a rule.
 */
export function routineNoticeAgency(e: TimelineEvent): string | null {
  if (e.type !== "regulation" || (e.description !== "Notice" && e.description !== "Uncategorized Document")) return null;
  const agency = AGENCY_LABEL.exec(e.source)?.[1];
  return agency && ROUTINE_AGENCIES.includes(agency) && !NOT_ROUTINE.test(wordsApart(e.title)) ? agency : null;
}

/**
 * A company page's Federal Register rows, as the page should carry them (batch 63). The owner's
 * call, 2026-10-26: routine notices are grouped, one row a month. A month with two or more of one
 * agency's routine notices becomes one month-precision row naming how many, its description
 * listing the first few and its link the newest; a lone notice keeps its dated row. Done when the
 * page is read, as prospectuses are (`pageFilings`), so what is stored is covered and the
 * database keeps each notice.
 */
export function pageRegulations(events: TimelineEvent[]): TimelineEvent[] {
  const months = new Map<string, TimelineEvent[]>();
  const kept: TimelineEvent[] = [];
  for (const e of events) {
    const agency = routineNoticeAgency(e);
    if (!agency) {
      kept.push(e);
      continue;
    }
    const key = `${agency}|${e.date.slice(0, 7)}`;
    months.set(key, [...(months.get(key) ?? []), e]);
  }
  for (const [key, rows] of months) {
    if (rows.length < 2) {
      kept.push(...rows);
      continue;
    }
    const [agency, month] = key.split("|");
    const newest = [...rows].sort((a, b) => b.date.localeCompare(a.date))[0];
    const listed = rows.slice(0, 3).map((r) => `"${r.title}"`).join("; ");
    kept.push({
      id: `fr-routine-${agency.toLowerCase().replace(/[^a-z]+/g, "-")}-${month}`,
      date: `${month}-01`,
      precision: "month",
      type: "regulation",
      title: `${agency}: ${rows.length} routine notices`,
      source: `Federal Register · ${agency}`,
      url: newest.url,
      description:
        `${rows.length} routine ${agency} notices this month, grouped into one row: ${listed}` +
        (rows.length > 3 ? `, and ${rows.length - 3} more` : "") +
        ". The link opens the newest.",
    });
  }
  return kept.sort((a, b) => a.date.localeCompare(b.date));
}
