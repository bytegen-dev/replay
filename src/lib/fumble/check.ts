import { fetchRetry, NetError, realSleep, type Fetch, type Sleep } from "./net.ts";

/**
 * A quick look at whether a wallet has any transactions at all, before a scan is started. One small call (the newest signature, if there is
 * one), so a mistyped address or an unused wallet is turned back right away and never takes a scan slot, a rate-limit turn or a history read.
 *
 * "active" means at least one transaction was found, "empty" means the address has none. A failed look says nothing about the wallet, so it
 * throws and the caller lets the scan go ahead.
 */
export type WalletStatus = "active" | "empty";

export interface CheckDeps {
  apiKey: string;
  fetchImpl?: Fetch;
  sleep?: Sleep;
}

export async function lookWallet(wallet: string, deps: CheckDeps): Promise<WalletStatus> {
  const fetchImpl: Fetch = deps.fetchImpl ?? ((u, i) => fetch(u, i));
  const res = await fetchRetry(
    fetchImpl,
    `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(deps.apiKey)}`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [wallet, { limit: 1 }] }) },
    { sleep: deps.sleep ?? realSleep, tries: 2, baseMs: 500 },
  );
  if (!res.ok) throw new NetError(res.status, "mainnet.helius-rpc.com");
  const body = (await res.json()) as { result?: unknown; error?: unknown };
  if (!Array.isArray(body.result)) throw new Error("Helius answered with something other than a list of signatures");
  return body.result.length > 0 ? "active" : "empty";
}

/**
 * The same look, remembered for a while: a wallet that was just looked at (the page checks as someone types, and the scan may ask again) costs
 * one call, not two. An active wallet is kept longer than an empty one, which may get its first transaction at any time. A failure is not
 * remembered, and two asks at the same moment share one call.
 */
export function rememberedLook(look: (wallet: string) => Promise<WalletStatus>, opts: { activeSeconds?: number; emptySeconds?: number; max?: number; now?: () => number } = {}) {
  const activeMs = (opts.activeSeconds ?? 600) * 1000;
  const emptyMs = (opts.emptySeconds ?? 30) * 1000;
  const max = opts.max ?? 1000;
  const now = opts.now ?? Date.now;
  const seen = new Map<string, { at: number; status: WalletStatus | null; promise: Promise<WalletStatus> }>();
  return (wallet: string): Promise<WalletStatus> => {
    const hit = seen.get(wallet);
    if (hit) {
      if (hit.status === null) return hit.promise; // still being looked at
      if (now() - hit.at < (hit.status === "active" ? activeMs : emptyMs)) return hit.promise;
    }
    const entry = { at: now(), status: null as WalletStatus | null, promise: null as unknown as Promise<WalletStatus> };
    entry.promise = look(wallet).then(
      (s) => {
        entry.status = s;
        entry.at = now();
        return s;
      },
      (e) => {
        if (seen.get(wallet) === entry) seen.delete(wallet);
        throw e;
      },
    );
    seen.set(wallet, entry);
    if (seen.size > max) seen.delete(seen.keys().next().value as string); // the oldest goes first
    return entry.promise;
  };
}
