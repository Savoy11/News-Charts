import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Chronolens — research any topic on a timeline";

// Site-wide default card (home, /explore, and any page without its own image).
export default function Image() {
  return ogCard("Timelines for analysts", "Research any topic on a timeline");
}
