import { NextRequest, NextResponse } from "next/server";
import { resolveSearch } from "@/lib/resolveSearch";

/**
 * The JSON face of the search ladder, for the hydrated search box. The ladder itself lives in
 * `lib/resolveSearch.ts`, shared with `/search` (the no-JavaScript fallback) so both routes give
 * one answer to one query.
 *
 * Since the 2026-08-08 scope change the answer carries no `focus`/`influence` — prompt parsing
 * is shelved (see the "Prompt search v2" checklist entry). `kind: "none"` is a real answer:
 * the query names no security and no held subject, and the box says so.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const resolved = await resolveSearch(q);
  if (resolved.kind === "topic") {
    // The slug crosses the wire inside JSON and is spliced into a path by the client — encoded
    // here, as it always was, so "electric cars" arrives as one path segment.
    return NextResponse.json({ ...resolved, slug: encodeURIComponent(resolved.slug) });
  }
  return NextResponse.json(resolved);
}
