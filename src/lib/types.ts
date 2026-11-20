import type { LeverageResult, LeverageSettings } from "./leverage.ts";
import type { Plan } from "./plan.ts";
export const CHAINS = ["ethereum", "solana", "base", "bsc", "arbitrum", "hyperevm", "cardano"] as const;
export type Chain = (typeof CHAINS)[number];

export const CHAIN_LABELS: Record<Chain, string> = {
  ethereum: "Ethereum",
  solana: "Solana",
  base: "Base",
  bsc: "BSC",
  arbitrum: "Arbitrum",
  hyperevm: "Hyperliquid",
  cardano: "Cardano",
};

/** Everything a request can target: a crypto chain, or "equity" for an ordinary listed stock or ETF (address = ticker). */
export type Market = Chain | "equity";

export const MARKET_LABELS: Record<Market, string> = { ...CHAIN_LABELS, equity: "Stock" };

export type Basis = "month-end" | "first-of-month" | "day-of-month";

/** One daily observation. `date` is a UTC calendar day, YYYY-MM-DD. */
export interface DailyPoint {
  date: string;
  price: number;
  /** 24h volume in USD, when the source provides it. */
  volume?: number;
  /** Which source this point came from, when a series mixes sources. Falls back to the run's source. */
  source?: PriceSource;
  /** From a thin pool that trades on only some days, so it may stand in for a target up to a week away. */
  sparse?: boolean;
}

export type NoteCode =
  | "nearest-day"
  | "low-volume"
  | "outlier"
  | "no-data"
  | "out-of-range"
  | "future"
  | "market-closed"
  | "manual"
  | "shifted";

export interface Note {
  code: NoteCode;
  text: string;
}

export type PriceSource = "CoinGecko" | "GeckoTerminal" | "DexHunter" | "Yahoo" | "Nasdaq" | "Tiingo" | "Bitstamp" | "manual" | "none";

export interface MonthRow {
  /** YYYY-MM */
  month: string;
  /** The day the chosen basis asked for. */
  targetDate: string;
  /** The day the price actually comes from, null when there is no data. */
  priceDate: string | null;
  /** USD, null when there is no data. Never guessed. */
  price: number | null;
  source: PriceSource;
  notes: Note[];
  /** When the monthly amount is in another currency: units of it per 1 USD on this buy's date. Absent for plain USD. */
  fx?: number;
}

export interface SourceLink {
  label: string;
  url: string;
}

export interface DcaResponse {
  token: { id: string | null; symbol: string | null; name: string | null };
  chain: Market;
  address: string;
  basis: Basis;
  /** 1–31 when basis is day-of-month; each month uses this day or the last day of that month if shorter. */
  basisDay?: number;
  currentPrice: number | null;
  currentPriceDate: string;
  /** Stocks only: prices are adjusted so dividends are treated as reinvested. */
  reinvest?: boolean;
  rows: MonthRow[];
  sources: SourceLink[];
  warnings: string[];
  /** Present when the monthly amount was in a currency other than USD. */
  currency?: { code: string; name: string; symbol: string; perUsdToday: number | null; firstRateDate: string | null };
  /** Present when the request asked for leverage: what the same buys would have done as leveraged positions. */
  leverage?: LeverageResult;
  /** Daily closing prices, kept only while a leveraged run is worked out. Removed before the response is sent. */
  daily?: { date: string; price: number }[];
}

export interface DcaRequest {
  /** Contract, mint, Cardano policy id, or (for "equity") the ticker. */
  address: string;
  chain: Market;
  amount: number;
  startMonth: string;
  endMonth: string;
  basis: Basis;
  basisDay?: number;
  /** Cardano only: the full asset id (policy + token name in hex), when the user pasted one. */
  unit?: string;
  /** Stocks only: treat dividends as reinvested (total return) instead of price only. */
  reinvest?: boolean;
  /** The currency `amount` is in (an ISO code such as "NGN"). USD when absent. Each month's buy is converted at that day's rate. */
  currency?: string;
  /** How often the amount is bought: every month (the default), every 3 or 6 months, yearly, or once at the start month. */
  plan?: Plan;
  /** Buy with leverage, like a perpetual futures long. Absent (or 1x) means plain buying. */
  leverage?: LeverageSettings;
  /** Value the holding at the end month instead of today (used for the leveraged run). */
  sellAtEnd?: boolean;
}
