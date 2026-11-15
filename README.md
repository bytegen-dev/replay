# DCA Checker

Given a token contract and a chain, shows what a fixed monthly USD buy would have purchased and what it is worth today. Next.js (App Router), TypeScript, Tailwind. Black and white, no accents.

## Setup

```bash
pnpm install                     # npm install also works
cp .env.example .env.local       # optional
pnpm dev                          # http://localhost:3000
```

Other scripts: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`.

### Environment variables (server-side only, never sent to the browser)

| Name | Default | Meaning |
| --- | --- | --- |
| `COINGECKO_API_KEY` | unset | Optional. Without it the public CoinGecko tier is used. |
| `COINGECKO_PLAN` | `demo` | `demo` or `pro`. Only `pro` unlocks history older than 365 days. |

### Install note

The install in the original development environment was done with pnpm 12 after repeated npm timeouts on a slow connection. If an install reports `No matching version found for next@16.4.6`, that is stale registry metadata in the package manager cache: rerun with `pnpm install --no-prefer-offline`.

## How prices are chosen

1. EVM chains and Solana: GeckoTerminal's top pool (daily OHLCV, close price, USD volume). Free, full history.
2. If there is no pool (always the case for Cardano), CoinGecko's coin endpoints are used (`/coins/{platform}/contract/{address}` then `market_chart/range`).
3. Each month targets the last day (month-end) or the first day of the month, using the UTC daily point for that date.
4. If that day is missing, the nearest day within 3 days is used (ties go to the earlier day) and the Note column says which day.
5. No price within 3 days, a month still in the future, or a month older than the free CoinGecko 365-day window: **n/a**. Nothing is guessed or interpolated. n/a months are excluded from all totals, and the summary says how many.
6. Warning flags: nearest-day, very low volume (< $1,000 in 24h), and a price more than 50% away from the median of the surrounding days.
7. Any month's price can be overridden in the table. Overrides flow into totals and the spreadsheet, marked `manual`.

Token math: `tokens = ROUND(amount / price, 0)`. If any single buy would be under 100 tokens (expensive tokens), 6 decimals are used instead, otherwise a $200 buy of a $3,000 token would round to 0. The spreadsheet exposes this as an input cell.

## Export

**Export spreadsheet**: `.xlsx` with `Summary`, `Buys` and `Sources` sheets. The Summary sheet includes the DCA logo. Tokens are `ROUND(amount/price, decimals)`, totals are `SUM`. Blue font = hardcoded input, black = formula. Built server-side from the same table data you see on screen.

## Token details

Once the address is valid, a card appears before you calculate, so a wrong token shows up early. `/api/token-info` merges two free sources: CoinGecko (name, logo, description, market cap, fully diluted value, supply, rank, links) and DexScreener (live price, liquidity and 24h volume summed over the token's pools on that chain, banner, social links). DexScreener does not cover Cardano, so Cardano tokens get the CoinGecko half only. A field a source doesn't provide is left out, never guessed; only `https://` links and images are used. Responses are cached for a few minutes.

## Search or paste

The address box is also the search box. Paste an address or policy ID and it works as a plain input, with the details card appearing below. Type a name or ticker and matching tokens drop down (arrow keys and Enter work); the search runs through DexScreener, across Ethereum, Base, BSC, Arbitrum, Solana and Cardano. Picking a result fills in the chain and address. A complete address from a different chain than the one selected also searches, so pasting it finds the token and switches the chain. Half-typed addresses don't search. Each token's pools are summed into one row, results whose own name and ticker don't match the query are dropped, and the rest are ranked by match quality, then liquidity. Pools under $500 of liquidity are hidden (paste the address to use one anyway). Results can be sorted by market cap (the default), liquidity, 24h volume or best match; a token with no value for the chosen key goes last. The market cap is DexScreener's estimate and can be wrong or missing, so check it against the token's details card. Copycat tokens are common, so the list shows the address, price and liquidity to check against the real one. Search covers whatever DexScreener has indexed, so a token with no DEX pool won't appear.

