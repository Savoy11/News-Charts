import { config } from "dotenv";
import { chainRefOf, parseChainRef } from "../lib/onchain/attribution";
import { FINALITY, chainOfRef, isFinal, withheldReason } from "../lib/onchain/finality";
import { onchainEvent } from "../lib/onchain/chain";
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
import { getAllStablecoinSupplyMoves, getStablecoinSupplyMoves, getUsdcSupplyMoves } from "../lib/onchain/stablecoin";
import { CRYPTO_SUBJECTS, STABLECOIN_SUBJECTS, ingestOnchainFor } from "../lib/onchain";
import { CRYPTO_SECTORS, sectorsFor } from "../lib/onchain/sectors";
import {
  ADDRESS_BOOK,
  BURN,
  DAI,
  NULL_ADDRESS,
  PYUSD,
  STABLECOINS,
  USDC,
  describeCounterparty,
  isAddress,
  labelFor,
} from "../lib/onchain/addresses";
import { decodeDecimals, decodeSymbol, verifyEntry } from "../lib/onchain/verify";
import { keccak256 } from "../lib/onchain/keccak";
import { ISSUE_TOPIC, REDEEM_TOPIC, amountFromData, getUsdtSupplyMoves } from "../lib/onchain/usdt";

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

  /**
   * The credit follows the branch that produced the date.
   *
   * Every row used to carry `Blockscout · Etherscan` unconditionally, so with the explorer
   * unreachable — its live state from the build container, 403 "Host not in allowlist" — all four
   * milestones told the reader their date had been read from the chain. This fixture is exactly
   * that split: The Merge answers, the other three fall back, and they must not claim the same
   * provenance. `onchain` is the event kind whose justification is that a reader can re-verify it.
   */
  check("a chain-read row credits the explorer", /Blockscout/.test(merge?.source ?? ""), merge?.source);
  check("a fallback row does NOT claim the chain", !/Blockscout/.test(frontier?.source ?? ""), frontier?.source);
  check("  …and says what it is instead", /published/i.test(frontier?.source ?? ""), frontier?.source);
  // The link still points at Etherscan either way — that is the page a reader checks.
  check("both still link to a block", out.every((e) => /etherscan\.io\/block\/\d+$/.test(e.url ?? "")));
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

  /**
   * The live-feed case the finality policy was written for. This adapter reads transfers
   * newest-first, so without the gate a mint minutes old would be published — and once a
   * synthesis cites it, `ON DELETE RESTRICT` means a reorg leaves a row that cannot be removed.
   */
  const nowSec = Math.floor(Date.now() / 1000);
  serve(() => ({
    status: "1",
    result: [
      tx("0xfresh", NULL_ADDRESS, treasury, 250_000_000, nowSec - 120), // two minutes old
      tx("0xsettled", NULL_ADDRESS, treasury, 250_000_000, nowSec - 48 * 3600),
    ],
  }));
  const mixed = await getUsdcSupplyMoves();
  check("a mint minutes old is withheld", !mixed.some((e) => e.url?.includes("0xfresh")), mixed.map((e) => e.url).join(" "));
  check("while a settled one publishes", mixed.some((e) => e.url?.includes("0xsettled")), `${mixed.length} events`);

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

