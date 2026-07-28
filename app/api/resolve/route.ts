import { NextRequest, NextResponse } from "next/server";
import { resolveCompany } from "@/lib/sec";
import { findKnownCompany, loadSubject } from "@/lib/store/read";
import { parseSearchPrompt } from "@/lib/prompt";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ kind: "none" });

  // "Show me the history of Alibaba in the United States" resolves the *subject*
  // (Alibaba); the qualifier travels back as `focus` so the page can act on it.
  const { subject, focus } = parseSearchPrompt(q);

  // Database first, the same discipline as every other loader. `resolveCompany` reads the EDGAR
  // ticker file, so when that is throttled or unreachable a known company fell through to the
  // topic branch below and became a Wikipedia guess — from the search box, the app's main entry
  // point. This also resolves aliases ("bitcoin" → btc) that the live path cannot see.
  const knownCompany = await findKnownCompany(subject).catch(() => null);
  if (knownCompany) {
    return NextResponse.json({ kind: "company", ticker: knownCompany.ticker, focus });
  }
  const known = await loadSubject(subject).catch(() => null);
  if (known?.kind === "company" && known.ticker) {
    return NextResponse.json({ kind: "company", ticker: known.ticker, focus });
  }
  if (known?.kind === "topic") {
    return NextResponse.json({ kind: "topic", slug: encodeURIComponent(known.slug), focus });
  }

  const company = await resolveCompany(subject).catch(() => null);
  if (company) {
    return NextResponse.json({ kind: "company", ticker: company.ticker, focus });
  }
  return NextResponse.json({
    kind: "topic",
    slug: encodeURIComponent(subject.toLowerCase()),
    focus,
  });
}
