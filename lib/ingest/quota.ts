import type { SourceKey } from "../types";
import { dailyRequestsPerSubject } from "./refresh";

/**
 * What each source's free tier actually allows, and whether scheduled ingest fits inside it.
 *
 * The refresh windows in `refresh.ts` were chosen against these numbers, but nothing checked the
 * arithmetic afterwards — and the arithmetic is the whole point. A feed that goes quiet because
 * its daily budget was spent by lunchtime does not look rate limited on a page; it looks like a
 * source with nothing to say. That failure is invisible precisely where it matters most, which
 * is why this is a report rather than a comment.
 *
 * The limits are documented free-tier figures. Where a source publishes no number, `perDay` is
 * null and the report says "no published limit" rather than inventing headroom.
 */

export interface Quota {
  /** requests per day on the free tier, or null when the source publishes no figure */
  perDay: number | null;
  /** requests per second, where the source enforces a burst limit as well */
  perSecond?: number;
  note: string;
}

export const QUOTAS: Record<SourceKey, Quota> = {
  // ---- keyed feeds, where the cap is small enough to hit in an afternoon ----
  gnews: { perDay: 100, note: "free tier, 100 req/day — the tightest budget here" },
  newsdata: { perDay: 200, note: "free tier, 200 req/day" },
  currents: { perDay: 250, note: "free plan, 250 requests a day resetting at 00:00 UTC (pricing page, 2026-11-26); one request a day a company, and ingest stops asking when the day's are spent" },
  marketaux: { perDay: 100, note: "free tier, 100 req/day" },
  eodhd: { perDay: 20, note: "free tier is ~20 API calls/day and may exclude news entirely" },
  finnhub: { perDay: null, perSecond: 1, note: "60 req/min rather than a daily cap" },
  nyt: { perDay: 500, perSecond: 0.2, note: "500 req/day and 5 req/min — the per-minute limit bites first" },
  guardian: { perDay: 5000, note: "free developer key, 5,000 req/day" },

  // ---- keyless, but not free of obligation ----
  gdelt: { perDay: null, perSecond: 0.2, note: "~1 req/5s per IP; throttling arrives as HTTP 200 with a text body" },
  wikipedia: { perDay: null, note: "no hard cap; the User-Agent policy is the real obligation" },
  loc_chronam: { perDay: null, note: "no published cap, but 503s under load are routine" },
  sec_edgar: { perDay: null, perSecond: 10, note: "10 req/s, and a contact User-Agent is required" },
  federal_register: { perDay: null, note: "no published cap; generous in practice" },
  fed_fomc: { perDay: null, note: "public pages, no published cap; one page a day, about 27 once for the history" },
  bls_cpi: { perDay: null, note: "public archive page, no published cap; one page a day" },
  nhtsa_recalls: { perDay: null, note: "open-data API, no published cap without an app token; one request a day per vehicle maker" },
  nhtsa_investigations: { perDay: null, note: "the same open-data API; one request a day per vehicle maker" },
  fed_enforcement: { perDay: null, note: "two public JSON files, no published cap; read once a process, whatever the number of banks" },
  doj_press: { perDay: null, note: "justice.gov's public API, no published cap; a page or two a day per company, 0.8s apart" },
  sec_press: { perDay: null, perSecond: 10, note: "the SEC newsroom's year listing, sec.gov's 10 req/s; each past year read once for every company (about 290 pages, 1s apart), then a page or two a day" },
  fed_press: { perDay: null, note: "one public JSON file of about 1 MB, no published cap; read once a process, whatever the number of companies" },
  cfpb: { perDay: null, note: "the Bureau's public action list, no published cap; every page once a month for every company (16 pages, 1s apart), and its newest page once a day" },
  epa_cases: { perDay: null, note: "EPA's public case file, one 82 MB zip, no key or published cap; read whole once a month for every company, and not again while EPA has not changed it" },
  cpsc_recalls: { perDay: null, note: "the CPSC's public recall service, no key or published cap; every recall in one 28 MB answer, read once a week for every company" },
  cftc: { perDay: null, note: "the CFTC's public enforcement list, no published cap; read whole once a year for every company (about 261 pages, 1s apart), and its newest page once a day" },
  eeoc_press: { perDay: null, note: "the EEOC's public newsroom listing, no key or published cap; read whole once a year for every company (318 pages on 2026-11-15, 1.3s apart), its newest page once a day, and an undated release's own page once, at most 60 a process" },
  occ_actions: { perDay: null, note: "the OCC's enforcement search API, no key or published cap; its count and every institution action in one answer of about 2 MB, read once a process, whatever the number of companies" },
  nlrb_decisions: { perDay: null, note: "the NLRB\'s public decision listing, no key; its policy asks bulk reads between 11 pm and 6 am Eastern and at most 5 requests at once or 20 per 200 ms: read whole once a year at night (667 pages), at most 300 pages a run, 3 s apart, resumed across runs and nights, a firewall refusal ending the night\'s reading; and its newest page once a day" },
  itc_337: { perDay: null, note: "the Federal Register API's list of the ITC's notices and govinfo's copy of each notice of institution and outcome, no key or published cap; read monthly by npm run sync:itc and committed, a notice the file holds never asked again; ingest asks nothing" },
  hsr_early: { perDay: null, note: "the Federal Register API's list of the FTC's notices and govinfo's copy of each, no key or published cap; read monthly by npm run sync:hsr and committed, a notice the file holds never asked again; ingest asks nothing" },
  dol_taa: { perDay: null, note: "the Labor Department's petition file, one keyless zip of about 48 MB on data.dol.gov, read once by npm run sync:taa and committed (no petition is decided after 2022-06-30); ingest asks nothing" },
  fda_approvals: { perDay: null, note: "the FDA's compilation of new-drug approvals, one workbook of about 300 KB read once a year by npm run sync:fda-approvals and committed; ingest asks nothing" },
  fda_clearances: { perDay: null, note: "openFDA's 510(k) file, one keyless zip of about 250 MB, streamed monthly by npm run sync:fda-clearances and committed; ingest asks nothing" },
  fed_h2: { perDay: null, note: "the Board's weekly H.2 release, one PDF a week read once by npm run sync:fed-h2 and committed; ingest asks nothing" },
  eu_mergers: { perDay: null, note: "the Publications Office's SPARQL list and CELLAR's notice texts, read monthly by npm run sync:eu-mergers and committed; ingest asks nothing" },
  supreme_court: { perDay: null, note: "govinfo's U.S. Reports records and the Court's slip lists, read monthly by npm run sync:supreme-court and committed; ingest asks nothing" },
  inst_13f: { perDay: null, note: "the SEC's Form 13F data sets, fails-to-deliver files and XBRL share-count frames, read monthly by npm run sync:13f and committed; ingest asks nothing" },
  insider_trades: { perDay: null, note: "the SEC's insider transactions data sets, a zip a quarter, read quarterly by npm run sync:insiders and committed; ingest asks nothing" },
  fund_nport: { perDay: null, note: "the SEC's Form N-PORT data sets, a zip a quarter, read quarterly by npm run sync:nport and committed; ingest asks nothing" },
  eu_courts: { perDay: null, note: "the Publications Office's SPARQL lists and CELLAR's judgment and notice texts, read monthly by npm run sync:eu-courts and committed; ingest asks nothing" },
  eu_antitrust: { perDay: null, note: "the Publications Office's SPARQL lists and CELLAR's decision texts, read monthly by npm run sync:eu-antitrust and committed; ingest asks nothing" },
  fda_history: { perDay: null, note: "openFDA's historical documents, one keyless zip of about 14 MB, read once by npm run sync:fda-history and committed (the file ends in 2014); ingest asks nothing" },
  fra_accidents: { perDay: null, note: "the same open-data API as NHTSA's recalls, no published cap without an app token; one request a day per railroad company" },
  msha_accidents: { perDay: null, note: "MSHA's open-data files, no key or published cap; the Accidents zip (52 MB) and the Mines zip (7 MB) read once a week for every company, and not again while MSHA has not changed them; the Inspections and Assessed Violations zips (74 MB and 110 MB) once a month, for MSHA's own finding on each death (batch 139)" },
  fda_warning_letters: { perDay: null, note: "the FDA's public warning-letter list, no key or published cap; read whole once a week for every company, 1,000 letters a request (four requests on 2026-11-11)" },
  fda_supplements: { perDay: null, note: "Drugs@FDA from openFDA's downloads, one zip of about 9 MB read monthly by npm run sync:fda-supplements and committed; ingest asks nothing" },
  sec_digest: { perDay: null, note: "the SEC News Digest's closed archive of 1956–1993 on www.sec.gov, no published cap past sec.gov's 10 req/s; each year's page and each issue's PDF read once for every company (38 pages and about 9,500 PDFs), at most 60 a run, 1s apart" },
  sec_cases: { perDay: null, perSecond: 10, note: "the SEC's litigation-release and administrative-proceeding year listings, sec.gov's 10 req/s; each past year of each read once for every company (342 pages for 1995–2026, and 86 more for the months that fill a year's repeated rows, 1s apart), then a page or two a day" },
  fda_device_recalls: { perDay: 1000, note: "openFDA without a key, as fda_enforcement: one or two requests a day per mapped company, and one a process for the reports' older events; each recall's page in the FDA's recall database read once and kept, at most 200 a process, 1.3 s apart (about 2,600 in all)" },
  fda_enforcement: { perDay: 1000, note: "openFDA without a key: 1,000 requests a day, 240 a minute; three to six a day per mapped company" },
  yahoo_finance: { perDay: null, note: "undocumented and unofficial; off the ingest path since batch 189, as Yahoo's terms keep its feeds off a page with advertising" },
  yahoo_prices: { perDay: null, note: "the same unofficial host as the RSS feed — the licence question, not the quota, is the risk" },
  internet_archive: { perDay: null, note: "no published cap; be a good citizen" },
  snapshot: { perDay: null, note: "public GraphQL hub, no published cap" },
  defillama: { perDay: null, note: "open API, no published cap" },
  // Phase 0 uses the keyless explorers; ETHERSCAN_API_KEY only covers token supply moves.
  onchain: { perDay: 100_000, perSecond: 5, note: "Etherscan free tier: 5 req/s, 100k/day" },
};

