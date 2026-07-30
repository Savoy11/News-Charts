import { ADDRESS_BOOK, isAddress, normaliseAddress, type LabelledAddress } from "./addresses";

/**
 * Asking each contract what it is, so the address book's provenance notes are re-checkable
 * rather than merely written down.
 *
 * A wrong address in the book is a bad failure and a quiet one: it either never matches (a
 * counterparty silently goes unnamed) or matches the wrong contract (an event is filed under the
 * wrong token). Neither shows up on a page as an error. The fix is to ask the chain — a token
 * contract will tell you its own symbol and decimals, and that is an on-chain role rather than
 * an explorer's opinion, which is exactly the standard `addresses.ts` sets for adding an entry.
 *
 * Keyless, via public JSON-RPC. ⚠ Never run from this build container — egress is blocked, so
 * every call fails and the report would read as "cannot verify" for entries that are fine.
 */

/** Public, keyless Ethereum JSON-RPC endpoints. Tried in order, same idiom as the explorers. */
export const RPC_ENDPOINTS = [
  "https://eth.blockscout.com/api/eth-rpc",
  "https://ethereum-rpc.publicnode.com",
  "https://eth.llamarpc.com",
];

/** `symbol()` and `decimals()` — the two ERC-20 selectors this needs. */
const SELECTOR = { symbol: "0x95d89b41", decimals: "0x313ce567" };

interface RpcReply {
  result?: string;
  error?: { message?: string };
}

/** JSON-RPC needs POST, which the shared `getJson` helper does not do — hence the explicit fetch. */
async function ethCall(rpc: string, to: string, data: string): Promise<string | null> {
  try {
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as RpcReply;
    return typeof json.result === "string" ? json.result : null;
  } catch {
    return null;
  }
}

const hexToUtf8 = (hex: string): string =>
  (hex.match(/.{2}/g) ?? [])
    .map((b) => String.fromCharCode(parseInt(b, 16)))
    .join("")
    .replace(/\0+$/, "")
    .trim();

/**
 * Decodes whatever a token returns for `symbol()`.
 *
 * Two encodings are in circulation and both must be read. The ERC-20 standard says `string`,
 * which is ABI-encoded as offset + length + bytes. Several older and widely held tokens declare
 * `bytes32` instead and return the characters padded in a single word. Assuming the standard
 * form on a bytes32 token reads the length slot as text and yields mojibake, which would fail a
 * perfectly correct address.
 */
export function decodeSymbol(raw: string | null): string | null {
  if (!raw || !raw.startsWith("0x")) return null;
  const hex = raw.slice(2);
  if (hex.length === 0) return null;

  // dynamic string: word 0 is the offset (0x20), word 1 the length, then the bytes
  if (hex.length >= 128) {
    const offset = parseInt(hex.slice(0, 64), 16);
    if (offset === 32) {
      const len = parseInt(hex.slice(64, 128), 16);
      if (Number.isFinite(len) && len > 0 && len <= 32) {
        return hexToUtf8(hex.slice(128, 128 + len * 2)) || null;
      }
    }
  }
  // bytes32: a single word of padded characters
  if (hex.length === 64) return hexToUtf8(hex) || null;
  return null;
}

/** `decimals()` returns a uint8, so the value is the last byte of the word. */
export function decodeDecimals(raw: string | null): number | null {
  if (!raw || !raw.startsWith("0x")) return null;
  const n = parseInt(raw.slice(2), 16);
  return Number.isFinite(n) && n >= 0 && n <= 36 ? n : null;
}

export interface AddressCheck {
  entry: LabelledAddress;
  status: "ok" | "mismatch" | "unreachable" | "skipped" | "malformed";
  detail: string;
}

/** Checks one entry against the chain. Entries with nothing to assert are reported as skipped. */
export async function verifyEntry(entry: LabelledAddress, rpc: string): Promise<AddressCheck> {
  if (!isAddress(entry.address)) {
    return { entry, status: "malformed", detail: "not a 20-byte address" };
  }
  if (!entry.expect) {
    return { entry, status: "skipped", detail: "nothing on-chain to assert — provenance is documentary" };
  }
  const to = normaliseAddress(entry.address);
  const [symbolRaw, decimalsRaw] = await Promise.all([
    ethCall(rpc, to, SELECTOR.symbol),
    ethCall(rpc, to, SELECTOR.decimals),
  ]);
  const symbol = decodeSymbol(symbolRaw);
  const decimals = decodeDecimals(decimalsRaw);
  if (symbol === null && decimals === null) {
    return { entry, status: "unreachable", detail: "no answer from the node" };
  }
  const problems: string[] = [];
  if (symbol !== entry.expect.symbol) problems.push(`symbol ${JSON.stringify(symbol)} ≠ ${JSON.stringify(entry.expect.symbol)}`);
  if (decimals !== entry.expect.decimals) problems.push(`decimals ${decimals} ≠ ${entry.expect.decimals}`);
  return problems.length
    ? { entry, status: "mismatch", detail: problems.join("; ") }
    : { entry, status: "ok", detail: `symbol ${symbol}, decimals ${decimals}` };
}

export async function verifyAddressBook(rpc: string): Promise<AddressCheck[]> {
  const out: AddressCheck[] = [];
  for (const entry of ADDRESS_BOOK) out.push(await verifyEntry(entry, rpc));
  return out;
}
