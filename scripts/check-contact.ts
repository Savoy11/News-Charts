import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CLIENT_NAME, UA, contactAddress, userAgent } from "../lib/contact";

/**
 * One User-Agent for every request, and no personal address in the repository (batch 92).
 *
 *   npm run check:contact
 *
 * On 2026-11-05 the owner asked that their personal email not be used. Until then 24 modules each
 * wrote it into their own User-Agent. Every request now sends `lib/contact.ts`'s: the client's name
 * and the build's contact address from `NEWS_CHARTS_CONTACT`. That address is never written in the
 * code.
 *
 * Offline by construction. On the code before this batch none of it runs: `lib/contact.ts` did
 * not exist.
 */

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}
const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");
const tracked = (...paths: string[]) => execFileSync("git", ["ls-files", "--", ...paths], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);

const ADDRESS = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
/** A personal mailbox's domain: none of them belongs anywhere in this repository. */
const PERSONAL = /@(?:gmail|googlemail|yahoo|ymail|outlook|hotmail|live|msn|icloud|me|aol|proton|protonmail|gmx|zoho)\.[a-z.]{2,}/i;
/** The only addresses the code may write: stand-ins on the domains reserved for examples (RFC 2606). */
const ALLOWED = /@example\.(?:org|com|net)$/i;

const was = process.env.NEWS_CHARTS_CONTACT;
try {
  console.log("The User-Agent");
  delete process.env.NEWS_CHARTS_CONTACT;
  check("with no contact set, the client's name alone", userAgent() === "News Charts Research" && contactAddress() === null && CLIENT_NAME === "News Charts Research");
  process.env.NEWS_CHARTS_CONTACT = "  builds@example.org ";
  check("with one set, the name and the address, trimmed", userAgent() === "News Charts Research builds@example.org");
  const refused = ["not an address", "builds@example", "two@example.org three@example.org", "<builds@example.org>", "builds@example.org,x"].filter((v) => {
    process.env.NEWS_CHARTS_CONTACT = v;
    return userAgent() !== CLIENT_NAME;
  });
  check("  …and a value that is not one address is not sent", refused.length === 0, refused.join(" | "));
  delete process.env.NEWS_CHARTS_CONTACT;
  const before = new Headers(UA).get("user-agent");
  process.env.NEWS_CHARTS_CONTACT = "builds@example.org";
  const after = new Headers(UA).get("user-agent");
  check("the headers are read when a request is built, not when a module loads (a script loads .env.local after its imports)",
    before === "News Charts Research" && after === "News Charts Research builds@example.org" && Object.keys(UA).join() === "User-Agent" && Object.isFrozen(UA),
    `${before} → ${after}`);
  check("  …and a copy made at the call keeps it, with the headers a request adds", new Headers({ ...UA, Accept: "application/json" }).get("user-agent") === after);
} finally {
  if (was === undefined) delete process.env.NEWS_CHARTS_CONTACT;
  else process.env.NEWS_CHARTS_CONTACT = was;
}

console.log("\nOne source of it, and no address in the code");
const code = tracked("lib", "app", "components", "scripts", "proxy.ts").filter((p) => /\.(?:ts|tsx|js|mjs)$/.test(p) && !p.startsWith("scripts/fixtures/"));
const ownUA = code.filter((p) => p !== "lib/contact.ts" && /\bconst UA\s*[:=]/.test(read(p)));
check("no module defines a User-Agent of its own: the 24 that wrote one import lib/contact.ts's", ownUA.length === 0, ownUA.join(", "));
const importers = code.filter((p) => p !== "scripts/check-contact.ts" && /import \{[^}]*\bUA\b[^}]*\} from "(?:\.\.?\/)+(?:lib\/)?contact";/.test(read(p)));
check("  …37 files read it, the release rules, EDGAR, Wikipedia, Wikidata and the rest among them, the Justice archive's (batch 94), EPA's (batch 95), the CPSC's (batch 96), the CFTC's (batch 97), the Board's 1996–2005 orders' (batch 99), EDGAR's 1993–1996 indexes' (batch 102), the FDA's approvals workbook (batch 105) Drugs@FDA's file (batch 115), the FRA's accident reports (batch 127), MSHA's files (batch 134) and the FDA's warning-letter list (batch 140)",
  importers.length === 37 && ["lib/fdaWarningLetters.ts", "lib/mineAccidents.ts", "lib/railAccidents.ts", "lib/sec.ts", "lib/secCases.ts", "lib/doj.ts", "lib/dojArchive.ts", "lib/epaCases.ts", "lib/cpscRecalls.ts", "lib/cftc.ts", "lib/cfpb.ts", "lib/wiki.ts", "lib/wikidata.ts", "scripts/sync-tickers.ts", "scripts/sync-fed-orders.ts", "scripts/sync-digest-records.ts", "scripts/sync-fda-approvals.ts", "scripts/sync-fda-supplements.ts"].every((p) => importers.includes(p)),
  `${importers.length}`);
const literal = code.filter((p) => /"User-Agent":\s*"News Charts/.test(read(p)));
check("  …and none writes the client's name into a header by hand", literal.length === 0, literal.join(", "));
const addresses = code.flatMap((p) => (read(p).match(ADDRESS) ?? []).filter((a) => !ALLOWED.test(a)).map((a) => `${p}: ${a}`));
check("no email address is written in the code, the stand-ins on example.org aside", addresses.length === 0, addresses.slice(0, 5).join("; "));
const prose = tracked("README.md", "CLAUDE.md", "docs", ".env.example").filter((p) => /\.(?:md|json|example)$/.test(p) || p === ".env.example");
const personal = prose.filter((p) => PERSONAL.test(read(p)));
check("no personal mailbox's address in the docs, the work log or the reports", personal.length === 0, personal.join(", "));
check("the setting is documented where the owner sets things: .env.example, README and OWNER-ACTIONS",
  /^# NEWS_CHARTS_CONTACT=builds@example\.org$/m.test(read(".env.example")) && /NEWS_CHARTS_CONTACT/.test(read("README.md")) && /NEWS_CHARTS_CONTACT/.test(read("docs/OWNER-ACTIONS.md")));

console.log(`\n${pass}/${pass + fail} checks passed`);
if (fail) process.exit(1);
