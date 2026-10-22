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

export interface FrHit {
  title: string;
  publication_date: string;
  type?: string;
  agencies?: { name?: string }[];
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

/** At most this many documents a run, newest first — a ceiling, not a target. */
export const FR_COMPANY_CAP = 40;

/** How far back the company feed reaches, matching the sector feed's default. */
export const FR_COMPANY_SINCE = "2015-01-01";

interface FrDocument extends FrHit {
  document_number: string;
  html_url: string;
}

/**
 * The company's own Federal Register documents, as timeline events: full-text hits for its
 * names, kept only when the title names it (`titleNamesCompany`) and never airworthiness
 * directives — the owner's rule from the live count, where they were 539 of Boeing's 596.
 *
 * Same identity as the sector feed (`fr:<document number>`), so a document that is both a sector
 * rule and this company's is one event linked to both subjects, not two.
 */
export async function fetchCompanyRegulations(
  edgarName: string,
  since = FR_COMPANY_SINCE,
  alsoKnownAs: string[] = []
): Promise<FetchResult> {
  const params = new URLSearchParams({
    per_page: "1000",
    order: "newest",
    "conditions[term]": frSearchTerm(edgarName, alsoKnownAs),
    "conditions[publication_date][gte]": since,
  });
  for (const f of ["document_number", "title", "publication_date", "type", "html_url", "agencies"]) {
    params.append("fields[]", f);
  }
  try {
    const res = await fetch(`https://www.federalregister.gov/api/v1/documents.json?${params}`, {
      next: { revalidate: 21600 },
    });
    if (res.status === 429 || res.status === 503) return { events: [], outcome: "throttled", httpStatus: res.status };
    if (!res.ok) return { events: [], outcome: "error", httpStatus: res.status };
    const docs: FrDocument[] = (await res.json())?.results ?? [];
    const events: TimelineEvent[] = docs
      .filter(
        (d) =>
          d.document_number &&
          /^\d{4}-\d{2}-\d{2}$/.test(d.publication_date ?? "") &&
          titleNamesCompany(d.title, edgarName, alsoKnownAs) &&
          !isAirworthinessDirective(d.title)
      )
      .slice(0, FR_COMPANY_CAP)
      .map((d) => {
        const agency = d.agencies?.[0]?.name;
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
    return { events, outcome: events.length ? "ok" : "empty", httpStatus: 200 };
  } catch (err) {
    return { events: [], outcome: "error", detail: String(err).slice(0, 200) };
  }
}
