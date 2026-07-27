import { NextRequest, NextResponse } from "next/server";
import { resolveCompany } from "@/lib/sec";
import { parseSearchPrompt } from "@/lib/prompt";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ kind: "none" });

  // "Show me the history of Alibaba in the United States" resolves the *subject*
  // (Alibaba); the qualifier travels back as `focus` so the page can act on it.
  const { subject, focus } = parseSearchPrompt(q);

  const company = await resolveCompany(subject);
  if (company) {
    return NextResponse.json({ kind: "company", ticker: company.ticker, focus });
  }
  return NextResponse.json({
    kind: "topic",
    slug: encodeURIComponent(subject.toLowerCase()),
    focus,
  });
}
