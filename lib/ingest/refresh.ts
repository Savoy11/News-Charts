import type { SourceKey } from "../types";

/**
 * How often each source is worth asking again.
 *
 * The page path used to treat freshness as all-or-nothing: once a subject's copy aged past its
 * TTL, *every* source was refetched together — around fifteen requests per company page view.
 * That is wrong twice over. Wikipedia's account of a company does not change hourly, and
 * 1800s newspaper scans never change at all, so most of those requests bought nothing. And
 * several of the keyed feeds sit on free tiers small enough that the waste is not theoretical:
 * GNews allows 100 requests a day, Newsdata 200. A handful of subjects viewed through an
 * afternoon can exhaust them, after which the feeds go quiet and the page looks broken rather
 * than rate-limited.
 *
 * So the windows below are set by two things: how fast the source actually changes, and how
 * much quota headroom it has. Where those disagree, quota wins — a feed that is silent because
 * we burned its budget is worse than one that is six hours stale.
 */
export const SOURCE_TTL_MINUTES: Record<SourceKey, number> = {
  // Keyless and generous: refresh at the pace the content actually moves.
  gdelt: 60,
  yahoo_finance: 60,

  // Filings post through the trading day, but not minute to minute.
  sec_edgar: 360,
  // A daily bar changes once a day. Twice a day catches the close whatever the time zone.
  yahoo_prices: 720,

  // Reference material. A company's encyclopedia article is not an hourly feed.
  wikipedia: 1440,
  federal_register: 1440,
  // A Fed statement or a CPI release lands at most a few times a month, on a published calendar;
  // a daily look finds each one the day it is out.
  fed_fomc: 1440,
  bls_cpi: 1440,
  // A maker files a recall within days of deciding there is a defect, a few a month for the
  // largest; a daily look finds each one within a day of NHTSA posting it.
  nhtsa_recalls: 1440,
  // NHTSA opens a few investigations a month across every maker; a daily look finds each one
  // within a day of it being posted.
  nhtsa_investigations: 1440,
  // The Board announces a handful of actions a month, against every bank it supervises; a daily
  // look finds each one within a day of it being posted.
  fed_enforcement: 1440,
  // The enforcement report is published weekly; a daily look finds each recall within a day of it.
  fda_enforcement: 1440,
  // The recalls before mid-2012 are closed; a daily look reads the classes still owed, a few hundred a run.
  fda_device_recalls: 1440,
  // A settlement or a suit naming a large company comes a few times a year; a daily look finds
  // each one the day the Department posts it.
  doj_press: 1440,
  // The SEC issues a release or two a working day, about every subject it regulates; a daily look
  // at the year's newest page finds each one the day it is posted (batch 73).
  sec_press: 1440,
  // The SEC files a litigation release or an order most working days; a daily look at each
  // listing's newest page finds each one the day it is posted (batch 83).
  sec_cases: 1440,
  // The Board posts a few releases a working day, every subject together in one file; a daily look
  // finds each the day it is posted (batch 84).
  fed_press: 1440,
  // The Bureau files a few actions a month, against every firm it regulates; a daily look at its
  // list's newest page finds each one filed since the newest kept within a day of it being posted
  // (batch 89). One posted late, dated before an action already kept, waits for the monthly read of
  // the whole list (batch 90: 0 of the 386 were out of filed order on 2026-11-05).
  cfpb: 1440,
  // EPA's case file is read whole once a month for every company (lib/ingest/epaWalk.ts); a
  // company's own rows are matched from the kept copy, so a day is plenty
  epa_cases: 1440,
  // the recall service is read whole once a week for every company (lib/ingest/cpscWalk.ts)
  cpsc_recalls: 1440,
  // the Commission's list: its newest page once a day for every company (lib/ingest/cftcWalk.ts)
  cftc: 1440,
  // the Digest's archive is closed: what is left of it is read a run at a time for every company
  // (lib/ingest/secDigestWalk.ts), so a company's rows can only grow while the walk is unfinished
  sec_digest: 1440,
  // the approvals are a committed file (lib/fdaApprovals.ts): a company's are read from it, no request
  fda_approvals: 1440,
  // …and so are their later efficacy supplements (lib/fdaSupplements.ts, batch 115)
  fda_supplements: 1440,
  // the FRA's railroad accident reports, asked once a day for the railroads lib/railAccidents.ts maps (batch 127)
  fra_accidents: 1440,
  // MSHA's mine accidents, kept from a weekly read of its files (lib/ingest/mineWalk.ts, batch 134):
  // a company's ingest only reads the kept copy, once a day
  msha_accidents: 1440,
  // the FDA's warning letters, kept from a weekly read of the whole list (lib/ingest/fdaWarningWalk.ts,
  // batch 140): a company's ingest only reads the kept copy, once a day
  fda_warning_letters: 1440,
  // Digitised newspapers from before 1963. These will never change again.
  loc_chronam: 10080,
  // Halvings and network upgrades are settled history; Phase 0 holds nothing live.
  onchain: 1440,
  // An archive of things that already happened. New items are catalogued daily, but what is
  // catalogued today is almost never *dated* today, so a short window buys nothing. Keyless, so
  // the only cost of asking is archive.org's patience — which is exactly why not to spend it.
  internet_archive: 1440,
  // Governance moves on a proposal cycle, not a news cycle: a space closes a handful of votes a
  // month, and a closed one never changes. Keyless, so the cost of asking is Snapshot's patience.
  snapshot: 720,
  // A curated incident list. New entries land days after the event as researchers confirm them,
  // and a settled incident never changes — so asking twice a day buys nothing.
  defillama: 720,

  // ---- keyed feeds, windowed by quota headroom rather than by volatility ----
  // 100 requests/day. At 6h one subject costs 4/day, so ~25 subjects fit the budget.
  gnews: 360,
  // 200/day.
  newsdata: 240,
  currents: 240,
  marketaux: 240,
  // News access varies by plan and the free tier is tiny.
  eodhd: 360,
  // 60 req/min is generous, but it is still a non-commercial tier we shouldn't lean on.
  finnhub: 120,
  // Archive-first: their value is depth, not recency.
  nyt: 360,
  guardian: 360,
};