export type Verdict = "ok" | "tight" | "over" | "unmetered";

export interface Projection {
  source: SourceKey;
  perSubjectPerDay: number;
  projectedPerDay: number;
  limit: number | null;
  /** fraction of the daily budget used, or null when there is no published budget */
  utilisation: number | null;
  verdict: Verdict;
}

/** Over 80% of a daily cap is "tight": one busy day or a retry storm takes it over. */
export const TIGHT_AT = 0.8;

/**
 * What scheduled ingest costs at a given number of tracked subjects.
 *
 * Deliberately a *floor*, not an estimate: it counts one request per source per refresh window
 * per subject and nothing else. Retries, the second page some adapters fetch, and any manual
 * run all sit on top. A projection that flatters the budget would be worse than none, so where
 * this says "tight" the real answer is probably "over".
 */
export function project(source: SourceKey, subjects: number): Projection {
  const perSubjectPerDay = dailyRequestsPerSubject(source);
  const projectedPerDay = Math.ceil(perSubjectPerDay * Math.max(0, subjects));
  const limit = QUOTAS[source].perDay;
  if (limit === null) {
    return { source, perSubjectPerDay, projectedPerDay, limit, utilisation: null, verdict: "unmetered" };
  }
  const utilisation = limit > 0 ? projectedPerDay / limit : Infinity;
  const verdict: Verdict = utilisation > 1 ? "over" : utilisation >= TIGHT_AT ? "tight" : "ok";
  return { source, perSubjectPerDay, projectedPerDay, limit, utilisation, verdict };
}