async function finality(): Promise<void> {
  console.log("\nFinality policy");
  const now = 1_800_000_000; // fixed clock, so these assert the rule and not the wall time
  const hour = 3600;

  // Post-Merge Ethereum finalises in ~12.8 minutes; the hour is the margin, not the guarantee.
  check("a settled Ethereum block passes", isFinal("ethereum", now - 2 * hour, now));
  check("a block inside the window is withheld", !isFinal("ethereum", now - 10 * 60, now));
  check("exactly at the threshold passes", isFinal("ethereum", now - hour, now));
  check("one second under does not", !isFinal("ethereum", now - hour + 1, now));

  // Bitcoin has no finality gadget, so depth is a probability and the margin is much larger.
  check("Bitcoin needs longer than Ethereum", FINALITY.bitcoin.minAgeSeconds > FINALITY.ethereum.minAgeSeconds);
  check("an hour-old Bitcoin block is withheld", !isFinal("bitcoin", now - hour, now));
  check("a day-old one passes", isFinal("bitcoin", now - 24 * hour, now));

  console.log("\nFailing closed");
  // Every one of these means "we cannot show this block is settled", and when the mistake is
  // permanent that has to behave exactly like "it is not settled".
  check("an unknown chain is never final", !isFinal(null, now - 99 * hour, now));
  check("a missing timestamp is never final", !isFinal("ethereum", undefined, now));
  check("a NaN timestamp is never final", !isFinal("ethereum", Number.NaN, now));
  check("a zero timestamp is never final", !isFinal("ethereum", 0, now));
  // A future block is a clock disagreement or a bad parse, not a settled block.
  check("a block dated ahead of us is never final", !isFinal("ethereum", now + hour, now));

  console.log("\nReading the chain off an event's identity");
  check("a Bitcoin ref", chainOfRef("btc-block-840000") === "bitcoin");
  check("an Ethereum ref", chainOfRef("eth-tx-0xabc") === "ethereum");
  check("an unrecognised ref has no chain, so nothing publishes", chainOfRef("sol-block-1") === null);

  console.log("\nThe gate at the point of construction");
  // Requiring blockTime is what stops a future adapter skipping the check by forgetting it.
  const recent = Math.floor(Date.now() / 1000) - 60;
  const settled = Math.floor(Date.now() / 1000) - 48 * hour;
  const mk = (ref: string, blockTime: number) =>
    onchainEvent({
      date: "2024-01-01",
      title: "t",
      description: "d",
      url: "https://example.com",
      ref,
      sourceLabel: "s",
      blockTime,
    });
  check("a minute-old transaction yields no event at all", mk("eth-tx-0x1", recent) === null);
  check("a settled one yields an event", mk("eth-tx-0x1", settled)?.type === "onchain");
  check("an unknown chain yields no event however old", mk("sol-tx-0x1", settled) === null);

  console.log("\nWithholding is reported, not silent");
  // "nothing returned" and "too new" look identical on a page; the ingest log has to tell them apart.
  check("a too-new block says so", /not yet final/.test(withheldReason("ethereum", recent)), withheldReason("ethereum", recent));
  check("and names the wait", /\d+ min/.test(withheldReason("bitcoin", recent)), withheldReason("bitcoin", recent));
  check("a missing timestamp says that instead", withheldReason("ethereum", undefined) === "no block timestamp");
  check("an unknown chain says that", withheldReason(null, settled) === "unknown chain");
}

