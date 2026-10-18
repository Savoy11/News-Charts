import type { TimelineEvent } from "./types";

/**
 * The sector's rows a company page should add: those the company does not already hold.
 *
 * `loadEvents` keys a row `db-<id>` and `loadSectorEvents` keys the same row `sector-<id>`, so a
 * document linked to both the company and its sector — a Federal Register notice naming the
 * company that the sector's keyword search also found — was listed twice. Company documents only
 * began arriving with the company Federal Register feed (2026-10-17 proposal 4), which is when
 * this started to matter. The company's own row wins: it carries the company's relevance.
 */
export function withoutSharedSectorRows(own: TimelineEvent[], sector: TimelineEvent[]): TimelineEvent[] {
  const held = new Set(own.map((e) => e.id.replace(/^db-/, "")));
  return sector.filter((e) => !held.has(e.id.replace(/^sector-/, "")));
}
