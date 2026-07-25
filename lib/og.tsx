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
          <span style={{ color: "#f1f5f9" }}>chrono</span>
          <span style={{ color: "#38bdf8" }}>lens</span>
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
            Research any topic on a timeline
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE }
  );
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
