/**
 * Proves the cross-project boundary actually holds.
 *
 *   npm run check:boundary
 *
 * The `Scope & independence` section of docs/MASTER-CHECKLIST.md rules News Charts and
 * Crypto-Stuff / CAEP / Finance Now separate projects — no shared code, no runtime coupling.
 * Prose alone does not hold that line: in Finance-Now-Free, a stale pointer to another
 * checkout survived in the session-orienting doc for the whole life of the project. This is
 * the same protection mirrored here (its `repoBoundary.test.ts`), in this repo's check-script
 * idiom: the machine-checkable half of the boundary, so crossing it takes a deliberate act
 * with a failing check in the way.
 *
 * Offline by construction — reads only files in this repo, no network, no keys.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import * as path from "node:path";

const REPO = path.resolve(__dirname, "..");
const OTHER_PROJECTS = /crypto-stuff|finance-now/i;

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};

// ─── The repo does not reach into another repository ─────────────────────────

function checkNoSubmodules(): void {
  // A submodule is the most direct way a sibling project could end up vendored in
  // here and edited by accident.
  check("no git submodules", !existsSync(path.join(REPO, ".gitmodules")));
}

function checkRemotes(): void {
  // Read git's own config rather than trusting a doc. Skipped only if there is no
  // .git/config at all (e.g. an export), and loudly, so a silent pass cannot be
  // mistaken for a verified one.
  const cfg = path.join(REPO, ".git/config");
  if (!existsSync(cfg)) {
    console.log("  SKIP  no .git/config — remote check not performed");
    return;
  }
  const urls = [...readFileSync(cfg, "utf8").matchAll(/^\s*url\s*=\s*(.+)$/gm)]
    .map((m) => m[1].trim())
    // `url.<base>.insteadOf` rewrite rules are config, not remotes.
    .filter((u) => u.includes("github.com/") && !u.endsWith("github.com/"));
  for (const u of urls) {
    check(
      "remote points at this repository",
      u.toLowerCase().includes("news-charts"),
      u.toLowerCase().includes("news-charts") ? "" : `"${u}" — a session here must not push elsewhere`
    );
  }
  if (urls.length === 0) check("remote points at this repository", false, "no github remote found");
}

function checkWorkflows(): void {
  // actions/checkout takes a `repository:` input; without it a workflow can only
  // check out itself. Any use of it here would be a cross-repo reach.
  const dir = path.join(REPO, ".github/workflows");
  if (!existsSync(dir)) {
    check("no workflow checks out another repository", true, "no workflows exist");
    return;
  }
  for (const f of readdirSync(dir).filter((n) => /\.ya?ml$/.test(n))) {
    const src = readFileSync(path.join(dir, f), "utf8");
    check(`workflow ${f} checks out only itself`, !/^\s*repository:\s*\S/m.test(src));
  }
}

// ─── No shared code ──────────────────────────────────────────────────────────

const SRC_DIRS = ["app", "components", "lib", "db", "scripts"];
const SRC_EXT = /\.(ts|tsx|mjs|js)$/;

function* sourceFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) yield* sourceFiles(p);
    else if (SRC_EXT.test(name)) yield p;
  }
}

function checkImports(): void {
  // "No shared code" made mechanical: no import may resolve above the repo root
  // (which is how a sibling checkout would be reached on disk), and no specifier
  // may name another project.
  const offenders: string[] = [];
  const SPEC = /(?:from\s+|require\(\s*|import\(\s*)["']([^"']+)["']/g;
  for (const dir of SRC_DIRS) {
    const abs = path.join(REPO, dir);
    if (!existsSync(abs)) continue;
    for (const file of sourceFiles(abs)) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(SPEC)) {
        const spec = m[1];
        const rel = path.relative(REPO, file);
        if (OTHER_PROJECTS.test(spec)) offenders.push(`${rel} imports "${spec}"`);
        else if (spec.startsWith(".")) {
          const resolved = path.resolve(path.dirname(file), spec);
          if (path.relative(REPO, resolved).startsWith("..")) {
            offenders.push(`${rel} imports "${spec}" — resolves outside the repo`);
          }
        }
      }
    }
  }
  check("no import escapes the repo or names another project", offenders.length === 0, offenders[0] ?? "");
}

function checkDependencies(): void {
  // A file:/link: dependency (or a git dependency on a sibling repo) is runtime
  // coupling in package.json clothing.
  const pkg = JSON.parse(readFileSync(path.join(REPO, "package.json"), "utf8"));
  const offenders: string[] = [];
  for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
    for (const [name, spec] of Object.entries((pkg[field] ?? {}) as Record<string, string>)) {
      if (/^(file:|link:|portal:)/.test(spec) || OTHER_PROJECTS.test(spec) || OTHER_PROJECTS.test(name)) {
        offenders.push(`${field}.${name}: "${spec}"`);
      }
    }
  }
  check("no dependency reaches another project or the local disk", offenders.length === 0, offenders[0] ?? "");
}

// ─── The docs orient a session to THIS repo ──────────────────────────────────

function checkClaudeMd(): void {
  const p = path.join(REPO, "CLAUDE.md");
  if (!existsSync(p)) {
    check("CLAUDE.md exists", false, "a session here begins with no scope statement");
    return;
  }
  const claude = readFileSync(p, "utf8");

  // The exact drift this guards elsewhere: a session-orienting doc stating a working
  // directory inside ANOTHER project's checkout. Naming a sibling project is fine
  // (the scope rule must); a path into one is not.
  const noStalePath = !/[A-Za-z]:\\Users\\/.test(claude) && !/Crypto-Stuff[\\/]/.test(claude);
  check(
    "CLAUDE.md carries no path into another checkout",
    noStalePath,
    noStalePath ? "" : "an absolute Windows path or Crypto-Stuff/… path is a stale pointer to another project"
  );

  // Deleting the rule should take a deliberate act with a failing check in the way,
  // not be a quiet casualty of an edit.
  check("CLAUDE.md states the scope rule", /Scope rule/i.test(claude) && /[Nn]ever touch/.test(claude));

  // A session that does not know where the work log lives will work from the wrong list.
  check("CLAUDE.md names the master checklist", claude.includes("docs/MASTER-CHECKLIST.md"));

  // And it must name this enforcement, so the next session knows the boundary is
  // tested rather than merely stated.
  check("CLAUDE.md names this check", claude.includes("check:boundary"));
}

function checkMasterChecklist(): void {
  // The prose this whole file makes enforceable must itself still be there.
  const p = path.join(REPO, "docs/MASTER-CHECKLIST.md");
  if (!existsSync(p)) {
    check("MASTER-CHECKLIST.md exists", false);
    return;
  }
  const doc = readFileSync(p, "utf8");
  check(
    "checklist still carries the Scope & independence rule",
    /Scope & independence/.test(doc) && /no shared code/.test(doc) && /runtime coupling/.test(doc)
  );
}

function main(): void {
  console.log("\nRepository boundary\n");
  checkNoSubmodules();
  checkRemotes();
  checkWorkflows();
  console.log("\nNo shared code, no runtime coupling\n");
  checkImports();
  checkDependencies();
  console.log("\nDocs orient a session to this repo\n");
  checkClaudeMd();
  checkMasterChecklist();
  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  if (fail) process.exit(1);
}

main();
