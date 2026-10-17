/**
 * What a backup held, so a restore can be checked against it (NC-152).
 *
 * The backup printed these counts to the terminal and nowhere else, so a rehearsal could say a
 * dump restored without being able to say it restored *everything*. Now the backup writes them
 * beside the dump and the rehearsal compares.
 */
export interface TableCounts {
  subjects: number;
  events: number;
  attestations: number;
  links: number;
  scored: number;
  prices: number;
}

export const COUNTS_SQL = `
  SELECT (SELECT count(*) FROM subjects)           AS subjects,
         (SELECT count(*) FROM events)             AS events,
         (SELECT count(*) FROM event_attestations) AS attestations,
         (SELECT count(*) FROM event_subjects)     AS links,
         (SELECT count(*) FROM event_subjects WHERE relevance IS NOT NULL) AS scored,
         (SELECT count(*) FROM prices)             AS prices`;

export function countsFromRow(r: Record<string, unknown>): TableCounts {
  return {
    subjects: Number(r.subjects),
    events: Number(r.events),
    attestations: Number(r.attestations),
    links: Number(r.links),
    scored: Number(r.scored),
    prices: Number(r.prices),
  };
}

export function formatCounts(c: TableCounts): string {
  return `${c.subjects} subjects, ${c.events} events, ${c.attestations} attestations, ${c.links} links (${c.scored} scored), ${c.prices} prices`;
}

/** The sidecar a dump's counts live in. */
export const countsFileFor = (dumpFile: string): string => `${dumpFile}.counts.json`;

/** Every table whose restored count differs from what the backup captured. */
export function countMismatches(expected: TableCounts, actual: TableCounts): string[] {
  return (Object.keys(expected) as (keyof TableCounts)[])
    .filter((k) => expected[k] !== actual[k])
    .map((k) => `${k}: backed up ${expected[k]}, restored ${actual[k]}`);
}

/**
 * Whether two connection strings point at the same database.
 *
 * Host names are compared as written, with `localhost` and `127.0.0.1` treated as one — the
 * mistake this guards against is pointing the rehearsal at the live database by a second spelling.
 */
export function sameDatabase(a: string, b: string): boolean {
  const norm = (u: string) => {
    const x = new URL(u);
    const host = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(x.hostname) ? "localhost" : x.hostname.toLowerCase();
    return `${host}:${x.port || "5432"}/${decodeURIComponent(x.pathname.slice(1))}`;
  };
  return norm(a) === norm(b);
}
