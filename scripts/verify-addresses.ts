import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * Ask each contract in the address book what it is.
 *
 *   npm run verify:addresses
 *
 * **Run this on a networked machine, not in CI here.** Egress is blocked from the build
 * container, so every entry would report "unreachable" — which looks like a finding and is not.
 *
 * The point is that a wrong address fails quietly. It either never matches, so a counterparty
 * silently goes unnamed, or it matches the wrong contract, so events are filed under the wrong
 * token. Neither surfaces on a page. Asking the contract for its own symbol and decimals is an
 * on-chain role rather than an explorer's opinion, which is the standard `addresses.ts` sets for
 * believing an address in the first place.
 */
import { RPC_ENDPOINTS, verifyAddressBook } from "../lib/onchain/verify";

const MARK = { ok: "✓", mismatch: "✗", unreachable: "…", skipped: "–", malformed: "✗" } as const;

async function main(): Promise<void> {
  const rpc = process.argv[2] ?? RPC_ENDPOINTS[0];
  console.log(`\nVerifying the address book against ${rpc}\n`);

  const results = await verifyAddressBook(rpc);
  for (const r of results) {
    console.log(
      `  ${MARK[r.status]} ${r.entry.label.padEnd(20)} ${r.entry.address}  ${r.detail}`
    );
  }

  const count = (s: string) => results.filter((r) => r.status === s).length;
  const bad = count("mismatch") + count("malformed");
  const verified = count("ok");

  // Counted separately, because "skipped" is not "verified". Folding the two together would let
  // a run where nothing was actually checked report a clean bill of health — the exact
  // overstatement this script exists to prevent elsewhere.
  console.log(
    `\n  ${verified} verified · ${bad} disagreeing · ${count("unreachable")} unreachable · ` +
      `${count("skipped")} with nothing on-chain to assert`
  );

  if (bad > 0) {
    console.log(`\n  Fix the book, not the chain.\n`);
    process.exit(1);
  }
  if (verified === 0) {
    console.log(
      `\n  Nothing was actually verified. That is usually this network rather than the address\n` +
        `  book — try another endpoint:\n` +
        RPC_ENDPOINTS.map((e) => `    npm run verify:addresses ${e}`).join("\n") +
        "\n"
    );
    process.exit(0);
  }
  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
