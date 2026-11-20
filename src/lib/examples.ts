import { todayUtc } from "./months.ts";
import type { Side } from "./leverage.ts";
import type { Plan } from "./plan.ts";
import type { Basis, DcaRequest, Market } from "./types.ts";

/**
 * Ready-made questions: "what would $500 a month into the S&P 500 since 1998 be worth today?". The page shows
 * them as one-click buttons, the API lists them at /api/v1/examples, and the agent skill quotes them.
 * The end month is always last month, so an example never asks for a month that hasn't finished.
 */
/** Which tab of the landing page's demo an example belongs to. */
export type ExampleGroup = "stocks" | "crypto" | "currencies" | "commodities";

export interface Example {
  id: string;
  /** Which tab of the landing demo it sits under. */
  group?: ExampleGroup;
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
  /** Buy with leverage (a perpetual-futures style long or short) instead of plainly. */
  leverage?: { leverage: number; side?: Side };
}

export const EXAMPLES: Example[] = [
  {
    id: "sp500-2017",
    group: "stocks",
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
    group: "stocks",
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
    group: "stocks",
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
    group: "crypto",
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
    group: "crypto",
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
    group: "stocks",
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
  {
    id: "gold-monthly",
    group: "commodities",
    label: "Gold, $300 a month since 2020",
    question: "$300 a month into gold since January 2020: what is it worth today?",
    market: "equity",
    address: "GC=F",
    amount: 300,
    startMonth: "2020-01",
    basis: "month-end",
    note: "Gold futures, priced in US dollars per troy ounce, buying $300 every month.",
  },
  {
    id: "silver-once",
    group: "commodities",
    label: "Silver, $2,000 once in 2020",
    question: "$2,000 into silver in a single buy in January 2020: what is it worth today?",
    market: "equity",
    address: "SI=F",
    amount: 2000,
    startMonth: "2020-01",
    basis: "month-end",
    plan: "once",
    note: "A single buy of silver futures, priced at the end of January 2020.",
  },
  {
    id: "oil-once",
    group: "commodities",
    label: "Crude oil, $3,000 once in mid-2022",
    question: "$3,000 into crude oil in a single buy in June 2022: what is it worth today?",
    market: "equity",
    address: "CL=F",
    amount: 3000,
    startMonth: "2022-06",
    basis: "month-end",
    plan: "once",
    note: "A single buy of WTI crude oil futures, priced at the end of June 2022, near the year's peak.",
  },
  {
    id: "wheat-monthly",
    group: "commodities",
    label: "Wheat, $200 a month since 2019",
    question: "$200 a month into wheat since January 2019: what is it worth today?",
    market: "equity",
    address: "ZW=F",
    amount: 200,
    startMonth: "2019-01",
    basis: "month-end",
    note: "Chicago wheat futures, priced in US dollars per bushel, buying $200 every month.",
  },
  {
    id: "sp500-3x",
    group: "stocks",
    label: "S&P 500, 3x long, $500 a month since 2017",
    question: "$500 a month into the S&P 500 at 3x leverage (long) since January 2017: what is it worth today?",
    market: "equity",
    address: "SPY",
    amount: 500,
    startMonth: "2017-01",
    basis: "month-end",
    leverage: { leverage: 3 },
    note: "The same monthly buys of SPY as 3x long positions, with funding and fees. Dividends don't apply to leveraged runs.",
  },
  {
    id: "bitcoin-5x",
    group: "crypto",
    label: "Bitcoin, 5x long, $200 a month since 2020",
    question: "$200 a month into Bitcoin at 5x leverage (long) since January 2020: what is it worth today?",
    market: "equity",
    address: "BTC-USD",
    amount: 200,
    startMonth: "2020-01",
    basis: "month-end",
    leverage: { leverage: 5 },
    note: "The same monthly buys of Bitcoin as 5x long positions, with funding and fees. A position is closed if the price falls far enough to wipe out its margin.",
  },
  {
    id: "ethereum-3x-short",
    group: "crypto",
    label: "Ethereum, 3x short, $1,000 once in 2021",
    question: "$1,000 shorting Ethereum at 3x leverage in a single position in November 2021: what is it worth today?",
    market: "equity",
    address: "ETH-USD",
    amount: 1000,
    startMonth: "2021-11",
    basis: "month-end",
    plan: "once",
    leverage: { leverage: 3, side: "short" },
    note: "One 3x short position opened at the end of November 2021, near Ethereum's peak. A short gains when the price falls and is closed if it rises far enough.",
  },
  {
    id: "gold-5x",
    group: "commodities",
    label: "Gold, 5x long, $300 a month since 2020",
    question: "$300 a month into gold at 5x leverage (long) since January 2020: what is it worth today?",
    market: "equity",
    address: "GC=F",
    amount: 300,
    startMonth: "2020-01",
    basis: "month-end",
    leverage: { leverage: 5 },
    note: "The same monthly buys of gold futures as 5x long positions, with funding and fees.",
  },
];

/**
 * Currency examples for the landing demo's Currencies tab: spend US dollars every month on another currency. They are worked out
 * ahead of time with the currency calculator (scripts/update-examples.mjs), not the stock and coin one, so they have their own shape.
 */
export interface FxExample {
  id: string;
  label: string;
  question: string;
  /** The currency bought (the one spent is always US dollars here). */
  to: string;
  /** What the currency is called in the sentence ("euros"). */
  toName: string;
  amount: number;
  startMonth: string;
}

export const FX_EXAMPLES: FxExample[] = [
  { id: "fx-eur", label: "Euros, $300 a month since 2017", question: "$300 a month into euros since January 2017: what is it worth today?", to: "EUR", toName: "Euros", amount: 300, startMonth: "2017-01" },
  { id: "fx-gbp", label: "Pounds, $400 a month since 2016", question: "$400 a month into British pounds since January 2016: what is it worth today?", to: "GBP", toName: "British pounds", amount: 400, startMonth: "2016-01" },
  { id: "fx-jpy", label: "Yen, $500 a month since 2021", question: "$500 a month into Japanese yen since January 2021: what is it worth today?", to: "JPY", toName: "Japanese yen", amount: 500, startMonth: "2021-01" },
  { id: "fx-ngn", label: "Naira, $100 a month since 2018", question: "$100 a month into Nigerian naira since January 2018: what is it worth today?", to: "NGN", toName: "Nigerian naira", amount: 100, startMonth: "2018-01" },
];

/**
 * The five checks the landing page's hero card turns through, one each time the light pulse completes a lap. Two of them lost
 * money on purpose (Cardano, and Ethereum bought near its 2021 peak): a card that only ever shows winners reads as a pitch.
 * They are worked out ahead of time like the examples above (scripts/update-examples.mjs).
 */
export const HERO_CHECKS: Example[] = [
  {
    id: "hero-btc",
    label: "Bitcoin, $200 a month since 2020",
    question: "$200 a month into Bitcoin since January 2020: what is it worth today?",
    market: "equity",
    address: "BTC-USD",
    amount: 200,
    startMonth: "2020-01",
    basis: "month-end",
  },
  {
    id: "hero-ada",
    group: "crypto",
    label: "Cardano, $200 a month since 2022",
    question: "$200 a month into Cardano since January 2022: what is it worth today?",
    market: "equity",
    address: "ADA-USD",
    amount: 200,
    startMonth: "2022-01",
    basis: "month-end",
  },
  {
    id: "hero-aapl",
    label: "Apple, $5,000 once in 2017",
    question: "$5,000 into Apple stock in a single buy in January 2017: what is it worth today?",
    market: "equity",
    address: "AAPL",
    amount: 5000,
    startMonth: "2017-01",
    basis: "month-end",
    plan: "once",
  },
  {
    id: "hero-eth",
    label: "Ethereum, $1,000 once at the 2021 peak",
    question: "$1,000 into Ethereum in a single buy in November 2021: what is it worth today?",
    market: "equity",
    address: "ETH-USD",
    amount: 1000,
    startMonth: "2021-11",
    basis: "month-end",
    plan: "once",
  },
  {
    id: "hero-spy",
    label: "S&P 500, $500 a month since 2017",
    question: "$500 a month into the S&P 500 since January 2017: what is it worth today?",
    market: "equity",
    address: "SPY",
    amount: 500,
    startMonth: "2017-01",
    basis: "month-end",
    reinvest: true,
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
    ...(ex.leverage ? { leverage: { leverage: ex.leverage.leverage, ...(ex.leverage.side ? { side: ex.leverage.side } : {}) } } : {}),
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
