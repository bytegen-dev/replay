import { lookWallet, rememberedLook } from "./check.ts";
import { fetchHistory } from "./helius.ts";
import { createKolDirectory, memoryKolStore, sqlKolStore } from "./kols.ts";
import { birdeyeProvider, firstOf, geckoProvider, pythProvider, sharedPrices, solPriceAt } from "./prices.ts";
import { savedPrices, sqlPriceStore } from "./priceStore.ts";
import { scanWallet } from "./scan.ts";
import { memoryStore, sqlStore } from "./store.ts";
import { createScanner, toApiTrades } from "./service.ts";
import { heliusTokens } from "./tokens.ts";

/**
 * The live scanner: the real Helius and price APIs, built from the server's environment.
 *
 *   HELIUS_API_KEY         required. Without it there is no scanner and the route says it is not set up.
 *   BIRDEYE_API_KEY        optional. Birdeye is the first price source; without it GeckoTerminal alone prices everything (slower, tighter limits).
 *   FUMBLE_MAX_PAGES       pages of 100 transactions read per wallet (default 30, about 30 seconds at the speed Helius answers).
 *   FUMBLE_HISTORY_SECONDS how long reading history may take before it stops with what it has (default 20).
 *   DATABASE_URL           optional. With it, each wallet's trades are saved and a rescan reads only what is new since (see store.ts), and price history is saved per coin (see priceStore.ts). Without it the trades are kept in memory instead.
 *   FUMBLE_BUDGET_SECONDS  how long a whole scan may spend before it stops pricing and reports the rest as unknown (default 50).
 *
 * Built once per server instance, so the per-API limiters are shared by every scan running on it.
 */

const intEnv = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

/**
 * A price source saying it is out of room (too many requests, or its quota used up) is told to the page, so it can say the system is busy. The sources are
 * shared by every scan on this server, so a limit hit by one is told to all the scans running, and to a scan that starts within ten minutes of it.
 */
const STRAIN_MEMORY_MS = 10 * 60 * 1000;
const strainListeners = new Set<() => void>();
let lastLimitAt = 0;
let lastLimitLog = 0;
function noteLimit(provider: string): void {
  lastLimitAt = Date.now();
  // One line a minute at most, so a long scan hitting the same limit for every coin does not flood the logs.
  if (lastLimitAt - lastLimitLog > 60_000) {
    lastLimitLog = lastLimitAt;
    console.warn(`fumble: ${provider} is out of room (rate or quota limit); the next source is used`);
  }
  strainListeners.forEach((tell) => tell());
}

let scanner: ReturnType<typeof createScanner> | null | undefined;

export function getScanner(): ReturnType<typeof createScanner> | null {
  if (scanner !== undefined) return scanner;
  const heliusKey = process.env.HELIUS_API_KEY;
  if (!heliusKey) return (scanner = null);
  const birdeyeKey = process.env.BIRDEYE_API_KEY;
  // Shared by every scan on this server, so a coin two wallets traded is priced once.
  // Pyth, when it has a key, answers for SOL only (the dollar value of each trade); every other coin goes on to Birdeye and GeckoTerminal.
  const pythKey = process.env.PYTH_API_KEY;
  const fetched = firstOf([...(pythKey ? [{ name: "pyth", get: pythProvider(pythKey) }] : []), ...(birdeyeKey ? [{ name: "birdeye", get: birdeyeProvider(birdeyeKey) }] : []), { name: "geckoterminal", get: geckoProvider() }], noteLimit);
  // With a database, a coin priced by any server instance is saved, so the free-tier limits are spent once per coin, not once per instance per wallet.
  const priceStore = sqlPriceStore();
  const prices = sharedPrices(priceStore ? savedPrices(fetched, priceStore) : fetched);
  // One line for each hour of SOL price looked up, saying which source answered (or that none did), so the logs show whether Pyth is doing its job.
  const solUsd = solPriceAt(prices, (source) => console.info(`fumble: SOL price from ${source ?? "no source"}`));
  const tokens = heliusTokens(heliusKey);
  const maxPages = intEnv("FUMBLE_MAX_PAGES", 30);
  const budgetMs = intEnv("FUMBLE_BUDGET_SECONDS", 50) * 1000;
  const historyMs = intEnv("FUMBLE_HISTORY_SECONDS", 20) * 1000;
  // Without a database the history is kept in this server's memory (the most recent wallets), so reading further back still works while the server is up.
  const store = sqlStore() ?? memoryStore(100);

  scanner = createScanner({
    run: (wallet, emit, opts) => {
      const deadline = Date.now() + budgetMs;
      let told = false;
      const tell = () => {
        if (told) return;
        told = true;
        emit({ type: "strained" });
      };
      strainListeners.add(tell);
      if (Date.now() - lastLimitAt < STRAIN_MEMORY_MS) tell();
      return scanWallet(wallet, {
        history: (w, onPage, until, before, stopWhen) => fetchHistory(w, { apiKey: heliusKey, maxPages, maxMs: historyMs, onPage, untilSignature: until, before, stopWhen }),
        store,
        prices,
        solUsd,
        tokens,
        outOfTime: () => Date.now() > deadline,
        onProgress: (p) => emit({ type: "progress", ...p }),
        onTrades: (t) => emit({ type: "trades", data: toApiTrades(wallet, t) }),
      }, opts).finally(() => strainListeners.delete(tell));
    },
  });
  return scanner;
}

let kols: ReturnType<typeof createKolDirectory> | null | undefined;

/** The KOL name search, or null when the server has no Solana Tracker key. Shared by every request on this server; the list is saved in the database when there is one. */
export function getKolDirectory(): ReturnType<typeof createKolDirectory> | null {
  if (kols !== undefined) return kols;
  const apiKey = process.env.SOLANA_TRACKER_API_KEY;
  if (!apiKey) return (kols = null);
  return (kols = createKolDirectory({ apiKey, store: sqlKolStore() ?? memoryKolStore() }));
}

let looker: ReturnType<typeof rememberedLook> | null | undefined;

/** The quick "does this wallet have any transactions" look, or null when the server has no Helius key. Shared by every request on this server. */
export function getWalletLook(): ReturnType<typeof rememberedLook> | null {
  if (looker !== undefined) return looker;
  const key = process.env.HELIUS_API_KEY;
  return (looker = key ? rememberedLook((wallet) => lookWallet(wallet, { apiKey: key })) : null);
}
