import { NextRequest, NextResponse } from "next/server";
import { resolveSearch } from "@/lib/resolveSearch";

/**
 * The search that works before the JavaScript does.
 *
 * The search box is a client component, and until React hydrates it its form had no `action` and
 * its input no `name` — so a submit in that window was a *native* GET of `/` that reloaded the
 * homepage and silently discarded the query. No error, no navigation, nothing to retry: from the
 * visitor's chair, search simply did not work. The window is the whole first visit under
 * `next dev`, and on a slow device or connection it is seconds of a production visit too —
 * reproduced with a throttled browser against the production build.
 *
 * So the form now declares `action="/search"` and `name="q"`, and this route is what a
 * pre-hydration (or no-JavaScript) submit reaches: the same ladder as `/api/resolve`, answered
 * as a redirect instead of JSON. After hydration the client handler prevents the default and
 * takes the JSON path exactly as before — this is the floor under it, not a second engine.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const resolved = await resolveSearch(q);

  // An empty query goes home rather than to an error: that is where the box already is, and a
  // native submit of an empty form should land where a click on the logo would.
  const dest =
    resolved.kind === "company"
      ? `/company/${resolved.ticker}`
      : resolved.kind === "topic"
        ? `/topic/${encodeURIComponent(resolved.slug)}`
        : "/";

  const url = new URL(dest, req.nextUrl.origin);
  // The qualifier from a natural-language prompt rides along, same as the client-side push.
  if (resolved.kind !== "none" && resolved.focus) url.searchParams.set("focus", resolved.focus);
  return NextResponse.redirect(url);
}
