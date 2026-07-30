/**
 * SEO helpers. Pure and dependency-free (no database, no server-only imports) so this can be
 * pulled into client components, metadata routes, and the sitemap alike.
 */

/** Public origin, no trailing slash. Set NEXT_PUBLIC_SITE_URL in production; localhost in dev. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(
  /\/+$/,
  ""
);

export const SITE_NAME = "News Charts";

/** Absolute URL for a site-relative path, so Open Graph / canonical tags resolve correctly. */
export function absolute(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

export type SubjectKind = "company" | "topic" | "industry";

/** The canonical page path for a subject. Mirrors how SearchBox/suggestions build links. */
export function subjectPath(kind: SubjectKind, slug: string, ticker?: string | null): string {
  if (kind === "company") return `/company/${ticker ?? slug}`;
  if (kind === "industry") return `/industry/${slug}`;
  return `/topic/${encodeURIComponent(slug)}`;
}

/** Trim a summary to a clean meta-description length without cutting a word in half. */
export function clampDescription(text: string, max = 155): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** A schema.org BreadcrumbList — the one bit of structured data every subject page carries. */
export function breadcrumbLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: absolute(it.path),
    })),
  };
}
