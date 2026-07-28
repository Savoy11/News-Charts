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
   * "Barack Obama's effect on Ford stock" asks about two subjects, and the honest answer puts
   * both on one axis: his events against Ford's price. Until now it landed on Ford's timeline
   * with "barack obama" pre-filled in the AI panel — useful and truthful, but not the thing
   * asked for.
   *
   * Only when the influence is *known to be drawable*. A relational prompt whose other side we
   * cannot find would otherwise trade a page that works for a compare with one empty half, and a
   * question answered partly beats a question answered with a warning.
   *
   * The priced subject goes in `b` and the influence in `a`, matching the compose /compare
   * already renders: one side supplies the axis, the other supplies what happened.
   */
  if (influence && ticker && (await isDrawable(influence))) {
    return NextResponse.json({
      kind: "compare",
      a: encodeURIComponent(influence),
      b: encodeURIComponent(ticker),
      focus,
    });
  }

  if (ticker) return NextResponse.json({ kind: "company", ticker, focus });
  if (known?.kind === "topic") {
    return NextResponse.json({ kind: "topic", slug: encodeURIComponent(known.slug), focus });
  }
  return NextResponse.json({
    kind: "topic",
    slug: encodeURIComponent(subject.toLowerCase()),
    focus,
  });
}
