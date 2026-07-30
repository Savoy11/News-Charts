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
 */
export function waybackUrl(domain: string, date: string): string {
  return `https://web.archive.org/web/${date.replace(/-/g, "")}/http://${domain}`;
}
