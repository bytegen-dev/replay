import { isWalletAddress } from "./helius.ts";

/**
 * "Use my wallet": reads the address of a wallet the visitor has installed, so a recap is one tap instead of a paste. It only reads the public address:
 * nothing is signed, nothing is sent, and the wallet is disconnected again straight away, so the site keeps no session. The recap itself works from the
 * address alone, as for any pasted address.
 *
 * Wallets are found through the Wallet Standard, the open protocol nearly every Solana wallet (Phantom, Solflare, Backpack, Jupiter, OKX, Coinbase, Glow,
 * Trust and many more) uses to announce itself to a page, so the list is whatever the visitor has, with each wallet's own name and icon. The three biggest
 * also put their own provider on the page, which is read as a fallback for any that did not announce themselves. This does not reach a wallet on another
 * device (a QR code to a phone, WalletConnect): the wallet has to be in this browser, or the page opened in the wallet's own browser.
 */

export interface WalletOption {
  id: string;
  label: string;
  /** The wallet's own icon (a data address), when it gave one. */
  icon?: string;
  /** Connects once, reads the public address and disconnects. Throws WalletCancelled when the visitor says no, and an ordinary error for anything else. */
  read: () => Promise<string>;
}

/** The visitor closed the wallet's prompt or said no. Not a failure: the page says so quietly. */
export class WalletCancelled extends Error {
  constructor() {
    super("Connection cancelled");
  }
}

/** Whether a wallet's error means the visitor said no (the usual code is 4001; some wallets only say so in words). */
function declined(e: unknown): boolean {
  const x = e as { code?: unknown; message?: unknown } | null;
  return x?.code === 4001 || (typeof x?.message === "string" && /reject|declin|cancel|denied|closed/i.test(x.message));
}

/** Runs a wallet's connect, checks what came back is an address, and disconnects either way (a wallet that cannot disconnect does not matter). */
async function readOnce(connect: () => Promise<string>, disconnect?: () => Promise<unknown>): Promise<string> {
  let address = "";
  try {
    address = await connect();
  } catch (e) {
    if (declined(e)) throw new WalletCancelled();
    throw new Error("The wallet did not answer.");
  } finally {
    try {
      await disconnect?.();
    } catch {
      /* already disconnected, or the wallet does not support it: nothing to do */
    }
  }
  if (!isWalletAddress(address)) throw new Error("The wallet did not give an address.");
  return address;
}

/* ------------------------------ the Wallet Standard ------------------------------ */

interface StandardAccount {
  address: string;
}
/** The parts of a Wallet Standard wallet used here. */
export interface StandardWallet {
  name: string;
  icon?: string;
  chains?: readonly string[];
  accounts?: readonly StandardAccount[];
  features: Record<string, unknown>;
}

/** A Wallet Standard wallet as an option, or null when it cannot be connected to or is not a Solana wallet (a wallet that lists no chains is given the benefit of the doubt). */
export function standardOption(w: StandardWallet): WalletOption | null {
  const connect = w.features?.["standard:connect"] as { connect(): Promise<{ accounts?: readonly StandardAccount[] }> } | undefined;
  if (!connect || typeof connect.connect !== "function") return null;
  if (w.chains && w.chains.length > 0 && !w.chains.some((c) => c.startsWith("solana:"))) return null;
  const disconnect = w.features["standard:disconnect"] as { disconnect(): Promise<unknown> } | undefined;
  return {
    id: `standard:${w.name}`,
    label: w.name,
    icon: typeof w.icon === "string" && w.icon.startsWith("data:image/") ? w.icon : undefined,
    read: () =>
      readOnce(
        async () => {
          const res = await connect.connect();
          return (res?.accounts?.[0] ?? w.accounts?.[0])?.address ?? "";
        },
        disconnect ? () => disconnect.disconnect() : undefined,
      ),
  };
}

/* ------------------------------ the biggest three, by their own providers ------------------------------ */

