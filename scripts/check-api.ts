/**
 * What the API routes say when the database is down, and where /search sends people (NC-170).
 *
 *   npm run check:api
 *
 * Offline by construction: DATABASE_URL points at a closed local port, so every query fails the
 * way an outage does, without a network or a server. Two failures are guarded. The routes used to
 * answer an outage with the raw pg error and status 200 — naming the database host and port to
 * anyone, and reading as success to anything watching status codes. And the no-JavaScript search
 * built its redirect from the request's own origin, which behind a proxy is localhost.
 */
const SECRET_HOST = "10.255.255.1";
const CLOSED_PORT = "1";
process.env.DATABASE_URL = `postgres://nc:hunter2@127.0.0.1:${CLOSED_PORT}/nc_${SECRET_HOST.replace(/\./g, "_")}`;

import { NextRequest } from "next/server";

// React's `cache` exists only in the server build Next bundles; plain Node's react has none, and
// lib/store/read.ts calls it at import. For one run a pass-through is exactly what cache means.
const react = require("react") as { cache?: <T>(fn: T) => T };
react.cache ??= (fn) => fn;

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

const leaks = (body: string) =>
  ["127.0.0.1", `:${CLOSED_PORT}`, "ECONNREFUSED", "hunter2", SECRET_HOST.replace(/\./g, "_")].filter((s) =>
    body.includes(s)
  );

async function main() {
  // quiet the routes' own server-side logging — that line is meant for the operator, not this report
  const logged: string[] = [];
  const error = console.error;
  console.error = (...args: unknown[]) => logged.push(args.map(String).join(" "));

  const { GET: group } = await import("../app/api/group/route");
  const { GET: signals } = await import("../app/api/signals/route");
  const { GET: search } = await import("../app/search/route");

  for (const [name, handler, path, emptyKey] of [
    ["/api/group", group, "/api/group?tickers=AAPL,MSFT", "events"],
    ["/api/signals", signals, "/api/signals?tickers=AAPL", "signals"],
  ] as const) {
    console.log(`\n${name} during an outage`);
    const res = await handler(new NextRequest(`http://localhost:3000${path}`));
    const text = await res.text();
    check("answers with a 5xx, not 200", res.status >= 500 && res.status < 600, String(res.status));
    check("names nothing about the database", leaks(text).length === 0, leaks(text).join(", ") || text.slice(0, 80));
    let json: Record<string, unknown> = {};
    try {
      json = JSON.parse(text);
    } catch {
      /* checked below */
    }
    check("still JSON the page can read, with an empty list", Array.isArray(json[emptyKey]), text.slice(0, 80));
    check("  …and a plain message the page can show", typeof json.error === "string" && json.error.length > 0);
  }
  check("the detail still reaches the server log", logged.some((l) => l.includes("ECONNREFUSED")), `${logged.length} lines`);

  console.log("\nThe no-JavaScript search redirects relative to where the visitor is");
  // An empty query resolves to "none" without asking anything, so this needs no database.
  const res = await search(new NextRequest("http://localhost:3000/search?q="));
  const location = res.headers.get("location") ?? "";
  check("it redirects", res.status === 307, String(res.status));
  check("to a path, not an origin the server guessed", location === "/", location);

  console.error = error;
  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  process.exit(fail ? 1 : 0); // the pg pool would otherwise keep the process alive
}

main();
