import { NextRequest, NextResponse } from "next/server";
import { resolveSearch } from "@/lib/resolveSearch";
import { focusHref } from "@/lib/searchChoice";

/**
 * The search that works before the JavaScript does.
 *
 * The search box is a client component, and until React hydrates it its form had no `action`
 * and its input no `name` — so a submit in that window was a native GET of `/` that silently
 * discarded the query. The form declares `action="/search"` and `name="q"`, and this route is
 * what a pre-hydration (or no-JavaScript) submit reaches: the same ladder as `/api/resolve`,
 * answered as a redirect instead of JSON. After hydration the client handler prevents the
 * default and takes the JSON path — this is the floor under it, not a second engine.
 *
 * An unresolved query goes home rather than to a guessed page: since the 2026-08-08 scope
 * change, search resolves exchange-traded securities (plus subjects already held), and `none`
 * is an honest answer the homepage states rather than a topic page invented from the string.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const resolved = await resolveSearch(q);

  const dest =
    resolved.kind === "company"
      ? focusHref(`/company/${resolved.ticker}`, resolved.focus)
      : resolved.kind === "topic"
        ? focusHref(`/topic/${encodeURIComponent(resolved.slug)}`, resolved.focus)
        : resolved.kind === "choose"
          ? // No script, no chooser: the best-scored option, which is what every search did before
            // the hydrated box learned to offer a choice (NC-039).
            resolved.options[0].href
          : // A `suggest` only resembles the query, and with no script there is nobody to ask —
            // home, where the box can be tried again, rather than a page the visitor did not name.
            "/";

  // A relative Location, resolved by the browser against the address it actually requested.
  // Building it from req.nextUrl.origin sent visitors to localhost under `next start` behind a
  // proxy, and NEXT_PUBLIC_SITE_URL would only move the same failure to a host whose variable is
  // unset (NC-170).
  return new NextResponse(null, { status: 307, headers: { Location: dest } });
}
