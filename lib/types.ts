export type EventType =
  | "news"
  | "filing"
  | "earnings"
  | "history"
  | "press"
  | "regulation"
  | "citation";

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
  | "currents";

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
  /** true when the source only gave a year, so the date is normalised to Jan 1 */
  yearOnly?: boolean;
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
}

export interface CompanyInfo {
  ticker: string;
  cik: string; // zero-padded 10 digits
  name: string;
}
