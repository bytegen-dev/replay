import { fetchHistory } from "./helius.ts";
import { birdeyeProvider, firstOf, geckoProvider, solPriceAt } from "./prices.ts";
import { scanWallet } from "./scan.ts";
import { createScanner, toApiTrades } from "./service.ts";

/**
 * The live scanner: the real Helius and price APIs, built from the server's environment.
 *
 *   HELIUS_API_KEY         required. Without it there is no scanner and the route says it is not set up.
 *   BIRDEYE_API_KEY        optional. Birdeye is the first price source; without it GeckoTerminal alone prices everything (slower, tighter limits).
 *   FUMBLE_MAX_PAGES       pages of 100 transactions read per wallet (default 30, about 30 seconds at the speed Helius answers).
 *   FUMBLE_HISTORY_SECONDS how long reading history may take before it stops with what it has (default 20).
 *   FUMBLE_BUDGET_SECONDS  how long a whole scan may spend before it stops pricing and reports the rest as unknown (default 50).
 *
 * Built once per server instance, so the per-API limiters are shared by every scan running on it.
 */

const intEnv = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

let scanner: ReturnType<typeof createScanner> | null | undefined;

export function getScanner(): ReturnType<typeof createScanner> | null {
  if (scanner !== undefined) return scanner;
  const heliusKey = process.env.HELIUS_API_KEY;
  if (!heliusKey) return (scanner = null);
  const birdeyeKey = process.env.BIRDEYE_API_KEY;
  const prices = firstOf([...(birdeyeKey ? [{ name: "birdeye", get: birdeyeProvider(birdeyeKey) }] : []), { name: "geckoterminal", get: geckoProvider() }]);
  const solUsd = solPriceAt(prices);
  const maxPages = intEnv("FUMBLE_MAX_PAGES", 30);
  const budgetMs = intEnv("FUMBLE_BUDGET_SECONDS", 50) * 1000;
  const historyMs = intEnv("FUMBLE_HISTORY_SECONDS", 20) * 1000;

  scanner = createScanner({
    run: (wallet, emit) => {
      const deadline = Date.now() + budgetMs;
      return scanWallet(wallet, {
        history: (w) => fetchHistory(w, { apiKey: heliusKey, maxPages, maxMs: historyMs }),
        prices,
        solUsd,
        outOfTime: () => Date.now() > deadline,
        onProgress: (p) => emit({ type: "progress", ...p }),
        onTrades: (t) => emit({ type: "trades", data: toApiTrades(wallet, t) }),
      });
    },
  });
  return scanner;
}
