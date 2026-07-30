/**
 * Keccak-256, because an event topic has to be *derived* rather than copied.
 *
 * Reading a contract's logs means filtering on `topic0`, which is the Keccak-256 hash of the
 * event's signature. Writing those 32 bytes down from memory is the worst kind of guess this
 * project can make: a wrong topic matches nothing, and a feed that returns nothing looks exactly
 * like a token that had a quiet month. That is the silent-empty failure the Sources panel exists
 * to expose, and it would be self-inflicted.
 *
 * Node's `crypto` cannot help — its `sha3-256` is the NIST variant, which differs from
 * Ethereum's Keccak-256 in the padding byte and produces an entirely different digest. So the
 * permutation is implemented here, and `npm run check:onchain` pins it against two digests that
 * are published in a thousand places: the empty string, and the ERC-20 `Transfer` topic that
 * appears in every token log ever emitted. If those match, every topic derived here is right.
 *
 * BigInt lanes rather than 32-bit halves: this hashes a handful of short signature strings at
 * startup, so clarity is worth more than speed.
 */

// Constructed rather than written as literals: the build targets below ES2020, where BigInt
// literals are a syntax error. The runtime has BigInt regardless — this is a compiler limit.
const ZERO = BigInt(0);
const ONE = BigInt(1);
const MASK = (ONE << BigInt(64)) - ONE;

const RC: bigint[] = [
  BigInt("0x0000000000000001"), BigInt("0x0000000000008082"), BigInt("0x800000000000808a"), BigInt("0x8000000080008000"),
  BigInt("0x000000000000808b"), BigInt("0x0000000080000001"), BigInt("0x8000000080008081"), BigInt("0x8000000000008009"),
  BigInt("0x000000000000008a"), BigInt("0x0000000000000088"), BigInt("0x0000000080008009"), BigInt("0x000000008000000a"),
  BigInt("0x000000008000808b"), BigInt("0x800000000000008b"), BigInt("0x8000000000008089"), BigInt("0x8000000000008003"),
  BigInt("0x8000000000008002"), BigInt("0x8000000000000080"), BigInt("0x000000000000800a"), BigInt("0x800000008000000a"),
  BigInt("0x8000000080008081"), BigInt("0x8000000000008080"), BigInt("0x0000000080000001"), BigInt("0x8000000080008008"),
];

/** The rho rotation offsets, walked in the pi lane order. */
const PI = [10, 7, 11, 17, 18, 3, 5, 16, 8, 21, 24, 4, 15, 23, 19, 13, 12, 2, 20, 14, 22, 9, 6, 1];
const ROT = [1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 2, 14, 27, 41, 56, 8, 25, 43, 62, 18, 39, 61, 20, 44];

const rotl = (x: bigint, n: number): bigint =>
  ((x << BigInt(n)) | (x >> BigInt(64 - n))) & MASK;

function permute(a: bigint[]): void {
  for (let round = 0; round < 24; round++) {
    // theta
    const c = new Array<bigint>(5);
    for (let x = 0; x < 5; x++) c[x] = a[x] ^ a[x + 5] ^ a[x + 10] ^ a[x + 15] ^ a[x + 20];
    for (let x = 0; x < 5; x++) {
      const d = c[(x + 4) % 5] ^ rotl(c[(x + 1) % 5], 1);
      for (let y = 0; y < 25; y += 5) a[x + y] ^= d;
    }
    // rho + pi, as the standard 24-step lane walk
    let last = a[1];
    for (let i = 0; i < 24; i++) {
      const j = PI[i];
      const tmp = a[j];
      a[j] = rotl(last, ROT[i]);
      last = tmp;
    }
    // chi
    for (let y = 0; y < 25; y += 5) {
      const row = [a[y], a[y + 1], a[y + 2], a[y + 3], a[y + 4]];
      for (let x = 0; x < 5; x++) a[y + x] = row[x] ^ (~row[(x + 1) % 5] & row[(x + 2) % 5]) & MASK;
    }
    // iota
    a[0] ^= RC[round];
  }
}

/** Rate for Keccak-256: 1600 − 2×256 bits = 136 bytes. */
const RATE = 136;

export function keccak256(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;

  // Ethereum's Keccak pads with 0x01, where NIST SHA3-256 pads with 0x06. One byte, entirely
  // different digest — this is the line that makes Node's built-in unusable here.
  const padded = new Uint8Array(Math.ceil((bytes.length + 1) / RATE) * RATE);
  padded.set(bytes);
  padded[bytes.length] = 0x01;
  padded[padded.length - 1] |= 0x80;

  const state = new Array<bigint>(25).fill(ZERO);
  for (let offset = 0; offset < padded.length; offset += RATE) {
    for (let i = 0; i < RATE / 8; i++) {
      let lane = ZERO;
      // little-endian lanes
      for (let b = 7; b >= 0; b--) lane = (lane << BigInt(8)) | BigInt(padded[offset + i * 8 + b]);
      state[i] ^= lane;
    }
    permute(state);
  }

  let out = "";
  for (let i = 0; i < 4; i++) {
    let lane = state[i];
    for (let b = 0; b < 8; b++) {
      out += (lane & BigInt(0xff)).toString(16).padStart(2, "0");
      lane >>= BigInt(8);
    }
  }
  return `0x${out}`;
}

/** The `topic0` a log filter matches on, for an event signature like `Issue(uint256)`. */
export const topicFor = (signature: string): string => keccak256(signature);
