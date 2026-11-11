import type { SourceKey } from "./types";

/**
 * How many documents attest a row, for the "· N sources" a page shows after its description (batch
 * 107, the 2026-11-07 audit's finding 1).
 *
 * A row of these sources carries several cases' numbers joined by commas: EPA's, the CPSC's and the
 * CFTC's day and month rows, the SEC's litigation releases and the CFPB's actions since batch 106,
 * the SEC News Digest's month rows, and the FDA's warning letters of a company's day (batch 140). When a row's list grows, ingest stores it again under the
 * new list, a second attestation of the same event (`lib/ingest/store.ts`), and keeps the first, so
 * "Also on" still finds the row by every number it ever carried. Those attestations are versions of
 * one row from one agency, never two documents, and count once. Every other source's attestations
 * each count: a story twelve papers carried is twelve.
 */
export const GROUPED_ROW_SOURCES: readonly SourceKey[] = ["sec_cases", "cfpb", "epa_cases", "cpsc_recalls", "cftc", "sec_digest", "fda_warning_letters"];

/** Their ids in `sources`, written out so the read path needs no ingest code; check:also-on holds the two together. */
export const GROUPED_ROW_SOURCE_IDS: readonly number[] = [28, 30, 31, 32, 33, 34, 39];

/** The documents a row's attestations come to: each once, but a grouped source's versions once. */
export function corroborations(sourceIds: readonly (number | string)[] | null | undefined): number {
  const grouped = new Set<number>();
  let others = 0;
  for (const raw of sourceIds ?? []) {
    const id = Number(raw);
    if (GROUPED_ROW_SOURCE_IDS.includes(id)) grouped.add(id);
    else others++;
  }
  return others + grouped.size;
}
