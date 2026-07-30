import { NextRequest, NextResponse } from "next/server";
import { resolveCompany } from "@/lib/sec";
import { findKnownCompany, loadSubject } from "@/lib/store/read";
import { parseSearchPrompt } from "@/lib/prompt";
import { wikipediaHasSubject } from "@/lib/wiki";

/**
 * Can we actually draw this side of a relational question?
 *
 * Cheapest first, and each step is a real answer rather than a guess: a subject already in the
 * database, then a company in the EDGAR index, then a Wikipedia page. Anything reaching the last
 * step is a topic we have never ingested, and the probe is one search request — `/compare` does
 * the full fetch once the visitor is there.
 */
async function isDrawable(term: string): Promise<boolean> {
  if (!term) return false;
  if (await findKnownCompany(term).catch(() => null)) return true;
  if (await loadSubject(term).catch(() => null)) return true;
  if (await resolveCompany(term).catch(() => null)) return true;
  return wikipediaHasSubject(term);
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ kind: "none" });

  // "Show me the history of Alibaba in the United States" resolves the *subject*
  // (Alibaba); the qualifier travels back as `focus` so the page can act on it.
  const { subject, focus, influence } = parseSearchPrompt(q);

  // Database first, the same discipline as every other loader. `resolveCompany` reads the EDGAR
  // ticker file, so when that is throttled or unreachable a known company fell through to the
  // topic branch below and became a Wikipedia guess — from the search box, the app's main entry
  // point. This also resolves aliases ("bitcoin" → btc) that the live path cannot see.
  const knownCompany = await findKnownCompany(subject).catch(() => null);
  const known = knownCompany ? null : await loadSubject(subject).catch(() => null);
  const company =
    knownCompany ?? (known ? null : await resolveCompany(subject).catch(() => null));

  const ticker = knownCompany?.ticker ?? (known?.kind === "company" ? known.ticker : company?.ticker);

  /**
   * "How did Donald Trump's presidency affect IBM stock" is a question about an *intersection*:
   * IBM's price, with the IBM events that also concern Trump. So a relational prompt lands on
   * the affected subject's page and the influence rides along as `focus`, which now narrows that
   * subject's own timeline rather than only pre-filling the AI box.
   *
   * This reverses an earlier routing that sent these to `/compare`. The compose there draws the
   * influence's *own* timeline beside the price, which answers a different question — it shows
   * what Trump did, not what Trump did *to IBM*, and most of it never touches the company. The
   * compose is still one click away from the focus bar for the cases where it is the better
   * read, and `/compare` still handles an explicit "X vs Y".
   *
   * `isDrawable` is kept because that link is only worth offering when the other side exists.
   */
  const composable = influence ? await isDrawable(influence) : false;

  if (ticker) return NextResponse.json({ kind: "company", ticker, focus, influence, composable });
  if (known?.kind === "topic") {
    return NextResponse.json({
      kind: "topic",
      slug: encodeURIComponent(known.slug),
      focus,
      influence,
      composable,
    });
  }
  return NextResponse.json({
    kind: "topic",
    slug: encodeURIComponent(subject.toLowerCase()),
    focus,
    influence,
    composable,
  });
}
