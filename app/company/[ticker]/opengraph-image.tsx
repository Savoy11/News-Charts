import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Company timeline on Chronolens";

// Ticker only (no fetch) — recognisable and always fast; the page's <title> carries the full name.
export default function Image({ params }: { params: { ticker: string } }) {
  return ogCard("Stock timeline", decodeURIComponent(params.ticker).toUpperCase());
}
