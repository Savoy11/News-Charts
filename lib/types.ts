export type EventType =
  | "news"
  | "filing"
  | "earnings"
  | "history"
  | "press"
  | "regulation"
  | "citation"
  | "corporate_action"
  | "onchain"
  /** a reader's own private note, held in their browser and never persisted server-side */
  | "annotation"
  /** a protocol's own governance decision — off-chain signalling, not a transaction */
  | "governance"
  /** a reported security incident against a protocol — someone else's finding, attributed */
  | "exploit"
  /** economy-wide: a Fed policy statement or a CPI release — never about one company (lib/macro.ts) */
  | "macro"
  /** a vehicle safety recall the company filed with NHTSA (lib/recalls.ts) */
  | "recall";

/** Matches the date_precision enum in the database. */
export type DatePrecision = "day" | "month" | "year";

/** Matches the fetch_outcome enum in the database. */
export type FetchOutcome = "ok" | "empty" | "throttled" | "error";

export type SourceKey =
  | "wikipedia"
  | "loc_chronam"
  | "gdelt"
  | "sec_edgar"
  | "federal_register"
  | "yahoo_finance"
  | "yahoo_prices"
  | "nyt"
  | "guardian"
  | "newsdata"
  | "gnews"
  | "currents"
  | "marketaux"
  | "eodhd"
  | "finnhub"
  | "onchain"
  | "internet_archive"
  | "snapshot"
  | "defillama"
  | "fed_fomc"
  | "bls_cpi"
  | "nhtsa_recalls";

export interface TimelineEvent {
  id: string;
  date: string; // YYYY-MM-DD
  type: EventType;
  title: string;
  source: string;
  url?: string;
  description?: string;
  /** optional thumbnail for the event — article social image, Wikipedia lead image, newspaper scan */
  imageUrl?: string;

  // --- ingest metadata; ignored by the UI, required by the worker ---
  /** which source produced this */
  sourceKey?: SourceKey;
  /** identity of the *document* it came from (article title, accession no, item id) */
  externalId?: string;
  /** identity of the *event* — two items with the same basis are the same happening */
  dedupBasis?: string;
  /**
   * The basis this source used before its identity changed. A row still stored under it is
   * re-keyed — or merged into the row already holding the new identity — when the item is seen
   * again, so a key change never duplicates what is already on the timeline.
   */
  legacyDedupBasis?: string;
  /**
   * How precise the source actually was. `date` is always a full day so it can be sorted and
   * plotted, but a month-precision date is normalised to the 1st and a year-precision one to
   * Jan 1 — rendering either as a specific day asserts precision nobody gave us.
   * Absent means day precision.
   */
  precision?: DatePrecision;
  /**
   * Stored subject-aboutness score (0–1) from `event_subjects.relevance`, when one exists.
   * Absent means unscored — which always displays; ranking treats it as a neutral prior,
   * never as evidence against the event.
   */
  relevance?: number;
}

/** What a source fetch returned, so ingest can tell "nothing" from "rate limited". */
export interface FetchResult {
  events: TimelineEvent[];
  outcome: FetchOutcome;
  httpStatus?: number;
  detail?: string;
}

export interface PricePoint {
  time: string; // YYYY-MM-DD
  value: number;
  /** shares traded that session. Optional: rows persisted before volume was plumbed have none. */
  volume?: number;
}

export interface CompanyInfo {
  ticker: string;
  cik: string; // zero-padded 10 digits
  name: string;
}