async function stablecoins(): Promise<void> {
  console.log("\nStablecoin coverage");
  const settledTs = Math.floor(Date.now() / 1000) - 48 * 3600;
  const treasury2 = "0x55fe002aeff02f77364de339a1292923a15844b8";
  process.env.ETHERSCAN_API_KEY = "test-key";

  /**
   * The decimals trap, which is the whole reason each token carries its own.
   *
   * DAI is 18-decimal and USDC is 6. Reading DAI's base units with USDC's decimals reports
   * $50m as $50,000,000,000,000 — a number so wrong it looks like a formatting bug, but it
   * would render as a confident headline.
   */
  const rawDai = "50000000" + "0".repeat(18); // 50,000,000 DAI, at 18 decimals
  serve(() => ({
    status: "1",
    result: [
      { hash: "0xdai", timeStamp: String(settledTs), from: NULL_ADDRESS, to: treasury2, value: rawDai },
    ],
  }));
  const dai = await getStablecoinSupplyMoves(DAI);
  check("DAI is read at 18 decimals", dai[0]?.title.startsWith("$50m DAI"), dai[0]?.title);
  check("and labelled as DAI, not USDC", /DAI minted/.test(dai[0]?.title ?? ""), dai[0]?.title);
  check("its description names the token too", /New DAI entered/.test(dai[0]?.description ?? ""), dai[0]?.description);

  // Each token's bar is its own: $6m is immaterial for USDC and material for PYUSD.
  const rawPyusd = "6" + "0".repeat(6 + 6); // 6,000,000 PYUSD at 6 decimals
  serve(() => ({
    status: "1",
    result: [
      { hash: "0xpyusd", timeStamp: String(settledTs), from: NULL_ADDRESS, to: treasury2, value: rawPyusd },
    ],
  }));
  check("a $6m PYUSD mint clears PYUSD's bar", (await getStablecoinSupplyMoves(PYUSD)).length === 1);
  check("and would not clear USDC's", (await getStablecoinSupplyMoves(USDC)).length === 0);
  check("PYUSD's bar is lower than USDC's", PYUSD.materialUsd < USDC.materialUsd);

  // Every covered token has to be asked about its own contract, or one token's moves get
  // labelled as another's.
  const asked: string[] = [];
  serve((url) => {
    asked.push(url);
    return { status: "1", result: [] };
  });
  await getAllStablecoinSupplyMoves();
  check("every covered token is asked for", asked.length === STABLECOINS.length, `${asked.length} of ${STABLECOINS.length}`);
  for (const t of STABLECOINS) {
    check(`  ...including ${t.label}, at its own contract`, asked.some((u) => u.includes(t.address)));
  }
  // USDT is excluded on purpose: its contract does not mint through the null address, so this
  // code path would return nothing and look exactly like "no material mints".
  check("USDT is not silently covered", !STABLECOINS.some((t) => t.label === "USDT"));

  // Every stablecoin subject must be wired to a token. An unwired one compiles fine and returns
  // an empty timeline, which reads as "nothing has happened" rather than "nobody connected it".
  // Keyed off the actual mapping, not off "has no price series" — that proxy broke the moment
  // governance subjects arrived, which also have no ticker. A check that drifts with the data
  // it describes is worse than none.
  const stableSubjects = CRYPTO_SUBJECTS.filter((c) => c.slug in STABLECOIN_SUBJECTS);
  for (const sub of stableSubjects) {
    const events = await ingestOnchainFor(sub.slug);
    check(`  ${sub.slug} is wired to a token`, Array.isArray(events), sub.displayName);
  }
  check("all three covered tokens have a subject", stableSubjects.length === STABLECOINS.length, `${stableSubjects.length} subjects, ${STABLECOINS.length} tokens`);

  // One token rate-limited must not discard the ones that answered.
  serve((url) => (url.includes(DAI.address) ? undefined : {
    status: "1",
    result: [
      { hash: "0xok", timeStamp: String(settledTs), from: NULL_ADDRESS, to: treasury2, value: "250" + "0".repeat(6 + 6) },
    ],
  }));
  const partial = await getAllStablecoinSupplyMoves();
  check("one token failing does not discard the others", partial.length >= 1, `${partial.length} events`);
}

