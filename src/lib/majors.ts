/**
 * The big coins, priced from Yahoo's USD pairs. Unlike a token's pools these have years of daily history (Bitcoin from 2014),
 * so they run through the same pipeline as stocks. `symbol` is the Yahoo ticker.
 */
export const MAJORS: { symbol: string; ticker: string; name: string }[] = [
  { symbol: "BTC-USD", ticker: "BTC", name: "Bitcoin" },
  { symbol: "ETH-USD", ticker: "ETH", name: "Ethereum" },
  { symbol: "BNB-USD", ticker: "BNB", name: "BNB" },
  { symbol: "XRP-USD", ticker: "XRP", name: "XRP" },
  { symbol: "SOL-USD", ticker: "SOL", name: "Solana" },
  { symbol: "ADA-USD", ticker: "ADA", name: "Cardano" },
  { symbol: "DOGE-USD", ticker: "DOGE", name: "Dogecoin" },
  { symbol: "LTC-USD", ticker: "LTC", name: "Litecoin" },
  { symbol: "LINK-USD", ticker: "LINK", name: "Chainlink" },
  { symbol: "AVAX-USD", ticker: "AVAX", name: "Avalanche" },
];

/** The major a Yahoo ticker stands for, if it is one. */
export const majorFor = (symbol: string) => MAJORS.find((m) => m.symbol === symbol.trim().toUpperCase());
export const isMajorSymbol = (symbol: string) => majorFor(symbol) !== undefined;
