import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { CURATED, type Suggestion } from "@/lib/suggestions";

export const revalidate = 60;

/**
 * Curated seeds blended with subjects people have actually researched, so the
 * homepage gets richer as the database fills. Degrades to the seed pool alone if
 * the database is unavailable.
 */
export async function GET() {
  const suggestions: Suggestion[] = [...CURATED];

  try {
    const { rows } = await getPool().query(
      `SELECT s.slug, s.kind, s.display_name, s.ticker
         FROM subjects s
         JOIN event_subjects es ON es.subject_id = s.id
        GROUP BY s.id
       HAVING count(es.event_id) >= 10
        ORDER BY s.refreshed_at DESC NULLS LAST
        LIMIT 12`
    );

    const seen = new Set(suggestions.map((s) => s.label.toLowerCase()));
    for (const r of rows) {
      const isCompany = r.kind === "company" && r.ticker;
      const label = isCompany ? String(r.ticker) : String(r.display_name);
      if (seen.has(label.toLowerCase())) continue;
      seen.add(label.toLowerCase());
      suggestions.push({
        label,
        href: isCompany
          ? `/company/${r.ticker}`
          : `/topic/${encodeURIComponent(String(r.slug))}`,
        kind: isCompany ? "company" : "topic",
      });
    }
  } catch {
    // no database — the seed pool is plenty
  }

  return NextResponse.json({ suggestions });
}
