/**
 * The only third-party URLs this site will turn into a link: absolute http(s).
 *
 * Feed links are stored as the feed gave them, and React 18 still renders a `javascript:` href
 * (it only warns). A compromised or hostile feed item would otherwise run script on this origin —
 * the same origin that keeps visitors' API keys in localStorage. So the check runs twice: at
 * ingest, so a bad link is never stored, and at render, so a row stored before this rule (or an
 * event fetched live in the browser) is still never clickable.
 *
 * Parsing goes through `URL` rather than a prefix test because that is what the browser does:
 * `java\nscript:` and ` javascript:` both parse to the javascript: scheme and would slip past a
 * naive regex. The input is returned unchanged when it passes, so a stored URL — part of the
 * content hash — is not rewritten by normalisation.
 */
export function safeHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:" ? url : undefined;
  } catch {
    return undefined; // relative or malformed — no event link is either
  }
}
