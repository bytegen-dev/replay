import type { StockHit } from "./stocks.ts";

/** Shown when the ticker box is opened empty, so picking a well-known stock or fund is one click. */
export const POPULAR_STOCKS: StockHit[] = [
  { symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ", type: "EQUITY" },
  { symbol: "MSFT", name: "Microsoft Corporation", exchange: "NASDAQ", type: "EQUITY" },
  { symbol: "NVDA", name: "NVIDIA Corporation", exchange: "NASDAQ", type: "EQUITY" },
  { symbol: "GOOGL", name: "Alphabet Inc.", exchange: "NASDAQ", type: "EQUITY" },
  { symbol: "AMZN", name: "Amazon.com, Inc.", exchange: "NASDAQ", type: "EQUITY" },
  { symbol: "META", name: "Meta Platforms, Inc.", exchange: "NASDAQ", type: "EQUITY" },
  { symbol: "TSLA", name: "Tesla, Inc.", exchange: "NASDAQ", type: "EQUITY" },
  { symbol: "BRK-B", name: "Berkshire Hathaway Inc.", exchange: "NYSE", type: "EQUITY" },
  { symbol: "JPM", name: "JPMorgan Chase & Co.", exchange: "NYSE", type: "EQUITY" },
  { symbol: "KO", name: "The Coca-Cola Company", exchange: "NYSE", type: "EQUITY" },
  { symbol: "SPY", name: "SPDR S&P 500 ETF Trust", exchange: "NYSE Arca", type: "ETF" },
  { symbol: "QQQ", name: "Invesco QQQ Trust", exchange: "NASDAQ", type: "ETF" },
  { symbol: "VOO", name: "Vanguard S&P 500 ETF", exchange: "NYSE Arca", type: "ETF" },
  { symbol: "VTI", name: "Vanguard Total Stock Market ETF", exchange: "NYSE Arca", type: "ETF" },
];
