import type { MetadataRoute } from "next";
import { absolute, subjectPath } from "@/lib/seo";
import { listIndexedSubjects } from "@/lib/subjects-index";
import { CURATED } from "@/lib/suggestions";

// Rebuilt hourly. Lists the static hubs plus every subject that carries events; if the database
// is unavailable it still emits the curated seeds, so the sitemap is never empty. Custom groups
// are deliberately absent — they're private to a visitor's browser.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: absolute("/"), priority: 1, changeFrequency: "daily" },
    { url: absolute("/explore"), priority: 0.8, changeFrequency: "daily" },
  ];

  const subjects = await listIndexedSubjects(1, 5000);

  const subjectRoutes: MetadataRoute.Sitemap = subjects.length
    ? subjects.map((s) => ({
        url: absolute(subjectPath(s.kind, s.slug, s.ticker)),
        lastModified: s.refreshedAt ? new Date(s.refreshedAt) : undefined,
        changeFrequency: "weekly",
      }))
    : CURATED.map((c) => ({ url: absolute(c.href), changeFrequency: "weekly" }));

  return [...staticRoutes, ...subjectRoutes];
}
