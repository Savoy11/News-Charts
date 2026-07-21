import { FetchResult, TimelineEvent } from "./types";

interface FrDocument {
  document_number: string;
  title: string;
  publication_date: string; // YYYY-MM-DD
  type: string; // "Rule" | "Proposed Rule" | "Notice" | "Presidential Document"
  html_url: string;
  agencies?: { name?: string }[];
}

/**
 * Rules, proposed rules and notices from the Federal Register — the events that hit a
 * whole industry rather than one company. Public domain, no key, generous limits.
 *
 * These attach to an *industry* subject: an export-control rule is not an Nvidia event,
 * it is a semiconductor event that happens to matter to Nvidia.
 */
export async function fetchRegulations(term: string, since = "2015-01-01"): Promise<FetchResult> {
  const params = new URLSearchParams({
    per_page: "60",
    order: "newest",
    "conditions[term]": term,
    "conditions[publication_date][gte]": since,
  });
  for (const f of ["document_number", "title", "publication_date", "type", "html_url", "agencies"]) {
    params.append("fields[]", f);
  }
  const url = `https://www.federalregister.gov/api/v1/documents.json?${params}`;

  try {
    const res = await fetch(url, { next: { revalidate: 21600 } });
    if (res.status === 429 || res.status === 503) {
      return { events: [], outcome: "throttled", httpStatus: res.status };
    }
    if (!res.ok) return { events: [], outcome: "error", httpStatus: res.status };

    const json = await res.json();
    const docs: FrDocument[] = json?.results ?? [];
    const events: TimelineEvent[] = [];

    for (const d of docs) {
      if (!d.document_number || !/^\d{4}-\d{2}-\d{2}$/.test(d.publication_date ?? "")) continue;
      const agency = d.agencies?.[0]?.name;
      events.push({
        id: `fr-${d.document_number}`,
        date: d.publication_date,
        type: "regulation",
        title: d.title.replace(/\s+/g, " ").trim(),
        // the issuing agency is the useful attribution, not the publication
        source: agency ? `Federal Register · ${agency}` : "Federal Register",
        url: d.html_url,
        description: d.type,
        sourceKey: "federal_register",
        // the document number is already globally unique and stable
        externalId: d.document_number,
        dedupBasis: `fr:${d.document_number}`,
      });
    }
    return { events, outcome: events.length ? "ok" : "empty", httpStatus: 200 };
  } catch (err) {
    return { events: [], outcome: "error", detail: String(err).slice(0, 200) };
  }
}

/**
 * What to search the Federal Register for on behalf of an industry. A stored alias wins;
 * otherwise fall back to the leading word of EDGAR's own label, which is the part that
 * names the thing ("Semiconductors & Related Devices" → "semiconductors").
 */
export function regulationQueryFor(displayName: string, aliases: string[]): string {
  const alias = aliases.find((a) => a.trim().length > 2);
  if (alias) return alias.trim();
  return displayName.split(/[&,]/)[0].trim().split(/\s+/)[0].toLowerCase();
}