## xStocks

The **xStocks** switch replaces the address field with a searchable list of tokenized stocks and ETFs on Solana (Backed Finance xStocks, such as Tesla `TSLAx`). Search matches name or ticker, and the trailing `x` is optional. Picking one fills in its mint and fixes the chain to Solana, then everything works as for any other token.

The list is not hardcoded. `/api/xstocks` joins CoinGecko's `xstocks-ecosystem` category with each coin's Solana address and keeps the result for one hour; coins without a valid Solana mint are dropped. It uses your `COINGECKO_API_KEY` if set. These tokens trade on-chain around the clock and often in thin pools, so low-volume warnings are common, and a pool's history may start later than the token's launch (older months then show n/a).

## Share

**Share** saves the current result (including any prices you edited) and returns a public link like `/r/k3x9a2Qw`. Anyone with the link sees a read-only copy, exactly as it was when saved. The link is unlisted (`noindex`), not private: anyone who has it can open it.

- **Storage:** Neon Postgres via `@neondatabase/serverless`. Set `DATABASE_URL`; on Vercel, add Neon from the Marketplace and it sets the variable for you. The `shares` table is created on first use. Without `DATABASE_URL` the Share button shows a clear error and everything else still works.
- **Delete:** right after saving, the page can delete the link. The delete secret is shown to that browser session only and only its hash is stored, so after you leave or recalculate, the link stays up.
- **Limits:** at most 72 months and 200 KB per share, 20 saves per hour per client. The server rebuilds the payload from a whitelist of fields, and only `https://` source links are kept.
- **Share again** makes a new link and leaves the old one up.

## PWA

`public/manifest.webmanifest` and `public/sw.js` enable install and basic offline shell caching. Set `NEXT_PUBLIC_SITE_URL` in production so Open Graph and metadata use the correct origin.

## Tests

`npm test` runs Node's built-in test runner on the TypeScript files in `tests/` (no extra test dependency): month-end and nearest-day selection, token math, overrides, validation.

## Cardano history

CoinGecko is the primary source for Cardano, but its free tier stops at 365 days. Months it can't price are filled, only those days and only when something is missing, in this order:

1. **DexHunter** (`charts.dhapi.io`): daily candles for the token against ADA, aggregated across Cardano DEXs, with history well past a year. ADA prices are converted to USD with **Bitstamp's** ADA/USD daily close for the same UTC day (a day with no ADA/USD close is dropped, never estimated). On NMKR this agrees with GeckoTerminal's USD prices to within about 1 to 2% on the days they overlap. Rows show Source `DexHunter`. DexHunter's docs ask for a partner key (`X-Partner-Id`) but it answered without one when tested; set `DEXHUNTER_PARTNER_ID` (a free key from app.dexhunter.io/partners) if it starts refusing requests, and the app sends it when present.
2. **GeckoTerminal pools** (up to four, deepest first) for anything still empty. Pool candles exist only on days with trades and the pools are thin, so for these prices only, when nothing traded within 3 days of the target, the nearest actual trade up to 7 days away is used and the Note says how far and which way. Every other source stays strictly within 3 days.

CoinGecko always wins on days it has a price. Whatever is still empty after both stays n/a and is left out of the totals. With a policy ID alone, the app finds the full asset ID by searching GeckoTerminal for the token's symbol; if you paste the full asset ID (policy plus token name in hex), it uses that directly, which matters when one policy covers several tokens. A paid CoinGecko key still gives the most complete history.

## Limits

- The free CoinGecko tier serves only the last 365 days and rate-limits aggressively. Requests retry with backoff on 429 and responses are cached in memory for one hour.
- Cardano sanity check (NMKR, policy `5dac8536653edc12f6f5e1045d8164b9f59998d3bdc300fc92843489`, $200/month, Dec 2024 to Oct 2026, month-end) should land near 33.6M tokens in total, but only with a paid CoinGecko key. On the free tier the months older than 365 days show n/a and the total will be lower.
