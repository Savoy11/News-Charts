import { ImageResponse } from "next/og";

/**
 * Shared Open Graph card. Rendered from route params only — no database or live fetch — so a
 * social card is always fast and never depends on the data layer being up. Satori (behind
 * next/og) supports only flexbox + inline styles, hence the verbose style objects.
 */
export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

export function ogCard(eyebrow: string, title: string) {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #020617 0%, #0f172a 100%)",
          padding: 72,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 36, fontWeight: 800, letterSpacing: -0.5 }}>
          <span style={{ color: "#f1f5f9" }}>news&nbsp;</span>
          <span style={{ color: "#38bdf8" }}>charts</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 26,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: 5,
              color: "#818cf8",
            }}
          >
            {eyebrow}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 88,
              fontWeight: 800,
              color: "#f8fafc",
              lineHeight: 1.05,
              marginTop: 18,
              maxWidth: 1040,
            }}
          >
            {title}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 999,
                  marginRight: 12,
                  background: i % 2 === 0 ? "#38bdf8" : "#f59e0b",
                }}
              />
            ))}
          </div>
          <div style={{ display: "flex", fontSize: 26, color: "#94a3b8" }}>
            Every listed security on a timeline
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE }
  );
}

/**
 * The best title an opaque industry slug can honestly give on its own.
 *
 * Company and topic cards build their title from route params, because a ticker and a topic slug
 * are already names. An industry slug is not: ingest writes `sic-3711` (`linkToIndustry`) and
 * `sector-stablecoins` (`linkToSector`), so the same treatment would render "Sic 3711".
 *
 * `sic-3711` becomes "SIC 3711" rather than "Sic 3711" — if the number is all we have it should
 * at least read as the classification code it is. A curated sector drops its `sector-` prefix,
 * recovering something close to the display name without inventing the curated wording.
 *
 * This is the fallback. The card prefers the real display name and only lands here when the
 * database cannot be reached.
 */
export function industryTitleFromSlug(slug: string): string {
  const s = slug.trim();
  const sic = /^sic-(\d+)$/i.exec(s);
  if (sic) return `SIC ${sic[1]}`;
  const sector = /^sector-(.+)$/i.exec(s);
  return titleFromSlug(sector ? sector[1] : s);
}

/** "artificial%20intelligence" / "electric-cars" → "Artificial Intelligence" for a card title. */
export function titleFromSlug(slug: string): string {
  let s = slug;
  try {
    s = decodeURIComponent(slug);
  } catch {
    /* leave as-is if it isn't valid percent-encoding */
  }
  return s
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
