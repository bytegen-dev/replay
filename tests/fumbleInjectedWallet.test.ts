import assert from "node:assert/strict";
import { test } from "node:test";
import { legacyWallets, standardOption, watchWallets, WalletCancelled, type StandardWallet, type WalletHost, type WalletOption } from "../src/lib/fumble/injectedWallet.ts";

const ADDRESS = "DfMxre4cKmvogbLrPigxmibVTTQDuzjdXojWzjCXXhzj";
const tick = () => new Promise((r) => setTimeout(r, 5));

/** A Wallet Standard wallet that counts what is asked of it. */
function standard(over: Partial<StandardWallet> & { connect?: () => Promise<unknown>; noDisconnect?: boolean } = {}) {
  const calls = { connect: 0, disconnect: 0 };
  const w: StandardWallet = {
    name: "Jupiter",
    icon: "data:image/svg+xml;base64,AAAA",
    chains: ["solana:mainnet"],
    accounts: [],
    features: {
      "standard:connect": {
        async connect() {
          calls.connect++;
          return over.connect ? over.connect() : { accounts: [{ address: ADDRESS }] };
        },
      },
      ...(over.noDisconnect ? {} : { "standard:disconnect": { async disconnect() { calls.disconnect++; } } }),
    },
    ...(over.name ? { name: over.name } : {}),
    ...(over.chains ? { chains: over.chains } : {}),
    ...(over.icon !== undefined ? { icon: over.icon } : {}),
    ...(over.accounts ? { accounts: over.accounts } : {}),
  };
  return { w, calls };
}

test("a Wallet Standard wallet becomes an option with its own name and icon, reads the address and disconnects", async () => {
  const { w, calls } = standard();
  const option = standardOption(w)!;
  assert.deepEqual([option.label, option.icon], ["Jupiter", "data:image/svg+xml;base64,AAAA"]);
  assert.equal(await option.read(), ADDRESS);
  assert.deepEqual(calls, { connect: 1, disconnect: 1 });
  // An icon that is not a picture data address is not used, and the address can come from the wallet's own accounts.
  const odd = standard({ icon: "https://example.com/icon.png", accounts: [{ address: ADDRESS }], connect: async () => ({}) });
  const o = standardOption(odd.w)!;
  assert.equal(o.icon, undefined);
  assert.equal(await o.read(), ADDRESS);
});

test("wallets that are not Solana wallets or cannot be connected to are left out", () => {
  assert.equal(standardOption(standard({ chains: ["eip155:1"] }).w), null);
  assert.notEqual(standardOption(standard({ chains: ["eip155:1", "solana:mainnet"] }).w), null);
  assert.notEqual(standardOption({ name: "No chains listed", features: { "standard:connect": { async connect() { return { accounts: [] }; } } } }), null);
  assert.equal(standardOption({ name: "No connect", chains: ["solana:mainnet"], features: {} }), null);
});

test("saying no is a cancellation, a failure is plain, an answer that is not an address is refused, and a wallet that cannot disconnect is fine", async () => {
  const no = standard({ connect: async () => { throw Object.assign(new Error("User rejected the request."), { code: 4001 }); } });
  await assert.rejects(standardOption(no.w)!.read(), WalletCancelled);
  assert.equal(no.calls.disconnect, 1);
  const broken = standard({ connect: async () => { throw new Error("socket hang up"); } });
  await assert.rejects(standardOption(broken.w)!.read(), (e: unknown) => e instanceof Error && !(e instanceof WalletCancelled));
  const junk = standard({ connect: async () => ({ accounts: [{ address: "hello" }] }) });
  await assert.rejects(standardOption(junk.w)!.read(), /did not give an address/);
  const stuck = standard({ noDisconnect: true });
  assert.equal(await standardOption(stuck.w)!.read(), ADDRESS);
});

test("Phantom, Solflare and Backpack are found by their own providers, and look-alikes are ignored", async () => {
  const provider = (extra: Record<string, unknown> = {}) => ({ async connect() { return { publicKey: { toString: () => ADDRESS } }; }, ...extra });
  const host = { phantom: { solana: { ...provider(), isPhantom: true } }, solflare: { ...provider({ async connect() { return true; }, publicKey: { toString: () => ADDRESS } }), isSolflare: true }, backpack: { ...provider(), isBackpack: true } };
  const found = legacyWallets(host);
  assert.deepEqual(found.map((w) => w.label), ["Phantom", "Solflare", "Backpack"]);
  assert.equal(await found[1].read(), ADDRESS); // Solflare answers true and keeps the key on the provider
  assert.deepEqual(legacyWallets({ solana: { ...provider() }, solflare: { isSolflare: true }, backpack: { ...provider() } }), []);
  assert.deepEqual(legacyWallets({}), []);
});

test("wallets are found whether they were waiting for the page or arrived after it, each once by name", async () => {
  const host = Object.assign(new EventTarget(), {}) as WalletHost;
  const waiting = standard({ name: "Early wallet" });
  // A wallet that loaded first listens for the page to announce itself.
  host.addEventListener("wallet-standard:app-ready", (e) => (e as CustomEvent).detail.register(waiting.w));
  const seen: WalletOption[][] = [];
  const watcher = watchWallets(host, (list) => seen.push(list));
  await tick();
  assert.deepEqual(seen.at(-1)?.map((w) => w.label), ["Early wallet"]);

  // A wallet that loads later announces itself, and so does one that is also on the page by its own provider (Phantom): that one is listed once.
  const late = standard({ name: "Late wallet" });
  host.dispatchEvent(new CustomEvent("wallet-standard:register-wallet", { detail: (api: { register: (...w: StandardWallet[]) => void }) => api.register(late.w) }));
  const phantom = standard({ name: "Phantom" });
  host.dispatchEvent(new CustomEvent("wallet-standard:register-wallet", { detail: (api: { register: (...w: StandardWallet[]) => void }) => api.register(phantom.w) }));
  host.phantom = { solana: { isPhantom: true, async connect() { return { publicKey: { toString: () => ADDRESS } }; } } };
  watcher.refresh();
  assert.deepEqual(seen.at(-1)?.map((w) => w.label), ["Early wallet", "Late wallet", "Phantom"]);
  assert.equal(seen.at(-1)?.[2].id, "standard:Phantom"); // the one that announced itself, not the provider fallback
});

test("a provider that puts itself on the page late is found on refresh, and nothing is reported after stopping", async () => {
  const host = Object.assign(new EventTarget(), {}) as WalletHost;
  const seen: string[][] = [];
  const watcher = watchWallets(host, (list) => seen.push(list.map((w) => w.label)));
  await tick();
  assert.deepEqual(seen.at(-1), []);
  host.solflare = { isSolflare: true, async connect() { return true; }, publicKey: { toString: () => ADDRESS } };
  watcher.refresh();
  assert.deepEqual(seen.at(-1), ["Solflare"]);
  watcher.stop();
  const before = seen.length;
  host.dispatchEvent(new CustomEvent("wallet-standard:register-wallet", { detail: (api: { register: (...w: StandardWallet[]) => void }) => api.register(standard({ name: "After stop" }).w) }));
  watcher.refresh();
  assert.equal(seen.length, before);
});
