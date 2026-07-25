import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

// /group/* is a visitor's private, browser-only workspace and /api/* is machinery — neither
// should be crawled. Everything else is fair game, and the sitemap points crawlers at the real
// subject pages.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/group/", "/api/"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