/**
 * How many subjects a source can carry before its free tier is spent.
 *
 * The number worth knowing before launch: it converts an abstract quota into "this feed covers
 * 25 subjects", which is the form the buy-or-drop decision actually takes.
 */
export function subjectCapacity(source: SourceKey): number | null {
  const limit = QUOTAS[source].perDay;
  if (limit === null) return null;
  const per = dailyRequestsPerSubject(source);
  return per > 0 ? Math.floor(limit / per) : null;
}

/**
 * How many of a source's daily requests are left, by the fetch log: its cap less every request logged
 * for it since 00:00 UTC, whichever subject asked, and none once the source has answered 429 today.
 * Null where the source publishes no daily cap. A keyed feed's quota is the account's, so a guard a
 * subject at a time (the refresh window, the back-off) cannot keep a day's ingest inside it: at 250
 * requests a day the 251st company would spend a request to be refused (batch 189, for Currents).
 */
export async function dailyBudgetLeft(
  client: { query: (sql: string, params: unknown[]) => Promise<{ rows: { asked: number; refused: number }[] }> },
  source: SourceKey
): Promise<number | null> {
  const limit = QUOTAS[source].perDay;
  if (limit === null) return null;
  const { rows } = await client.query(
    `SELECT count(*)::int AS asked, (count(*) FILTER (WHERE f.http_status = 429))::int AS refused
       FROM source_fetches f JOIN sources s ON s.id = f.source_id
      WHERE s.key = $1 AND f.fetched_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`,
    [source]
  );
  const { asked = 0, refused = 0 } = rows[0] ?? {};
  return refused > 0 ? 0 : Math.max(0, limit - asked);
}

/** Sources whose free tier cannot carry the given subject count, tightest budget first. */
export function overBudget(subjects: number): Projection[] {
  return (Object.keys(QUOTAS) as SourceKey[])
    .map((s) => project(s, subjects))
    .filter((p) => p.verdict === "over" || p.verdict === "tight")
    .sort((a, b) => (b.utilisation ?? 0) - (a.utilisation ?? 0));
}