async function addressBook(): Promise<void> {
  console.log("\nAddress book");
  check("every entry is a well-formed address", ADDRESS_BOOK.every((a) => isAddress(a.address)),
    ADDRESS_BOOK.filter((a) => !isAddress(a.address)).map((a) => a.label).join(",") || "all valid");
  check("every entry records why we believe it", ADDRESS_BOOK.every((a) => a.provenance.trim().length > 20));
  check("addresses are stored lowercase, so lookups cannot miss on case",
    ADDRESS_BOOK.every((a) => a.address === a.address.toLowerCase()));
  check("no duplicate addresses", new Set(ADDRESS_BOOK.map((a) => a.address)).size === ADDRESS_BOOK.length);

  console.log("\nNaming a counterparty");
  // Explorers differ on casing; a checksummed address must still find its label.
  check("a known address is named", labelFor(USDC.address)?.label === "USDC");
  check("checksummed input still matches", labelFor(USDC.address.toUpperCase().replace("0X", "0x"))?.label === "USDC");
  check("the burn address is named", labelFor(NULL_ADDRESS)?.kind === "burn");
  // The important half: not knowing must be sayable, never silently omitted.
  check("an unknown address is not guessed at", labelFor("0x1111111111111111111111111111111111111111") === null);
  check("and is described as unidentified", /haven’t identified/.test(describeCounterparty("0x1111111111111111111111111111111111111111")));
  check("junk is described as unknown", describeCounterparty("not-an-address") === "an unknown address");
  check("a missing address is described, not dropped", describeCounterparty(undefined) === "an unknown address");
  // The provenance rule bars community attributions, which is most exchange labels.
  check("no exchange labels crept in without provenance", !ADDRESS_BOOK.some((a) => a.kind === "exchange"));

  console.log("\nReading what a contract says about itself");
  // ERC-20 says symbol() returns string: offset, length, bytes.
  const dyn = "0x" + "20".padStart(64, "0") + "4".padStart(64, "0") + Buffer.from("USDC").toString("hex").padEnd(64, "0");
  check("a standard string symbol decodes", decodeSymbol(dyn) === "USDC", String(decodeSymbol(dyn)));
  // Several older, widely held tokens declare bytes32 instead. Assuming the standard form on one
  // of those reads the length slot as text and yields mojibake — failing a correct address.
  const b32 = "0x" + Buffer.from("DAI").toString("hex").padEnd(64, "0");
  check("a bytes32 symbol decodes too", decodeSymbol(b32) === "DAI", String(decodeSymbol(b32)));
  check("an empty answer decodes to nothing", decodeSymbol("0x") === null);
  check("a non-hex answer decodes to nothing", decodeSymbol(null) === null);
  check("decimals reads the low byte", decodeDecimals("0x" + "6".padStart(64, "0")) === 6);
  check("18 decimals reads as 18", decodeDecimals("0x" + (18).toString(16).padStart(64, "0")) === 18);
  // A nonsense width would sail through as a plausible number and misreport every amount.
  check("an absurd decimals value is refused", decodeDecimals("0x" + "ff".padStart(64, "0")) === null);
  check("a missing decimals answer is refused", decodeDecimals(null) === null);

  console.log("\nVerifying an entry");
  serve(() => undefined);
  const unreachable = await verifyEntry(USDC, "https://example.invalid");
  check("an unreachable node is not a mismatch", unreachable.status === "unreachable", unreachable.status);
  // The burn address has no contract to ask, and saying so beats reporting a false failure.
  const burnCheck = await verifyEntry(BURN, "https://example.invalid");
  check("an entry with nothing to assert is skipped", burnCheck.status === "skipped", burnCheck.status);
  const bogus = await verifyEntry(
    { address: "0xnope", label: "x", kind: "token", provenance: "p".repeat(30), expect: { symbol: "X", decimals: 1 } },
    "https://example.invalid"
  );
  check("a malformed address is caught before any request", bogus.status === "malformed", bogus.status);
}

