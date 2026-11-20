import { MARKET_LABELS, type Market } from "./types.ts";
/**
 * The big coins, priced from Yahoo's USD pairs. Unlike a token's pools these have years of daily history (Bitcoin from 2014),
 * so they run through the same pipeline as stocks. `symbol` is the Yahoo ticker.
 */
/** `firstPrice` is the first day each coin has a daily price (when it began trading on the big feeds). Months before it can't be picked. */
export const MAJORS: { symbol: string; firstPrice: string; ticker: string; name: string }[] = [
  { symbol: "BTC-USD", firstPrice: "2014-09-17", ticker: "BTC", name: "Bitcoin" },
  { symbol: "ETH-USD", firstPrice: "2017-11-09", ticker: "ETH", name: "Ethereum" },
  { symbol: "BNB-USD", firstPrice: "2017-11-09", ticker: "BNB", name: "BNB" },
  { symbol: "XRP-USD", firstPrice: "2017-11-09", ticker: "XRP", name: "XRP" },
  { symbol: "SOL-USD", firstPrice: "2020-04-10", ticker: "SOL", name: "Solana" },
  { symbol: "ADA-USD", firstPrice: "2017-11-09", ticker: "ADA", name: "Cardano" },
  { symbol: "DOGE-USD", firstPrice: "2014-09-17", ticker: "DOGE", name: "Dogecoin" },
  { symbol: "LTC-USD", firstPrice: "2014-09-17", ticker: "LTC", name: "Litecoin" },
  { symbol: "LINK-USD", firstPrice: "2017-11-09", ticker: "LINK", name: "Chainlink" },
  { symbol: "AVAX-USD", firstPrice: "2020-07-13", ticker: "AVAX", name: "Avalanche" },
  { symbol: "HYPE-USD", firstPrice: "2024-12-05", ticker: "HYPE", name: "Hyperliquid" },
];

/** The major a Yahoo ticker stands for, if it is one. */
export const majorFor = (symbol: string) => MAJORS.find((m) => m.symbol === symbol.trim().toUpperCase());
/** What to call a result's market: "Crypto" for a major coin (which runs through the stock pipeline), "Stock", or the chain's name. */
export const marketLabel = (chain: Market, address: string): string =>
  chain === "equity" ? (majorFor(address) ? "Crypto" : MARKET_LABELS.equity) : MARKET_LABELS[chain];
export const isMajorSymbol = (symbol: string) => majorFor(symbol) !== undefined;
