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

  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  if (fail) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
