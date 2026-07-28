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
  | "annotation";

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
  | "nyt"
  | "guardian"
  | "newsdata"
  | "gnews"
  | "currents"
  | "marketaux"
  | "eodhd"
  | "finnhub"
  | "onchain"
  | "internet_archive";

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
   * How precise the source actually was. `date` is always a full day so it can be sorted and
   * plotted, but a month-precision date is normalised to the 1st and a year-precision one to
   * Jan 1 — rendering either as a specific day asserts precision nobody gave us.
   * Absent means day precision.
   */
  precision?: DatePrecision;
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
