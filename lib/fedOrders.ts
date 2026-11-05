import archive from "../data/fed-orders-1996-2005.json";
import { plainText } from "./doj";
import { decodeEntities } from "./secHeadlines";
import type { FedRelease } from "./fedPress";

/**
 * The Federal Reserve Board's orders on banks' applications of 1996–2005, from its yearly pages
 * (batch 99, the 2026-11-02 proposal 3, approved by the owner on 2026-11-05).
 *
 * The Board's feed (`lib/fedPress.ts`) begins in January 2006; the decade before it, the decade of
 * the mergers that made today's largest banks, is on ten yearly pages,
 * `www.federalreserve.gov/newsevents/press/all/YYYYall.htm`, each release linked to a page of its
 * own. The archive is closed, so it is read once, by `npm run sync:fed-orders`, into
 * `data/fed-orders-1996-2005.json`: every order the pages list (`bhc` to 2002, `orders` after), its
 * day and title, and its own page's first sentence, which names the applicant's city and what it
 * acquires: "…its approval of the proposal of Norwest Corporation, Minneapolis, Minnesota, to
 * acquire Wells Fargo & Company, San Francisco, California" (1998-10-14). Each company's ingest
 * reads them beside the feed's, under the same source and rule (`fed_press`, `fedPressEvents`).
 *
 * The Board's licence, as `lib/fedPress.ts` quotes it: "Unless otherwise indicated, information on
 * Board's website is in the public domain and may be copied and distributed without permission."
 */

export interface ArchivedOrder {
  day: string;
  title: string;
  /** the order's page on the Board's site */
  url: string;
  /** its page's sentence naming the parties, whole, or null where the page gave none */
  summary: string | null;
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** "October 14, 1998" as "1998-10-14", or null. */
function day(text: string): string | null {
  const m = /^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/.exec(text.trim());
  const month = m ? MONTHS.indexOf(m[1].toLowerCase()) + 1 : 0;
  return m && month ? `${m[3]}-${String(month).padStart(2, "0")}-${m[2].padStart(2, "0")}` : null;
}

/** The orders on a yearly page: every release filed under `bhc` or `orders`, with its day and title. */
export function parseYearPage(html: string): { day: string; title: string; url: string }[] {
  const out: { day: string; title: string; url: string }[] = [];
  for (const m of html.matchAll(/<li>\s*([A-Z][a-z]+ \d{1,2}, \d{4})\s*<div class="indent">\s*<a href="([^"]+)">([\s\S]*?)<\/a>/g)) {
    const d = day(m[1]);
    const path = m[2].trim();
    if (!d || !/^\/boarddocs\/press\/(?:bhc|orders)\/\d{4}\//.test(path)) continue;
    // "Erste Bank der &ouml;sterreichischen Sparkassen": named entities the shared cleaner leaves
    out.push({ day: d, title: decodeEntities(plainText(m[3])), url: `https://www.federalreserve.gov${path}` });
  }
  return out;
}

/**
 * An order page's sentence naming the parties: the first that tells of the Board's approval or
 * action ("The Federal Reserve Board on Wednesday announced its approval of the proposal of…"),
 * whole, since every company it names is a party (49 of the 469 run past 400 characters, the
 * longest listing eleven banks); `fedPressEvents` shortens it for the page. A run-on page is cut
 * at 2,000 characters.
 */
export function orderSummary(html: string): string | null {
  const body = decodeEntities(plainText(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<head[\s\S]*?<\/head>/i, " ")));
  const start = body.search(/The Federal Reserve Board\b[^.]{0,80}?\b(?:approv|den(?:y|ied)|announc)/);
  if (start < 0) return null;
  // the sentence ends at a period before a capital, but not one ending "U.S.", "N.A." or "Inc."
  const text = body.slice(start);
  let end = text.length;
  for (const m of text.matchAll(/\.(?=\s+[A-Z])/g)) {
    const before = text.slice(Math.max(0, m.index - 6), m.index);
    if (/(?:\b[A-Z]\.[A-Z]|\b[A-Z]|\b(?:Inc|Corp|Co|Ltd|Bros|No|St|Mt|Ft))$/.test(before)) continue;
    end = m.index + 1;
    break;
  }
  // SierraCities.com's page of 2000-04-12 lost its section signs on the Board's own side, "12 U.S.C. � 1842(a)(1)"
  const s = text.slice(0, end).replace(/\s+/g, " ").replace(/\b(U\.S\.C\.|C\.F\.R\.) \uFFFD(?= \d)/g, "$1 §").trim();
  return s.length > 2_000 ? `${s.slice(0, 1_997).replace(/\s\S*$/, "")}…` : s;
}

/** The archive as the Board's feed releases, for `fedPressEvents`. */
export const ARCHIVED_ORDERS: readonly FedRelease[] = (archive.orders as ArchivedOrder[]).map((o) => ({
  day: o.day,
  title: o.title,
  type: "Orders on Banking Applications" as const,
  url: o.url,
  ...(o.summary ? { summary: o.summary } : {}),
}));
