import { config } from "dotenv";
import { chainRefOf, parseChainRef } from "../lib/onchain/attribution";
config({ path: ".env.local" });

/**
 * On-chain adapters, against canned explorer responses.
 *
 *   npm run check:onchain
 *
 * `fetch` is replaced with a fixture server, so this needs no keys, no network, and no chain
 * access — which matters because the parsing is where these adapters can silently go wrong.
 * A halving dated from the wrong field, USDC read with 18 decimals instead of 6, or a dedup
 * basis that includes a re-wordable title would all pass a type check and a build.
 */
import { getBitcoinHalvings } from "../lib/onchain/bitcoin";
import { getEthereumMilestones } from "../lib/onchain/ethereum";
import { getUsdcSupplyMoves } from "../lib/onchain/stablecoin";
import { NULL_ADDRESS } from "../lib/onchain/addresses";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

const realFetch = globalThis.fetch;
type Route = (url: string) => unknown | undefined;

function serve(route: Route): void {
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input);
    const body = route(url);
    if (body === undefined) return { ok: false, status: 404, text: async () => "not found" } as unknown as Response;
    return {
      ok: true,
      status: 200,
      text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
      json: async () => body,
    } as unknown as Response;
  }) as typeof fetch;
}

// Real heights and real timestamps for the first four halvings.
const HALVINGS: Record<number, { hash: string; timestamp: number; day: string }> = {
  210000: { hash: "a".repeat(64), timestamp: 1354116278, day: "2012-11-28" },
  420000: { hash: "b".repeat(64), timestamp: 1468082773, day: "2016-07-09" },
  630000: { hash: "c".repeat(64), timestamp: 1589225023, day: "2020-05-11" },
  840000: { hash: "d".repeat(64), timestamp: 1713571767, day: "2024-04-20" },
};

async function bitcoin() {
  console.log("\nBitcoin halvings");
  serve((url) => {
    const byHeight = url.match(/block-height\/(\d+)/);
    if (byHeight) return HALVINGS[Number(byHeight[1])]?.hash; // unknown height → 404 → stop
    const byHash = url.match(/block\/([0-9a-f]{64})/i);
    if (byHash) {
      const hit = Object.values(HALVINGS).find((h) => h.hash === byHash[1]);
      return hit && { timestamp: hit.timestamp };
    }
    return undefined;
  });

  const out = await getBitcoinHalvings();
  check("finds exactly the mined halvings", out.length === 4, `${out.length}`);
  check("dates come from the block, not a constant", out[0]?.date === HALVINGS[210000].day, out[0]?.date);
  check("last halving dated from its block", out[3]?.date === HALVINGS[840000].day, out[3]?.date);
  check(
    "reward arithmetic is exact",
    out[3]?.title.includes("3.125 BTC") && out[0]?.title.includes("25 BTC"),
    out[3]?.title
  );
  check("no float noise in the reward", !out.some((e) => /\d\.\d{9,}/.test(e.title)));
  check("kind is onchain", out.every((e) => e.type === "onchain"));
  check(
    "dedup basis is the block height, not the title",
    out.every((e) => /^btc-block-\d+$/.test(e.dedupBasis ?? "")),
    out[0]?.dedupBasis
  );
  check("links to a real block", out.every((e) => /\/block\/[0-9a-f]{64}$/i.test(e.url ?? "")));

  // A future halving must not appear just because the arithmetic can compute it.
  const beyond = out.filter((e) => Number(e.dedupBasis?.split("-")[2]) > 840000);
  check("unmined halvings are absent", beyond.length === 0, `${beyond.length} future`);
}

async function ethereum() {
  console.log("\nEthereum milestones");
  serve((url) => {
    const m = url.match(/blocks\/(\d+)/);
    if (!m) return undefined;
    // Blockscout answers with an ISO timestamp; The Merge's real one
    if (m[1] === "15537394") return { timestamp: "2022-09-15T06:42:42.000000Z" };
    return undefined; // everything else unreachable → fallback dates must hold
  });

  const out = await getEthereumMilestones();
  check("all milestones ship", out.length === 4, `${out.length}`);
  const merge = out.find((e) => e.title.includes("Merge"));
  check("chain timestamp wins when reachable", merge?.date === "2022-09-15", merge?.date);
  const frontier = out.find((e) => e.title.includes("Frontier"));
  check("published date holds when the explorer is down", frontier?.date === "2015-07-30", frontier?.date);
  check(
    "identity is the activation block",
    out.every((e) => /^eth-block-\d+$/.test(e.dedupBasis ?? "")),
    merge?.dedupBasis
  );
}