interface InjectedProvider {
  connect(): Promise<unknown>;
  disconnect?(): Promise<unknown>;
  publicKey?: { toString(): string } | null;
}
type Maybe<T> = (T & { isPhantom?: boolean; isSolflare?: boolean; isBackpack?: boolean }) | undefined;

/** What the page can reach: `window`, or a stand-in in tests. */
export type WalletHost = EventTarget & Record<string, unknown>;

/** Phantom, Solflare and Backpack by the provider each puts on the page. A look-alike object that does not name itself is ignored. */
export function legacyWallets(host: Record<string, unknown>): WalletOption[] {
  const one = (id: string, label: string, provider: InjectedProvider): WalletOption => ({
    id: `injected:${id}`,
    label,
    read: () =>
      readOnce(
        async () => {
          // Phantom and Backpack answer with the key; Solflare answers true and puts the key on the provider.
          const res = (await provider.connect()) as { publicKey?: { toString(): string } } | boolean | undefined | null;
          const key = (typeof res === "object" && res ? res.publicKey : undefined) ?? provider.publicKey;
          return key ? key.toString() : "";
        },
        () => provider.disconnect?.() ?? Promise.resolve(),
      ),
  });
  const out: WalletOption[] = [];
  const phantom = ((host.phantom as { solana?: Maybe<InjectedProvider> } | undefined)?.solana ?? (host.solana as Maybe<InjectedProvider>)) as Maybe<InjectedProvider>;
  if (phantom?.isPhantom && typeof phantom.connect === "function") out.push(one("phantom", "Phantom", phantom));
  const solflare = host.solflare as Maybe<InjectedProvider>;
  if (solflare?.isSolflare && typeof solflare.connect === "function") out.push(one("solflare", "Solflare", solflare));
  const backpack = host.backpack as Maybe<InjectedProvider>;
  if (backpack?.isBackpack && typeof backpack.connect === "function") out.push(one("backpack", "Backpack", backpack));
  return out;
}

/* ------------------------------ finding them all ------------------------------ */

/**
 * Listens for wallets and tells `onChange` the full list each time it grows. A page and a wallet find each other with two events: the page announces
 * "wallet-standard:app-ready" (carrying a `register` function) for wallets already waiting, and listens for "wallet-standard:register-wallet" from wallets that load
 * later. Wallets announced both ways, and the three that also have their own provider, appear once, by name. `refresh` looks again for providers that put
 * themselves on the page late. Returns what stops the listening.
 */
export function watchWallets(host: WalletHost, onChange: (wallets: WalletOption[]) => void): { refresh: () => void; stop: () => void } {
  const standard: StandardWallet[] = [];
  let stopped = false;
  const list = (): WalletOption[] => {
    const seen = new Set<string>();
    const out: WalletOption[] = [];
    for (const o of [...standard.map(standardOption), ...legacyWallets(host)]) {
      if (!o) continue;
      const key = o.label.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(o);
    }
    return out;
  };
  const refresh = () => {
    if (!stopped) onChange(list());
  };
  const api = {
    register(...wallets: StandardWallet[]) {
      standard.push(...wallets);
      refresh();
      return () => {
        for (const w of wallets) {
          const i = standard.indexOf(w);
          if (i >= 0) standard.splice(i, 1);
        }
        refresh();
      };
    },
  };
  const onRegister = (e: Event) => {
    const callback = (e as CustomEvent).detail;
    if (typeof callback !== "function") return;
    try {
      callback(api);
    } catch {
      /* one wallet failing to register is no reason to lose the others */
    }
  };
  host.addEventListener("wallet-standard:register-wallet", onRegister);
  try {
    host.dispatchEvent(new CustomEvent("wallet-standard:app-ready", { detail: api }));
  } catch {
    /* no CustomEvent here: only the providers can be found */
  }
  // The first look is a tick later, so the caller is not told before it is ready to be.
  setTimeout(refresh, 0);
  return {
    refresh,
    stop: () => {
      stopped = true;
      host.removeEventListener("wallet-standard:register-wallet", onRegister);
    },
  };
}
