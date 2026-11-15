export const CHAINS = ["cardano", "ethereum", "solana", "base", "bsc", "arbitrum"] as const;
export type Chain = (typeof CHAINS)[number];

export const CHAIN_LABELS: Record<Chain, string> = {
  cardano: "Cardano",
  ethereum: "Ethereum",
  solana: "Solana",
  base: "Base",
  bsc: "BSC",
  arbitrum: "Arbitrum",
};

export type Basis = "month-end" | "first-of-month" | "day-of-month";

/** One daily observation. `date` is a UTC calendar day, YYYY-MM-DD. */
export interface DailyPoint {
  date: string;
  price: number;
  /** 24h volume in USD, when the source provides it. */
  volume?: number;
  /** Which source this point came from, when a series mixes sources. Falls back to the run's source. */
  source?: PriceSource;
}

export type NoteCode =
  | "nearest-day"
  | "low-volume"
  | "outlier"
  | "no-data"
  | "out-of-range"
  | "future"
  | "manual";

export interface Note {
  code: NoteCode;
  text: string;
}

export type PriceSource = "CoinGecko" | "GeckoTerminal" | "manual" | "none";

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
}

export interface SourceLink {
  label: string;
  url: string;
}

export interface DcaResponse {
  token: { id: string | null; symbol: string | null; name: string | null };
  chain: Chain;
  address: string;
  basis: Basis;
  /** 1–31 when basis is day-of-month; each month uses this day or the last day of that month if shorter. */
  basisDay?: number;
  currentPrice: number | null;
  currentPriceDate: string;
  rows: MonthRow[];
  sources: SourceLink[];
  warnings: string[];
}

export interface DcaRequest {
  address: string;
  chain: Chain;
  amount: number;
  startMonth: string;
  endMonth: string;
  basis: Basis;
  basisDay?: number;
  /** Cardano only: the full asset id (policy + token name in hex), when the user pasted one. */
  unit?: string;
}
