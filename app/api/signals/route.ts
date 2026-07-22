import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { computeSignals, type SignalOptions } from "@/lib/signals";
import { fetchRegulations } from "@/lib/federalregister";
import { loadExplanations } from "@/lib/store/read";

export const dynamic = "force-dynamic";

/**
 * Signals for either a SIC industry or an ad-hoc set of tickers, computed with the
 * visitor's own thresholds.
 *
 * The server stays stateless: preferences arrive as parameters and a computation goes
 * back. Nothing a visitor sets is stored, and nothing they set changes what anyone else
 * sees. Extra Federal Register terms are fetched live and returned alongside — they are
 * *not* written to the shared corpus, so one person's feed can't pollute everyone's data.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const industrySlug = q.get("industry");
  const tickers = (q.get("tickers") ?? "")
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 40);

  const num = (key: string, fallback: number, min: number, max: number) => {
    const v = Number(q.get(key));
    return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
  };
  const opts: SignalOptions = {
    floor: num("floor", 5, 1, 50),
    sigma: num("sigma", 2, 0, 6),
    divergencePct: num("divergencePct", 15, 1, 500),
  };
  const sinceMonths = num("sinceMonths", 30, 1, 240);
  const since = new Date();
  since.setMonth(since.getMonth() - sinceMonths);
  const sinceStr = since.toISOString().slice(0, 10);

  try {
    const pool = getPool();
    let scopeIds: number[] = [];
    let memberIds: number[] = [];

    if (industrySlug) {
      const { rows } = await pool.query(
        `SELECT i.id AS industry_id,
                COALESCE(array_agg(sm.member_id) FILTER (WHERE sm.member_id IS NOT NULL), '{}') AS members
           FROM subjects i
           LEFT JOIN subject_members sm ON sm.industry_id = i.id
          WHERE i.slug = $1 AND i.kind = 'industry'
          GROUP BY i.id`,
        [industrySlug.toLowerCase()]
      );
      if (!rows[0]) return NextResponse.json({ signals: [], extraEvents: [] });
      memberIds = (rows[0].members as string[]).map(Number);
      scopeIds = [Number(rows[0].industry_id), ...memberIds];
    } else if (tickers.length) {
      const { rows } = await pool.query(
        `SELECT id FROM subjects WHERE kind = 'company' AND ticker = ANY($1::text[])`,
        [tickers]
      );
      memberIds = rows.map((r) => Number(r.id));
      scopeIds = memberIds;
    } else {
      return NextResponse.json({ error: "pass industry or tickers" }, { status: 400 });
    }

    const terms = (q.get("frTerms") ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 2)
      .slice(0, 5);

    const [signals, extra, explanations] = await Promise.all([
      computeSignals(scopeIds, memberIds, sinceStr, opts),
      Promise.all(terms.map((t) => fetchRegulations(t, sinceStr))),
      // explanations are stored against the industry subject, when one exists
      industrySlug && scopeIds.length ? loadExplanations(scopeIds[0]).catch(() => []) : [],
    ]);

    const extraEvents = extra.flatMap((r, i) =>
      r.events.slice(0, 20).map((e) => ({ ...e, description: `${e.description} · “${terms[i]}”` }))
    );

    return NextResponse.json({
      signals,
      extraEvents,
      explanations,
      since: sinceStr,
      memberCount: memberIds.length,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message, signals: [], extraEvents: [] });
  }
}
