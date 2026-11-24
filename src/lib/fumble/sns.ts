import { createHash } from "node:crypto";
import { solName } from "./solName.ts";

export { solName };

/**
 * Turns a Solana name (`bytegen.sol`) into the wallet that owns it, with no library: a name is an account at an address worked out from the
 * name alone, and the owner is written in the first bytes of that account. So the address is derived here and the account read through the
 * ordinary Solana RPC (Helius).
 *
 *   address = the program-derived address, under the name program, of [sha256("SPL Name Service" + name), 32 zero bytes, the .sol parent]
 *   account = 32 bytes parent, 32 bytes owner, 32 bytes class, then the name's data
 *
 * A name that has been turned into an NFT (tokenised) shows the NFT program as its owner here, not the person holding it; that case is
 * not followed.
 */

const NAME_PROGRAM = "namesLPneVptA9Z5rqUDD9tMTWEJwofgaYwp8cawRkX";
const SOL_PARENT = "58PwtjSDuFHuUkYjH9BYnnQKHfwo9reZhC2zMJv9JPkx";
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function base58Decode(s: string): Uint8Array {
  let n = BigInt(0);
  for (const ch of s) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error("not base58");
    n = n * BigInt(58) + BigInt(i);
  }
  const bytes: number[] = [];
  while (n > BigInt(0)) {
    bytes.unshift(Number(n & BigInt(0xff)));
    n >>= BigInt(8);
  }
  const zeros = s.length - s.replace(/^1+/, "").length;
  return Uint8Array.from([...new Array<number>(zeros).fill(0), ...bytes]);
}

export function base58Encode(bytes: Uint8Array): string {
  let n = BigInt(0);
  for (const b of bytes) n = (n << BigInt(8)) | BigInt(b);
  let out = "";
  while (n > BigInt(0)) {
    out = ALPHABET[Number(n % BigInt(58))] + out;
    n /= BigInt(58);
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = "1" + out;
  }
  return out;
}

const P = (BigInt(1) << BigInt(255)) - BigInt(19);
const mod = (a: bigint) => ((a % P) + P) % P;
function pow(base: bigint, exp: bigint): bigint {
  let r = BigInt(1);
  let b = mod(base);
  for (let e = exp; e > BigInt(0); e >>= BigInt(1)) {
    if (e & BigInt(1)) r = mod(r * b);
    b = mod(b * b);
  }
  return r;
}
const D = mod(-BigInt(121665) * pow(BigInt(121666), P - BigInt(2)));

/** Whether 32 bytes are a point on the ed25519 curve (a real public key). A program-derived address must not be one. */
export function onCurve(bytes: Uint8Array): boolean {
  let y = BigInt(0);
  for (let i = 31; i >= 0; i--) y = (y << BigInt(8)) | BigInt(i === 31 ? bytes[i] & 0x7f : bytes[i]);
  y = mod(y);
  const u = mod(y * y - BigInt(1));
  const v = mod(D * y * y + BigInt(1));
  if (v === BigInt(0)) return false;
  const x2 = mod(u * pow(v, P - BigInt(2)));
  if (x2 === BigInt(0)) return true;
  return pow(x2, (P - BigInt(1)) / BigInt(2)) === BigInt(1); // a square has an x
}

/** The address a program derives from its seeds (the first bump, counting down from 255, that lands off the curve). */
export function findProgramAddress(seeds: Uint8Array[], program: Uint8Array): Uint8Array {
  for (let bump = 255; bump >= 0; bump--) {
    const h = createHash("sha256");
    for (const s of seeds) h.update(s);
    h.update(Uint8Array.of(bump));
    h.update(program);
    h.update("ProgramDerivedAddress");
    const candidate = new Uint8Array(h.digest());
    if (!onCurve(candidate)) return candidate;
  }
  throw new Error("no address found");
}

/** The address of the account that holds a `.sol` name (without the `.sol`). */
export function nameAccount(name: string): string {
  const hashed = new Uint8Array(createHash("sha256").update("SPL Name Service" + name).digest());
  return base58Encode(findProgramAddress([hashed, new Uint8Array(32), base58Decode(SOL_PARENT)], base58Decode(NAME_PROGRAM)));
}

export interface ResolveOptions {
  apiKey: string;
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
}

/** The wallet that owns `name.sol`, or null when there is no such name. Throws when the RPC itself failed (with nothing in the message that names the key). */
export async function resolveSol(name: string, opts: ResolveOptions): Promise<string | null> {
  const fetchImpl = opts.fetchImpl ?? ((u, i) => fetch(u, i));
  const res = await fetchImpl(`https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(opts.apiKey)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getAccountInfo", params: [nameAccount(name), { encoding: "base64" }] }),
  });
  if (!res.ok) throw new Error(`name lookup failed (${res.status})`);
  const j = (await res.json()) as { result?: { value?: { data?: [string, string]; owner?: string } | null }; error?: unknown };
  if (j.error) throw new Error("name lookup failed");
  const value = j.result?.value;
  if (!value || value.owner !== NAME_PROGRAM || !value.data) return null;
  const data = Buffer.from(value.data[0], "base64");
  if (data.length < 64) return null;
  return base58Encode(new Uint8Array(data.subarray(32, 64)));
}
