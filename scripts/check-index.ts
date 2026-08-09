import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * "Could not ask" is not "there is nothing".
 *
 *   npm run check:index
 *
 * `/explore` and `sitemap.xml` are both cached pages built from the subject index. When the
 * index read failed it returned `[]`, which is indistinguishable from an empty database — so a
 * build that could not reach Postgres baked an empty listing and an empty sitemap into the
 * output and served them for an hour. A build machine that cannot reach the production database
 * is the *normal* case, not an edge one, so this was a production bug wearing the clothes of a
 * local annoyance.
 *
 * The fix is a distinction, and a distinction is exactly the sort of thing a later simplification
 * quietly removes. Hence this.
 */

// Point at a port nothing is listening on, *before* the pool is created. The pool is lazy, so
// this is enough to make every query fail the way an unreachable database does.
process.env.DATABASE_URL = "postgresql://nobody@127.0.0.1:1/none";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

async function main(): Promise<void> {
  const { listIndexedSubjects } = await import("../lib/subjects-index");

  console.log("\nAn unreachable database");
  const result = await listIndexedSubjects(1, 10);
  check("returns null, not an empty list", result === null, JSON.stringify(result));
  // The one that matters: `[]` here would be cached as "this site has no subjects".
  check("and never an empty array", !Array.isArray(result));
  check("so a caller can tell it apart from a genuinely empty index", result !== undefined);

  /**
   * Homepage suggestions, which are a promise about what is here.
   *
   * The chips used to be drawn from 44 hardcoded subjects with real ones merely appended, so a
   * database holding none of them still advertised GME, quantum computing and nuclear power —
   * and every example a first-time visitor clicked landed on "Not on Chronolens yet".
   */
  console.log("\nSuggestions come from the corpus, not from a wish list");
  const { loadSuggestibleSubjects } = await import("../lib/subjects-index");
  const { blend, pickMix, CURATED, MIN_POOL } = await import("../lib/suggestions");

  // Same dead database as above: this is the one case where the seed pool is the right answer.
  const offline = await loadSuggestibleSubjects();
  check("an unreachable database suggests nothing of its own", offline.length === 0);
  check("so the seed pool fills in rather than an empty row", blend(offline).length >= MIN_POOL, `${blend(offline).length}`);

  const corpus = [
    { label: "AAPL", href: "/company/AAPL", kind: "company" as const },
    { label: "Telegraphy", href: "/topic/telegraph", kind: "topic" as const },
  ];
  const blended = blend(corpus);
  check("what we have comes first", blended[0].label === "AAPL" && blended[1].label === "Telegraphy");
  check("and is never dropped in favour of a curated one", corpus.every((c) => blended.some((b) => b.label === c.label)));
  check("padding reaches a rotatable pool", blended.length >= MIN_POOL, `${blended.length}`);
  // Four securities and one topic under the 2026-08-08 scope: a corpus rich in one kind still needs the other.
  check("both kinds are represented", blended.some((s) => s.kind === "company") && blended.some((s) => s.kind === "topic"));
  check("no subject is suggested twice", new Set(blended.map((s) => s.label)).size === blended.length);

  // A corpus big enough to fill the row is not diluted with subjects we do not hold.
  const rich = [
    ...Array.from({ length: 8 }, (_, i) => ({ label: `CO${i}`, href: `/company/CO${i}`, kind: "company" as const })),
    ...Array.from({ length: 8 }, (_, i) => ({ label: `topic ${i}`, href: `/topic/t${i}`, kind: "topic" as const })),
  ];
  const curatedLabels = new Set(CURATED.map((c) => c.label));
  check(
    "a full corpus is not padded at all",
    blend(rich).every((s) => !curatedLabels.has(s.label)),
    blend(rich).filter((s) => curatedLabels.has(s.label)).map((s) => s.label).join(", ")
  );
  // The shop window itself: five chips, mixed, all drawn from the pool it was given.
  const shown = pickMix(blend(rich));
  check("the row shows five", shown.length === 5, `${shown.length}`);
  check("mixed rather than five of one kind", new Set(shown.map((s) => s.kind)).size === 2);
  check("every chip came from the pool", shown.every((s) => rich.some((r) => r.label === s.label)));

  /**
   * The half that blending alone did not fix.
   *
   * With three real subjects and nine curated stand-ins, a uniform shuffle still put five chips
   * on screen that led nowhere — the pool was right and the *pick* was wrong. Real subjects are
   * spoken for first; a stand-in only appears when there is nothing of that kind left.
   */
  const thin = blend([
    { label: "F", href: "/company/F", kind: "company" },
    { label: "GM", href: "/company/GM", kind: "company" },
    { label: "Electric car", href: "/topic/electric%20cars", kind: "topic" },
  ]);
  for (let attempt = 0; attempt < 40; attempt++) {
    const row = pickMix(thin);
    const missedReal = ["F", "GM", "Electric car"].filter((l) => !row.some((s) => s.label === l));
    if (missedReal.length) {
      check("a real subject is never passed over for a stand-in", false, `dropped ${missedReal.join(", ")}`);
      break;
    }
    if (attempt === 39) check("a real subject is never passed over for a stand-in", true, "40 draws");
  }
  // And when there is nothing at all, the row is still offered rather than left blank.
  check("an empty corpus still fills the row", pickMix(blend([])).length === 5);
  check("every one of those is marked as a stand-in", pickMix(blend([])).every((s) => s.padded === true));

  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  if (fail) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