/** Fallback for a source with no window recorded — conservative rather than chatty. */
const DEFAULT_TTL_MINUTES = 360;

export function ttlFor(source: SourceKey): number {
  return SOURCE_TTL_MINUTES[source] ?? DEFAULT_TTL_MINUTES;
}

/**
 * Which of `keys` are due a refresh.
 *
 * Pure on purpose — the wiring around it needs a database and a network, and this is the part
 * that decides whether a request is made at all, so it should be checkable without either.
 *
 * A source with no recorded fetch is always stale: never having asked is not the same as
 * having asked recently, and treating it as fresh would mean a subject's first page view
 * silently skipped half its feeds.
 */
export function selectStaleSources(
  keys: readonly SourceKey[],
  lastFetched: ReadonlyMap<SourceKey, Date>,
  now: Date = new Date()
): SourceKey[] {
  return keys.filter((k) => {
    const at = lastFetched.get(k);
    if (!at) return true;
    const ageMinutes = (now.getTime() - at.getTime()) / 60_000;
    // a clock skew that puts the last fetch in the future must not pin a source as fresh forever
    if (ageMinutes < 0) return true;
    return ageMinutes >= ttlFor(k);
  });
}

/**
 * How many requests a subject costs per day if it is viewed continuously — the number that
 * matters when reading a provider's daily cap. Exposed so the quota reasoning above can be
 * checked rather than trusted.
 */
export function dailyRequestsPerSubject(source: SourceKey): number {
  return Math.round((1440 / ttlFor(source)) * 10) / 10;
}
