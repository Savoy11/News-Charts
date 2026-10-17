import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * Move every stored GDELT event onto the story key the other news feeds use (NC-154).
 *
 *   npm run rekey:gdelt              # re-key and merge
 *   npm run rekey:gdelt -- --dry-run # count what would change, write nothing
 *
 * GDELT keyed a story on its raw headline and a compact date (`Title|20240304`); every other
 * feed keys on `storyKey` (normalised headline, outlet stripped, `2024-03-04`). So the same story
 * from GDELT and Yahoo could never collapse. New GDELT rows use `storyKey`, and a row stored the
 * old way is re-keyed when GDELT serves it again — this does the rest at once.
 *
 * Done in TypeScript rather than a SQL migration on purpose: the new key IS `storyKey`, and a
 * second implementation in SQL would drift from it on exactly the headlines worth merging.
 * One transaction; safe to run twice (a second run finds nothing to move).
 */
import { getPool, closePool, configProblem } from "../lib/db";
import { dedupKey } from "../lib/ingest/keys";
import { rekeyEvent } from "../lib/ingest/store";
import { storyKey } from "../lib/newsQuality";

const dry = process.argv.includes("--dry-run");

async function main(): Promise<void> {
  const client = await getPool().connect();
  try {
    const { rows } = await client.query<{ title: string; day: string; dedup_key: Buffer }>(
      `SELECT e.title, to_char(e.occurred_on, 'YYYY-MM-DD') AS day, e.dedup_key
         FROM events e
         JOIN event_attestations a ON a.event_id = e.id AND a.is_primary
         JOIN sources s ON s.id = a.source_id
        WHERE s.key = 'gdelt'
        ORDER BY e.id`
    );
    const counts = { rekeyed: 0, merged: 0, current: 0, unrecognised: 0 };
    await client.query("BEGIN");
    for (const r of rows) {
      const next = dedupKey(storyKey(r.title, r.day));
      if (r.dedup_key.equals(next)) {
        counts.current++;
        continue;
      }
      // Only a row still under the old GDELT form is ours to move. Anything else got its key
      // some other way, and guessing would be how two different stories end up merged.
      const legacy = dedupKey(`${r.title}|${r.day.replace(/-/g, "")}`);
      if (!r.dedup_key.equals(legacy)) {
        counts.unrecognised++;
        continue;
      }
      if (dry) {
        const { rows: taken } = await client.query(`SELECT 1 FROM events WHERE dedup_key = $1`, [next]);
        counts[taken.length ? "merged" : "rekeyed"]++;
        continue;
      }
      const outcome = await rekeyEvent(client, legacy, next);
      if (outcome !== "none") counts[outcome]++;
    }
    if (dry) await client.query("ROLLBACK");
    else await client.query("COMMIT");
    console.log(
      `${rows.length} GDELT event(s): ${counts.rekeyed} re-keyed, ${counts.merged} merged into the ` +
        `same story from another feed, ${counts.current} already current, ${counts.unrecognised} left alone` +
        (dry ? "  (dry run — nothing written)" : "")
    );
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
    await closePool();
  }
}

main().catch((err) => {
  const known = configProblem(err);
  console.error(known ? `rekey:gdelt failed: ${known}` : err);
  process.exit(1);
});