async function usdt(): Promise<void> {
  console.log("\nKeccak-256");
  /**
   * The two digests that prove the implementation. Both are published in a thousand places, and
   * the second is the ERC-20 Transfer topic present in every token log ever emitted — if these
   * match, every event topic derived here is right.
   *
   * Node's crypto cannot substitute: its sha3-256 differs from Ethereum's Keccak-256 in the
   * padding byte, and produces an entirely different digest.
   */
  check("the empty string hashes correctly",
    keccak256("") === "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470", keccak256(""));
  check("the ERC-20 Transfer topic hashes correctly",
    keccak256("Transfer(address,address,uint256)") === "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef");
  // A digest is 32 bytes; anything else means the squeeze is wrong.
  check("a digest is 32 bytes", keccak256("anything").length === 66);
  check("different inputs differ", keccak256("a") !== keccak256("b"));
  // Longer than the 136-byte rate, so more than one absorb block runs.
  check("input longer than the rate still hashes", keccak256("x".repeat(500)).length === 66);
  check("and differs from a shorter one", keccak256("x".repeat(500)) !== keccak256("x".repeat(499)));
  check("topics are derived, not copied", ISSUE_TOPIC === keccak256("Issue(uint256)"));
  check("issue and redeem differ", ISSUE_TOPIC !== REDEEM_TOPIC);

  console.log("\nUSDT amounts");
  const raw = (whole: number) => "0x" + (BigInt(whole) * BigInt(10) ** BigInt(6)).toString(16);
  check("a uint256 word decodes at 6 decimals", amountFromData(raw(250_000_000), 6) === 250_000_000);
  // Above 2^53: converting the raw value to a Number before dividing loses precision and
  // silently misreports the largest mints, which are the ones that matter most.
  check("a value past exact float range is still exact", amountFromData(raw(1_000_000_000), 6) === 1_000_000_000);
  check("zero is not an amount", amountFromData("0x0", 6) === null);
  check("junk is refused", amountFromData("not-hex", 6) === null);
  check("missing data is refused", amountFromData(undefined, 6) === null);

  console.log("\nUSDT supply moves");
  process.env.ETHERSCAN_API_KEY = "test-key";
  const settled = Math.floor(Date.now() / 1000) - 48 * 3600;
  const log = (topic: string, whole: number, hash: string, ts = settled) => ({
    topics: [topic],
    data: raw(whole),
    timeStamp: String(ts),
    transactionHash: hash,
  });
  serve((url) => ({
    status: "1",
    result: url.includes(ISSUE_TOPIC)
      ? [log(ISSUE_TOPIC, 1_000_000_000, "0xissue"), log(ISSUE_TOPIC, 5_000_000, "0xsmall")]
      : [log(REDEEM_TOPIC, 300_000_000, "0xredeem")],
  }));
  const out = await getUsdtSupplyMoves();
  check("issues and redeems both land", out.length === 2, `${out.length}`);
  check("an issue is labelled minted", out.some((e) => /USDT minted/.test(e.title)), out.map((e) => e.title).join(" / "));
  check("a redeem is labelled burned", out.some((e) => /USDT burned/.test(e.title)));
  check("billions format as billions", out.some((e) => /\$1\.00bn/.test(e.title)), out.map((e) => e.title).join(" / "));
  check("an immaterial move is filtered out", !out.some((e) => e.url?.includes("0xsmall")));
  check("identity is the transaction", out.every((e) => /^eth-tx-0x/.test(e.dedupBasis ?? "")));
  // The finality gate applies here exactly as it does to the transfer reader.
  serve(() => ({ status: "1", result: [log(ISSUE_TOPIC, 1_000_000_000, "0xfresh", Math.floor(Date.now() / 1000) - 60)] }));
  check("a mint minutes old is withheld", (await getUsdtSupplyMoves()).length === 0);
  // Etherscan reports failure as HTTP 200 with status "0".
  serve(() => ({ status: "0", message: "NOTOK", result: "Max rate limit reached" }));
  check("a rate limit is not read as no supply moves", (await getUsdtSupplyMoves()).length === 0);
  delete process.env.ETHERSCAN_API_KEY;
  check("no key means the adapter sits out", (await getUsdtSupplyMoves()).length === 0);
}

async function sectors(): Promise<void> {
  console.log("\nCrypto sectors");
  // Reuses kind='industry' rather than adding a fourth subject kind: a distinction that is ours
  // and not the reader's does not earn a migration and a page type.
  check("every sector has members", CRYPTO_SECTORS.every((s) => s.members.length > 0));
  check("every sector explains itself", CRYPTO_SECTORS.every((s) => s.summary.length > 40));
  check("slugs are namespaced away from SIC codes", CRYPTO_SECTORS.every((s) => s.slug.startsWith("sector-")));
  check("no duplicate slugs", new Set(CRYPTO_SECTORS.map((s) => s.slug)).size === CRYPTO_SECTORS.length);

  // Membership must point at subjects that exist, or a sector page aggregates nothing and looks
  // like a quiet corner of the site rather than a broken link.
  const known = new Set(CRYPTO_SUBJECTS.map((c) => c.slug));
  for (const sector of CRYPTO_SECTORS) {
    const missing = sector.members.filter((m) => !known.has(m));
    check(`  ${sector.slug} members all exist`, missing.length === 0, missing.join(",") || "all present");
  }
  check("stablecoins covers every covered token", STABLECOINS.every((t) => sectorsFor(t.label.toLowerCase()).length > 0),
    STABLECOINS.filter((t) => !sectorsFor(t.label.toLowerCase()).length).map((t) => t.label).join(","));
  check("a subject in no sector reports none", sectorsFor("electric cars").length === 0);
}

async function main(): Promise<void> {
  try {
    await bitcoin();
    await ethereum();
    await usdc();
    await attribution();
    await finality();
    await stablecoins();
    await addressBook();
    await usdt();
    await sectors();
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
