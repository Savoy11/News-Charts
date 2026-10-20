/**
 * What the legal pages say that the code also decides (NC-124).
 *
 * The pages are **drafts** until a lawyer has read them. While `LEGAL_DRAFT` is true each page
 * says so at the top and asks search engines not to index it; the owner flips it once the text is
 * approved. The bracketed placeholders are the owner's to fill: there is no operating entity yet
 * (D13), and the contact address and governing law are not settled.
 *
 * Facts that would rot if typed into prose live here or are imported where the code keeps them —
 * the search log's retention and cap, the request queue's retention, and every key this site
 * writes to browser storage. `npm run check:legal` fails when the code stores something the
 * privacy page does not list.
 */
export const LEGAL_DRAFT = true;
export const LEGAL_UPDATED = "2026-10-20";

export const OPERATOR = "[operator name]";
export const CONTACT = "[contact email]";
export const GOVERNING_LAW = "[state]";

export interface StoredItem {
  /** the key, or the start of it — per-page keys end in the page's path */
  prefix: string;
  what: string;
  /** localStorage persists; sessionStorage lasts until the tab closes */
  where: "localStorage" | "sessionStorage";
}

/** Everything this site keeps in a visitor's browser. Nothing here is sent to a News Charts server. */
export const BROWSER_STORAGE: StoredItem[] = [
  { prefix: "news-charts:ai:", what: "your AI provider, model and API key, if you connect one", where: "localStorage" },
  { prefix: "news-charts:feed-keys:", what: "your New York Times or Guardian API key, if you add one", where: "localStorage" },
  { prefix: "news-charts:prefs:", what: "your display and signal settings, and any extra Federal Register search terms", where: "localStorage" },
  { prefix: "news-charts:following:", what: "the securities and topics you follow", where: "localStorage" },
  { prefix: "news-charts:notes:", what: "private notes you add to a timeline", where: "localStorage" },
  { prefix: "news-charts:filters:", what: "which event types you have switched off on a page", where: "localStorage" },
  { prefix: "news-charts:collapse:", what: "which parts of an event list you have collapsed", where: "localStorage" },
  { prefix: "news-charts:view:", what: "whether a topic page shows its timeline or its list", where: "localStorage" },
  { prefix: "news-charts:timeline:", what: "the zoom and position of a horizontal timeline", where: "localStorage" },
  { prefix: "news-charts:ads-off", what: "that you chose \"reload without ads\" in this tab", where: "sessionStorage" },
];
