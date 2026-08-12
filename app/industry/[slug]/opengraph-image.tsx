import { ogCard, OG_SIZE, OG_CONTENT_TYPE, industryTitleFromSlug } from "@/lib/og";
import { loadIndustry } from "@/lib/store/read";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Sector timeline on News Charts";

/**
 * Unlike the company and topic cards, this one reads the database — because an industry slug is
 * an opaque identifier rather than a name. `sic-3711` and `sector-stablecoins` are what ingest
 * writes, so building the title from params alone would render "Sic 3711": worse than the
 * generic card it replaces.
 *
 * That is not a new dependency for this route. The page itself cannot render without the same
 * `loadIndustry` call, so a database that is down already means there is no page for this card
 * to belong to. It is still a degradation and never a failure — an unreachable database falls
 * back to a readable title instead of throwing, on the schema doc's rule that enrichments
 * degrade pages rather than break them.
 */
export default async function Image({ params }: { params: { slug: string } }) {
  const slug = decodeURIComponent(params.slug);
  const industry = await loadIndustry(slug).catch(() => null);
  return ogCard("Sector timeline", industry?.name ?? industryTitleFromSlug(slug));
}
