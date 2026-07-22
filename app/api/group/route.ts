import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { RELEVANCE_THRESHOLD } from "@/lib/enrich/relevance";
import type { EventType, TimelineEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Merged timeline for an ad-hoc set of tickers. Read-only; groups are never stored. */
export async function GET(req: NextRequest) {
  const tickers = (req.nextUrl.searchParams.get("tickers") ?? "")
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 40);

  if (!tickers.length) return NextResponse.json({ events: [] });

  try {
    const { rows } = await getPool().query(
      `SELECT e.id, e.kind, e.occurred_on, e.date_precision, e.title,
              a.url, a.source_label,
              string_agg(DISTINCT m.ticker, ', ') AS tickers,
              count(DISTINCT m.id) AS peers
         FROM events e
         JOIN event_subjects es ON es.event_id = e.id
         JOIN subjects m ON m.id = es.subject_id
                        AND m.kind = 'company'
                        AND m.ticker = ANY($1::text[])
         LEFT JOIN event_attestations a ON a.event_id = e.id AND a.is_primary
        WHERE es.relevance IS NULL OR es.relevance >= $2
        GROUP BY e.id, e.kind, e.occurred_on, e.date_precision, e.title, a.url, a.source_label
        ORDER BY e.occurred_on DESC
        LIMIT 400`,
      [tickers, RELEVANCE_THRESHOLD]
    );

    const events: TimelineEvent[] = rows.map((r) => {
      const date =
        r.occurred_on instanceof Date
          ? r.occurred_on.toISOString().slice(0, 10)
          : String(r.occurred_on).slice(0, 10);
      const peers = Number(r.peers);
      return {
        id: `grp-${r.id}`,
        date,
        type: r.kind as EventType,
        title: r.title,
        source: r.source_label ?? "Chronolens",
        url: r.url ?? undefined,
        description: peers > 1 ? `${r.tickers} · ${peers} peers` : r.tickers,
        yearOnly: r.date_precision === "year",
      };
    });

    return NextResponse.json({ events, resolved: tickers.length });
  } catch (err) {
    return NextResponse.json({ events: [], error: (err as Error).message });
  }
}
