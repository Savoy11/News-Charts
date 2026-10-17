import { ogCard, OG_SIZE, OG_CONTENT_TYPE, OG_UNKNOWN } from "@/lib/og";
import { loadSubject } from "@/lib/store/read";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Topic timeline on News Charts";

/**
 * The stored name, never the URL's words (NC-157). Built from the slug alone, the card rendered
 * "Topic timeline — Tesla Files For Bankruptcy" for any /topic/<words> — a News Charts-branded
 * image repeating whatever someone typed, whether or not anything existed behind it. A topic we
 * do not hold, or a database that cannot answer, gets the generic card.
 */
export default async function Image({ params }: { params: { slug: string } }) {
  let slug = params.slug;
  try {
    slug = decodeURIComponent(params.slug);
  } catch {
    /* not valid percent-encoding — look it up as it came */
  }
  const subject = await loadSubject(slug).catch(() => null);
  return ogCard("Topic timeline", subject?.kind === "topic" ? subject.displayName : OG_UNKNOWN);
}
