import { ogCard, OG_SIZE, OG_CONTENT_TYPE, titleFromSlug } from "@/lib/og";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Topic timeline on Chronolens";

// Built from the slug alone (no data fetch), so the card renders fast and never depends on the DB.
export default function Image({ params }: { params: { slug: string } }) {
  return ogCard("Topic timeline", titleFromSlug(params.slug));
}
