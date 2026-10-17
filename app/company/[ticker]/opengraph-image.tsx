import { ogCard, OG_SIZE, OG_CONTENT_TYPE, OG_UNKNOWN } from "@/lib/og";
import { loadSubject } from "@/lib/store/read";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Company timeline on News Charts";

/**
 * The stored ticker, never the URL's words — the topic card's problem (NC-157) in another
 * folder: /company/<anything> rendered <ANYTHING> in capitals under the News Charts name. The
 * page's <title> carries the full name; a company we do not hold gets the generic card.
 */
export default async function Image({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  let key = ticker;
  try {
    key = decodeURIComponent(ticker);
  } catch {
    /* not valid percent-encoding — look it up as it came */
  }
  const subject = await loadSubject(key).catch(() => null);
  return ogCard("Stock timeline", subject?.ticker ?? OG_UNKNOWN);
}
