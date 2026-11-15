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

## Limits

- The free CoinGecko tier serves only the last 365 days and rate-limits aggressively. Requests retry with backoff on 429 and responses are cached in memory for one hour.
- Cardano sanity check (NMKR, policy `5dac8536653edc12f6f5e1045d8164b9f59998d3bdc300fc92843489`, $200/month, Dec 2024 to Oct 2026, month-end) should land near 33.6M tokens in total, but only with a paid CoinGecko key. On the free tier the months older than 365 days show n/a and the total will be lower.
