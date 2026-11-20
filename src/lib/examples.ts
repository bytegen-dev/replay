import { todayUtc } from "./months.ts";
import type { Plan } from "./plan.ts";
import type { Basis, DcaRequest, Market } from "./types.ts";

/**
 * Ready-made questions: "what would $500 a month into the S&P 500 since 1998 be worth today?". The page shows
 * them as one-click buttons, the API lists them at /api/v1/examples, and the agent skill quotes them.
 * The end month is always last month, so an example never asks for a month that hasn't finished.
 */
export interface Example {
  id: string;
  /** Short button text. */
  label: string;
  /** The question in plain words. */
  question: string;
  market: Market;
  /** Ticker for stocks, address / policy id for tokens. */
  address: string;
  amount: number;
  startMonth: string;
  basis: Basis;
  /** Stocks only: treat dividends as reinvested. */
  reinvest?: boolean;
  /** How often it buys. Monthly when absent. */
  plan?: Plan;
  /** A line of context shown with the result. */
  note?: string;
}

export const EXAMPLES: Example[] = [
  {
    id: "sp500-2017",
    label: "S&P 500, monthly since 2017",
    question: "$500 a month into the S&P 500 since January 2017: what is it worth today?",
    market: "equity",
    address: "SPY",
    amount: 500,
    startMonth: "2017-01",
    basis: "month-end",
    reinvest: true,
    note: "Uses SPY, the S&P 500 ETF, buying $500 every month.",
  },
  {
    id: "sp500-1998",
    label: "S&P 500 since 1998",
    question: "$500 a month into the S&P 500 since January 1998: what is it worth today?",
    market: "equity",
    address: "SPY",
    amount: 500,
    startMonth: "1998-01",
    basis: "month-end",
    reinvest: true,
    note: "Uses SPY, the S&P 500 ETF, with dividends reinvested. SPY started trading in 1993.",
  },
  {
    id: "apple-once",
    label: "Apple, $5,000 once in 2017",
    question: "$5,000 into Apple stock in a single buy in January 2017: what is it worth today?",
    market: "equity",
    address: "AAPL",
    amount: 5000,
    startMonth: "2017-01",
    basis: "month-end",
    plan: "once",
    reinvest: false,
    note: "A single buy, priced at the end of January 2017. Price only, adjusted for Apple's 2020 stock split.",
  },
  {
    id: "bitcoin-monthly",
    label: "Bitcoin, $200 a month since 2020",
    question: "$200 a month into Bitcoin since January 2020: what is it worth today?",
    market: "equity",
    address: "BTC-USD",
    amount: 200,
    startMonth: "2020-01",
    basis: "month-end",
    note: "Bitcoin's USD price, buying $200 every month.",
  },
  {
    id: "ethereum-once",
    label: "Ethereum, $1,000 once in 2021",
    question: "$1,000 into Ethereum in a single buy in January 2021: what is it worth today?",
    market: "equity",
    address: "ETH-USD",
    amount: 1000,
    startMonth: "2021-01",
    basis: "month-end",
    plan: "once",
    note: "A single buy, priced at the end of January 2021.",
  },
  {
    id: "nasdaq-2017",
    label: "Nasdaq-100, monthly since 2017",
    question: "$250 a month into the Nasdaq-100 since January 2017: what is it worth today?",
    market: "equity",
    address: "QQQ",
    amount: 250,
    startMonth: "2017-01",
    basis: "month-end",
    reinvest: true,
    note: "Uses QQQ, the Nasdaq-100 ETF, buying $250 every month.",
  },
];

/** The month before the one containing `now` (YYYY-MM). */
export function lastFullMonth(now: number = Date.now()): string {
  const [y, m] = todayUtc(now).slice(0, 7).split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 7);
}

/** An example as a request the API can run, ending last month. */
export function exampleRequest(ex: Example, now: number = Date.now()): DcaRequest {
  return {
    address: ex.address,
    chain: ex.market,
    amount: ex.amount,
    startMonth: ex.startMonth,
    endMonth: lastFullMonth(now),
    basis: ex.basis,
    ...(ex.reinvest ? { reinvest: true } : {}),
    ...(ex.plan && ex.plan !== "monthly" ? { plan: ex.plan } : {}),
  };
}

/** A ready-made price lookup. Dates are relative where they can be, so they never go out of range. */
export interface PriceExample {
  id: string;
  label: string;
  market: Market;
  address: string;
  date: string;
  time?: string;
}

export const PRICE_EXAMPLES: PriceExample[] = [
  { id: "sol-yesterday", label: "SOL yesterday 13:40", market: "solana", address: "So11111111111111111111111111111111111111112", date: "yesterday", time: "13:40" },
  { id: "pepe-week", label: "PEPE 7 days ago", market: "ethereum", address: "0x6982508145454Ce325dDbE47a25d4ec3d2311933", date: "7 days ago" },
  { id: "weth-base", label: "WETH on Base, 3 days ago 09:00", market: "base", address: "0x4200000000000000000000000000000000000006", date: "3 days ago", time: "09:00" },
  { id: "apple-month", label: "Apple, 1 month ago", market: "equity", address: "AAPL", date: "1 month ago" },
];
