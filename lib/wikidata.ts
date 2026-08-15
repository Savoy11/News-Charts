const API = "https://www.wikidata.org/w/api.php";
const UA = { "User-Agent": "News Charts Research marcusowens94@gmail.com" };

/**
 * Resolve a company's official website to a bare hostname via Wikidata (P856).
 * EDGAR exposes `website`/`investorWebsite` fields but leaves them empty for most
 * filers, so Wikidata is the reliable route.
 */
export async function getOfficialDomain(companyName: string): Promise<string | null> {
  try {
    const searchUrl =
      `${API}?action=wbsearchentities&search=${encodeURIComponent(companyName)}` +
      `&language=en&type=item&limit=1&format=json&origin=*`;
    const searchRes = await fetch(searchUrl, { headers: UA, next: { revalidate: 604800 } });
    if (!searchRes.ok) return null;
    const qid = (await searchRes.json())?.search?.[0]?.id;
    if (!qid) return null;

    const claimUrl = `${API}?action=wbgetclaims&entity=${qid}&property=P856&format=json&origin=*`;
    const claimRes = await fetch(claimUrl, { headers: UA, next: { revalidate: 604800 } });
    if (!claimRes.ok) return null;
    const value = (await claimRes.json())?.claims?.P856?.[0]?.mainsnak?.datavalue?.value;
    if (typeof value !== "string") return null;

    // Wikidata often stores a locale-specific URL (e.g. https://apple.com/at/)
    return new URL(value).hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/**
 * Wayback redirects an undated-ish URL to the nearest capture, so a snapshot link
 * needs no API call at all — just the date and the host.
 *
 * ⚠ True about the mechanism, and the reason the label built on it was false. "Nearest" has no
 * bound: asking for `ford.com` in 1926 returns a capture from **December 1998**, verified against
 * `archive.org/wayback/available` on 2026-08-12. The URL is fine; what it can honestly be called
 * is the question — see `WAYBACK_EPOCH` and `SiteSnapshotLink`.
 */
export function waybackUrl(domain: string, date: string): string {
  return `https://web.archive.org/web/${date.replace(/-/g, "")}/http://${domain}`;
}

/**
 * The first year the web was archived at all.
 *
 * The Internet Archive began crawling in 1996, so for any event before it there is no capture to
 * be near — the link is not imprecise, it is a claim about a page that did not exist. Offering it
 * anyway is how a 1926 Ford event came to advertise "the site that day".
 *
 * A local constant rather than a lookup on purpose: this is the half that can be decided without
 * asking anyone, on a render path that must not acquire a network call. `fetchSiteSnapshots`
 * answers the sharper question (*does this domain have a capture near this date*) and is the
 * upgrade if the snapshot strip is ever built.
 */
export const WAYBACK_EPOCH = "1996-01-01";

/** Could the archive hold anything near this date at all? */
export function waybackCouldHave(date: string): boolean {
  return date >= WAYBACK_EPOCH;
}
