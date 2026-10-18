import { commonName } from "./sec";

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

const words = (s: string) =>
  ` ${s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim()} `;

/**
 * Whether a title names the company — its everyday name, whole, as a phrase. The everyday name
 * keeps "Motor" in "Ford Motor", so a Gerald R. Ford presidential library notice is not Ford's;
 * whole words keep "Apples From Chile" from being Apple's.
 */
export function titleNamesCompany(title: string, edgarName: string): boolean {
  const name = words(commonName(edgarName)).trim();
  return name.length >= 2 && words(title).includes(` ${name} `);
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

export function tallyCompanyMentions(hits: FrHit[], edgarName: string): CompanyMentions {
  const named = hits.filter((h) => titleNamesCompany(h.title, edgarName));
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

/** The Federal Register's full-text hits for a company's everyday name, as a phrase. */
export async function fetchCompanyMentions(
  edgarName: string,
  since: string
): Promise<{ hits: FrHit[]; total: number } | { error: string }> {
  const params = new URLSearchParams({
    per_page: "1000",
    order: "newest",
    "conditions[term]": `"${commonName(edgarName)}"`,
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