async function usdc() {
  console.log("\nUSDC supply moves");
  const tx = (hash: string, from: string, to: string, usd: number, ts: number) => ({
    hash,
    timeStamp: String(ts),
    from,
    to,
    // 6 decimals — reading this as 18 would under-report by a factor of 10^12.
    // Written as a string, not a BigInt literal: the build targets below ES2020.
    value: `${usd}000000`,
  });
  const treasury = "0x55fe002aeff02f77364de339a1292923a15844b8";

  serve(() => ({
    status: "1",
    result: [
      tx("0x1", NULL_ADDRESS, treasury, 250_000_000, 1_700_000_000), // mint, material
      tx("0x2", treasury, NULL_ADDRESS, 500_000_000, 1_700_100_000), // burn, material
      tx("0x3", NULL_ADDRESS, treasury, 5_000_000, 1_700_200_000), // mint, immaterial
      tx("0x4", treasury, "0xabc", 900_000_000, 1_700_300_000), // huge, but not supply
    ],
  }));

  process.env.ETHERSCAN_API_KEY = "test-key";
  const out = await getUsdcSupplyMoves();
  check("only supply-changing transfers count", out.length === 2, `${out.length}`);
  check("mint is labelled a mint", out.some((e) => e.title.includes("minted")));
  check("burn is labelled a burn", out.some((e) => e.title.includes("burned")));
  check(
    "6 decimals, so $250m reads as $250m",
    out.some((e) => e.title.startsWith("$250m")),
    out.map((e) => e.title).join(" / ")
  );
  check("$500m formats in billions-aware units", out.some((e) => e.title.startsWith("$500m")));
  check("immaterial move is filtered out", !out.some((e) => e.title.includes("$5m")));
  check("identity is the transaction hash", out.every((e) => /^eth-tx-0x/.test(e.dedupBasis ?? "")));

  // Etherscan reports failure as HTTP 200 with status "0" — an empty result must not look like success.
  serve(() => ({ status: "0", message: "NOTOK", result: "Max rate limit reached" }));
  check("an Etherscan error yields nothing, not junk", (await getUsdcSupplyMoves()).length === 0);

  delete process.env.ETHERSCAN_API_KEY;
  check("no key → adapter sits out", (await getUsdcSupplyMoves()).length === 0);
}

async function attribution(): Promise<void> {
  console.log("\nChain attribution");
  // The row shows the block and credits the explorer separately, so the reference has to survive
  // the round trip through the database — the read path used to drop external_id entirely.
  check("a block ref reads back as its chain and height", (() => {
    const r = parseChainRef("btc-block-840000");
    return r?.chain === "Bitcoin" && r.label === "block 840,000";
  })(), JSON.stringify(parseChainRef("btc-block-840000")));
  check("digits are grouped", parseChainRef("eth-block-15537394")?.label === "block 15,537,394", parseChainRef("eth-block-15537394")?.label);
  // Both ends of a hash are what a reader compares against an explorer; the middle is not.
  const hash = "eth-tx-0x1f4c9a2b3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8";
  check("a tx hash is elided in the middle, not truncated",
    parseChainRef(hash)?.label.startsWith("tx 0x1f4c9a") === true && parseChainRef(hash)!.label.endsWith("c6d7e8"),
    parseChainRef(hash)?.label);
  check("a short hash is left alone", parseChainRef("eth-tx-0xabc123")?.label === "tx 0xabc123");
  check("an unknown chain has no attribution to show", parseChainRef("sol-block-1") === null);
  check("a malformed height is refused, not printed", parseChainRef("btc-block-eight") === null);
  check("a malformed hash is refused", parseChainRef("eth-tx-nothex") === null);
  check("nothing in, nothing out", parseChainRef(undefined) === null);
  // Only on-chain rows have a chain to point at; a filing's external id is an accession number.
  check("a filing is not given a chain reference", chainRefOf({
    id: "db-1", date: "2026-02-17", type: "filing", title: "10-K", source: "SEC EDGAR",
    externalId: "btc-block-840000",
  }) === null);
  check("an on-chain row is", chainRefOf({
    id: "db-2", date: "2024-04-20", type: "onchain", title: "Halving", source: "mempool.space",
    externalId: "btc-block-840000",
  })?.chain === "Bitcoin");
}

async function main(): Promise<void> {
  try {
    await bitcoin();
    await ethereum();
    await usdc();
    await attribution();
  } finally {
    globalThis.fetch = realFetch;
  }
  console.log(`\n${pass}/${pass + fail} checks passed\n`);
  if (fail) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
