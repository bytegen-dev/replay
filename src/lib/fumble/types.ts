/** What the fumble engine passes around. Plain data, no network: the engine is pure so it can be tested on frozen real transactions. */

/** One swap of a token against SOL, by the wallet being scanned. */
export interface Trade {
  side: "buy" | "sell";
  mint: string;
  /** Tokens received (buy) or given up (sell), in whole tokens. */
  tokens: number;
  /** SOL spent (buy) or received (sell), after network fees and tips but not counting account rent. */
  sol: number;
  /** Set only while a trade paid in a stablecoin waits for its SOL amount: the dollars paid or received. `sol` is 0 until then (see `inSol`). */
  usd?: number;
  /** Seconds since 1970. */
  time: number;
  signature: string;
  /** The router or exchange the history provider named, when it did. */
  source?: string;
}

/**
 * Tokens that reached the wallet with no swap against SOL or a stablecoin: a transfer from another wallet, an airdrop, a mint. They are not trades, so they
 * stay out of the buys and sells; they matter because the wallet may later sell them. Valued at the market price when they arrived (see scan.ts), they give
 * those sells a cost, the way an airdrop is treated for tax: its cost is what it was worth when it came.
 */
export interface Receive {
  mint: string;
  /** Tokens received, in whole tokens. */
  tokens: number;
  /** Seconds since 1970. */
  time: number;
  signature: string;
}

/** One price candle. Prices are USD per token. `t` is when the candle starts, in seconds. */
export interface Candle {
  t: number;
  h: number;
  l: number;
  c: number;
  /** Volume in USD, when the source gives it. */
  v?: number;
}

/** Transactions the scan could not turn into a trade, by why. Reported so a wallet's numbers can say how much was left out. */
export interface Dropped {
  /** No token moved for this wallet (a plain SOL transfer, a fee, a position change). */
  noTokenMove: number;
  /** More than one token moved (token to token, or a multi-leg route). Out of scope: memecoin against SOL only. */
  multiToken: number;
  /** A token moved but SOL did not move the other way (a transfer, an airdrop, dust). */
  noSolLeg: number;
}
