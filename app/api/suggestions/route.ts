import { NextResponse } from "next/server";
import { loadSuggestibleSubjects } from "@/lib/subjects-index";
import { blend } from "@/lib/suggestions";

export const revalidate = 60;

/**
 * What the homepage should offer a visitor to click.
 *
 * The corpus first, topped up from the curated seed pool only where the corpus cannot fill the
 * row. This used to be the other way round — it started from all 44 curated entries and appended
 * real subjects — so the chips advertised GME, quantum computing and nuclear power to a database
 * holding none of them, and every example a first-time visitor tried landed on "Not on News
 * Charts yet". A suggestion is a promise about what is here.
 *
 * Degrades to the seed pool alone when the database is unavailable, which is the one case where
 * an unkeepable promise beats an empty homepage.
 */
export async function GET() {
  return NextResponse.json({ suggestions: blend(await loadSuggestibleSubjects()) });
}
