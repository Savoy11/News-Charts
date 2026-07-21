// Regenerates db/001_init.sql from the DDL block in docs/EVENTS-SCHEMA.md, so the
// spec and the migration cannot drift. Run after editing the spec.
import { readFileSync, writeFileSync } from "node:fs";

const doc = readFileSync("docs/EVENTS-SCHEMA.md", "utf8");
const match = doc.match(/```sql([\s\S]*?)```/);
if (!match) {
  console.error("no ```sql block found in docs/EVENTS-SCHEMA.md");
  process.exit(1);
}
const header =
  "-- Generated from docs/EVENTS-SCHEMA.md. Edit the spec, then regenerate:\n" +
  "--   npm run db:gen\n\n";
writeFileSync("db/001_init.sql", header + match[1].trim() + "\n");
console.log("wrote db/001_init.sql");
