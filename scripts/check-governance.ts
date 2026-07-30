import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * Snapshot governance, against canned responses.
 *
 *   npm run check:governance
 *
 * Nearly all of this is aimed at `tally`. Saying a proposal "passed" when it was rejected is the
 * worst thing this adapter can do — a governance timeline is a record of what a protocol
 * decided, and inverting one is worse than missing all of them. The trap is that Snapshot
 * choices are free text in no fixed order, so the obvious `scores[0] > scores[1]` reading is
 * wrong for any space that lists "Against" first.
 *
 * ⚠ Payload shape comes from Snapshot's published GraphQL schema; egress is blocked here, so
 * these prove the parsing, not the endpoint.
 */
import { GOVERNANCE_SPACES, fetchGovernance, tally } from "../lib/onchain/governance";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

const realFetch = globalThis.fetch;
function serve(body: unknown, status = 200): void {
  globalThis.fetch = (async () =>
    ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response) as typeof fetch;
}

console.log("\nReading a tally");
check("a clear For wins", tally(["For", "Against"], [900, 100])?.outcome === "passed");
check("a clear Against wins", tally(["For", "Against"], [100, 900])?.outcome === "rejected");
// The trap: not every space lists For first, so position must not decide the outcome.
check(
  "order does not decide the outcome",
  tally(["Against", "For"], [900, 100])?.outcome === "rejected",
  tally(["Against", "For"], [900, 100])?.outcome
);
check("Yes/No wording works", tally(["Yes", "No"], [10, 5])?.outcome === "passed");
check("Yae/Nay wording works", tally(["Yae", "Nay"], [5, 10])?.outcome === "rejected");
check("the winning option is reported", tally(["For", "Against"], [900, 100])?.winning === "For");

console.log("\nWhen there is a winner but no pass or fail");
// A multi-option proposal has a winner and no verdict. Asserting one would invent a result.
const multi = tally(["Option A", "Option B", "Abstain"], [10, 50, 5]);
check("a multi-option vote is 'decided', not passed", multi?.outcome === "decided", multi?.outcome);
check("and names what won", multi?.winning === "Option B", multi?.winning);
check("abstain winning is also just 'decided'", tally(["For", "Against", "Abstain"], [1, 2, 90])?.outcome === "decided");

console.log("\nWhen there is nothing to report");
check("a tie has no winner", tally(["For", "Against"], [500, 500]) === null);
check("no votes at all is not a decision", tally(["For", "Against"], [0, 0]) === null);
check("mismatched choices and scores are refused", tally(["For", "Against"], [1]) === null);
check("missing data is refused", tally(undefined, undefined) === null);
check("empty choices are refused", tally([], []) === null);

async function main(): Promise<void> {
  console.log("\nBuilding events");
  const closed = (id: string, title: string, choices: string[], scores: number[]) => ({
    id, title, choices, scores, scores_total: scores.reduce((a, b) => a + b, 0),
    end: 1_700_000_000, state: "closed", space: { id: "aave.eth" },
  });
  serve({
    data: {
      proposals: [
        closed("0xaaa", "Onboard wstETH as collateral", ["For", "Against"], [800, 20]),
        closed("0xbbb", "Reduce the reserve factor", ["For", "Against"], [20, 800]),
        // still open: nothing has been decided yet
        { ...closed("0xccc", "Live one", ["For", "Against"], [1, 1]), state: "active" },
        // no quorum — a tally we cannot read
        closed("0xddd", "Untouched", ["For", "Against"], [0, 0]),
      ],
    },
  });
  const r = await fetchGovernance(GOVERNANCE_SPACES[1]);
  check("closed, decided proposals become events", r.events.length === 2, `${r.events.length}`);
  check("outcome is ok", r.outcome === "ok", r.outcome);
  check("a passed proposal says passed", /governance passed/.test(r.events.find((e) => e.externalId === "0xaaa")?.title ?? ""), r.events[0]?.title);
  check("a rejected one says rejected", /governance rejected/.test(r.events.find((e) => e.externalId === "0xbbb")?.title ?? ""));
  check("an open proposal is not an event", !r.events.some((e) => e.externalId === "0xccc"));
  check("an unvoted proposal is not an event", !r.events.some((e) => e.externalId === "0xddd"));

  const one = r.events[0];
  check("dated to when voting closed", one?.date === "2023-11-14", one?.date);
  // The distinction the separate kind exists for.
  check("filed as governance, never onchain", r.events.every((e) => e.type === "governance"));
  check("and the copy says the vote is off-chain", /signed off-chain/.test(one?.description ?? ""), one?.description);
  check("identity is Snapshot's proposal id", one?.dedupBasis === "snapshot:0xaaa", one?.dedupBasis);
  check("links to the proposal", one?.url?.includes("/aave.eth/proposal/0xaaa") === true, one?.url);

  console.log("\nWhen Snapshot can't answer");
  // GraphQL reports failure with HTTP 200 and an errors array — the same trap Etherscan sets.
  serve({ errors: [{ message: "unknown field" }] });
  check("a GraphQL error is an error, not an empty result", (await fetchGovernance(GOVERNANCE_SPACES[0])).outcome === "error");
  serve({ data: { proposals: [] } });
  check("genuinely nothing is empty", (await fetchGovernance(GOVERNANCE_SPACES[0])).outcome === "empty");
  serve({}, 429);
  check("a 429 is throttled", (await fetchGovernance(GOVERNANCE_SPACES[0])).outcome === "throttled");
  serve({}, 500);
  check("a 500 is an error", (await fetchGovernance(GOVERNANCE_SPACES[0])).outcome === "error");
  globalThis.fetch = (async () => { throw new Error("down"); }) as typeof fetch;
  check("a thrown request is an error, not a crash", (await fetchGovernance(GOVERNANCE_SPACES[0])).outcome === "error");

  console.log("\nSpaces");
  check("every space records why we believe it", GOVERNANCE_SPACES.every((g) => g.provenance.length > 20));
  check("every space has a subject slug", GOVERNANCE_SPACES.every((g) => g.slug.trim().length > 0));
  check("no duplicate spaces", new Set(GOVERNANCE_SPACES.map((g) => g.space)).size === GOVERNANCE_SPACES.length);

  globalThis.fetch = realFetch;
}

main().then(() => {
console.log(`\n${pass}/${pass + fail} checks passed\n`);
if (fail) process.exit(1);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
