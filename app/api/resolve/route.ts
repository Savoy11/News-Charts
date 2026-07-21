import { NextRequest, NextResponse } from "next/server";
import { resolveCompany } from "@/lib/sec";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ kind: "none" });
  const company = await resolveCompany(q);
  if (company) {
    return NextResponse.json({ kind: "company", ticker: company.ticker });
  }
  return NextResponse.json({ kind: "topic", slug: encodeURIComponent(q.toLowerCase()) });
}
