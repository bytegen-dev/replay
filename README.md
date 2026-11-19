# Replay

Replay backtests a fixed monthly purchase: pick a US stock or ETF (decades of history) or a token on Ethereum, Base, BSC, Arbitrum, Hyperliquid (HyperEVM), Solana or Cardano, and it shows what the monthly buys would have bought and what they are worth today. It also has a public API and an AI agent skill. Next.js (App Router), TypeScript, Tailwind. Black and white, no accents.

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

**Export spreadsheet**: `.xlsx` with `Summary`, `Buys` and `Sources` sheets. The Summary sheet includes the Replay logo. Tokens are `ROUND(amount/price, decimals)`, totals are `SUM`. Blue font = hardcoded input, black = formula. Built server-side from the same table data you see on screen.

## Token details

Once the address is valid, a card appears before you calculate, so a wrong token shows up early. `/api/token-info` merges two free sources: CoinGecko (name, logo, description, market cap, fully diluted value, supply, rank, links) and DexScreener (live price, liquidity and 24h volume summed over the token's pools on that chain, banner, social links). DexScreener does not cover Cardano, so Cardano tokens get the CoinGecko half only. A field a source doesn't provide is left out, never guessed; only `https://` links and images are used. Responses are cached for a few minutes.

## Search or paste

The address box is also the search box. Paste an address or policy ID and it works as a plain input, with the details card appearing below. Type a name or ticker and matching tokens drop down (arrow keys and Enter work); the search runs through DexScreener, across Ethereum, Base, BSC, Arbitrum, Solana and Cardano. Picking a result fills in the chain and address. A complete address from a different chain than the one selected also searches, so pasting it finds the token and switches the chain. Half-typed addresses don't search. Each token's pools are summed into one row, results whose own name and ticker don't match the query are dropped, and the rest are ranked by match quality, then liquidity. Pools under $500 of liquidity are hidden (paste the address to use one anyway). Results can be sorted by market cap (the default), liquidity, 24h volume or best match; a token with no value for the chosen key goes last. The market cap is DexScreener's estimate and can be wrong or missing, so check it against the token's details card. Copycat tokens are common, so the list shows the address, price and liquidity to check against the real one. Search covers whatever DexScreener has indexed, so a token with no DEX pool won't appear.

## Crypto: majors and other tokens

The **Crypto** switch has a **Majors | Other tokens** filter. **Majors** is a short list of the biggest coins (Bitcoin, Ethereum, BNB, XRP, Solana, Cardano, Dogecoin, Litecoin, Chainlink, Avalanche). They are priced from Yahoo Finance's USD pairs, so they have years of daily history (Bitcoin from 2014) with no API key, and run through the same pipeline as stocks. **Other tokens** is the address search described above, limited by what pools and free APIs keep. Through the API, a major is `market=stock&asset=BTC-USD`.

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

## Stocks

The **Stocks** switch checks ordinary US-listed stocks and ETFs, with decades of history: "what is $100 a month into Apple since 2013 worth today?" Type a ticker or a company name (`AAPL`, `apple`, `BRK-B`, `SPY`) and pick from the matches.

- **Source:** Yahoo Finance's daily chart data, split-adjusted (Apple's 2014 7-for-1 and 2020 4-for-1 splits are already in the prices, so shares bought in 2013 are counted in today's shares). Ranges can run up to 40 years.
- **Trading days:** a stock can only be bought on a day the market is open. With the month-end basis each purchase uses the last trading day on or before the month's last day, and with the first-of-month or day-of-month basis the first trading day on or after it, never a day from the neighbouring month. A closed-market month says so in its Note ("Market closed on 2013-03-31; used 2013-03-28").
- **Dividends:** by default the result is price only. **Reinvest** switches every price to Yahoo's dividend-adjusted close, which gives the total return of reinvesting each payout. That makes the table's prices lower than the real historical prices, and the result header says which mode ran. A dividend-paying stock is understated with Ignore.
- **Wording:** results say shares, not tokens, and fractional shares are allowed (6 decimals).
- **USD only:** a stock quoted in another currency is refused with a clear message instead of being shown in the wrong unit. Indexes (`^GSPC`) and futures aren't supported; use the ETF (`SPY` for the S&P 500, `QQQ` for the Nasdaq-100).
- **Resilience:** Yahoo's endpoint is unofficial and rate-limits shared server addresses. Each ticker's full history is fetched once and kept for six hours in memory and in the Neon database (a `stock_history` table, created on first use). If Yahoo refuses and an older copy exists, that copy answers and the result carries a warning saying so. If it blocks your host outright, set `YAHOO_BASE_URL` to a proxy.
- **Ready-made checks:** under Calculate, one-click buttons run questions like "$500 a month into the S&P 500 since 1998".

## Charts

Charts are drawn as plain SVG (no charting library), in the black-and-white theme, and they resize to the screen. Hover, touch or use the arrow keys to read exact values, and Escape clears the readout.

- **Hindsight results** and **shared pages** get a chart under the summary: *Growth* (what the holding was worth on each purchase date against the total you had put in, so it dips and climbs with the market) and *Price vs your cost* (the price against your running average cost per unit, which shows why buying a fixed dollar amount lowers your average). Months with no price were never bought, so they add no point. Manual price edits redraw it.
- **Wayback** (the price lookup page) shows the prices around the moment you asked about, with that moment marked: the lookup returns them as `series` (about 2 hours of minutes, 2 days of hours, or 2 months of days, depending on the resolution used). Stocks that have split are charted at what they traded at each day.

## Public API

A versioned JSON API for other apps and AI agents, under `/api/v1`. The machine-readable description is at `/api/v1/openapi.json`.

```bash
# What is $500 a month into the S&P 500 (SPY) since 1998 worth today, dividends reinvested?
curl "https://YOUR-SITE/api/v1/dca?market=stock&asset=SPY&amount=500&from=1998-01&reinvest=true"

# Resolve a name to the market and asset to use
curl "https://YOUR-SITE/api/v1/search?q=apple"

# Ready-made questions, each with the exact call
curl "https://YOUR-SITE/api/v1/examples"
```

| Endpoint | Purpose |
|---|---|
| `GET` or `POST /api/v1/dca` | The calculation. `market` (`stock` or a chain), `asset` (ticker, address or policy id), `amount`, `from`, optional `to`, `basis`, `day`, `reinvest`, `detail` (`summary` or `full`) |
| `GET` or `POST /api/v1/historical-price` | The price of a token or stock at a past date and time (see below) |
| `GET /api/v1/search?q=&type=` | Find the `market` and `asset` for a name (`type` is `all`, `stock` or `token`) |
| `GET /api/v1/examples` | Suggested checks |
| `GET /api/v1/openapi.json` | OpenAPI 3.1 description |

The result has an `answer` sentence that is safe to quote, a `summary` (invested, units, average price, price today, value today, gain, gain percent, priced and skipped months), the `sources` and `warnings`, and with `detail=full` every month. Errors always look like `{ "error": { "code", "message", "fields" } }`, and `fields` names each bad input.

- **CORS** is open (`*`), so browser apps can call it directly.
- **Keys (optional):** set `DCA_API_KEYS` (comma-separated) and every v1 request must send one as `Authorization: Bearer <key>` or `x-api-key`. Unset, the API is open.
- **Rate limits:** 30 requests a minute per caller without a key and 120 with one (`DCA_API_RATE_LIMIT_ANON`, `DCA_API_RATE_LIMIT_KEY`). The counter lives in the Neon database so it holds across serverless instances, and falls back to per-instance counting without one. `X-RateLimit-*` and `Retry-After` headers are sent.
- It is **public if you leave `DCA_API_KEYS` unset**, and every call can use your CoinGecko and Yahoo allowance. Set keys if that matters.

## Price at a past moment

`/wayback` on the site, and `/api/v1/historical-price` in the API, answer "what was this worth at that date and time?":

```bash
# Named fields
curl "https://YOUR-SITE/api/v1/historical-price?market=ETH&asset=0x6982508145454Ce325dDbE47a25d4ec3d2311933&date=5%20days%20ago&time=13:40"

# One line of text, the way a chat command arrives, answered as a plain-text message
curl -G "https://YOUR-SITE/api/v1/historical-price" --data-urlencode "q=So11111111111111111111111111111111111111112 SOL 13:40 15/09/2026" --data-urlencode "format=text"
```

**The one line** is `<address> <chain> [time] <date> [timezone]`. Chains are `SOL`, `ETH`, `BASE`, `BSC`, `ARB`, `ADA`, or `STOCK` (the address is then a ticker). The chain can be left out for a Solana address or a Cardano policy id, since those fit only one chain; an EVM address needs it.

**Dates** are read the way people write them: `15/09/2026` (day first), `2026-09-15`, `September 15 2026`, `15 Sep`, `today`, `yesterday`, `5 days ago`, `3 weeks ago`, `5 months ago` (calendar months: 31 March minus a month is the end of February), `1 year ago`, `2 hours ago`, `30 min ago`, `now`, or a unix timestamp. With no year, it uses this year, or last year if that day hasn't happened yet this year (and a leap day with no leap year this year goes to the last leap year). It never guesses the future: that is an error. **Times** are `13:40`, `1:40pm`, `1pm`. **Timezones** are `UTC` (default), `UTC+2`, `EST`, or a name like `Europe/London`, with daylight saving handled. Whatever was assumed is returned in `when.assumptions`, and the page shows "Reads as ..." before you submit.

**What the price means.** With a time, it is the last trade before that minute (the close of the last candle that had finished). With no time, it is that day's closing price in UTC. If nothing traded for a while, that last price still stands and the answer says how old it is. The `current` field gives today's price and the change since, where it is known.

**How far back, and how precisely.** Each source can only see so far, so the lookup tries the finest data first and steps down, and the response always says which it used (`price.resolution`, `source`, `warnings`):

| Tokens on Ethereum, Base, BSC, Arbitrum, Hyperliquid, Solana | Cardano | Stocks |
|---|---|---|
| 1-minute candles from the token's top pool (GeckoTerminal), about six months back | 1-minute candles from DexHunter, converted to USD with Bitstamp's ADA/USD at the same granularity, well past six months (1-minute reaches back at least 8 months in testing) | 1-minute bars for about a week, 5-minute for two months, hourly for two years (Yahoo) |
| then hourly or daily candles | then hourly, then daily (back to late 2024 or earlier) | then the day's closing price, back decades |
| then CoinGecko hourly snapshots, out to a year on the free plan | CoinGecko hourly snapshots inside a year | A weekend or holiday gets the last close, and says so |
| Older than that: not available, with the reason. A paid CoinGecko key (`COINGECKO_PLAN=pro`) removes the one-year limit | | Stocks that have split since show the price it traded at then, plus the figure in today's shares |

Thin tokens can have quiet stretches; those are flagged, never smoothed over. When a source says "slow down" (rate limit), the lookup stops asking it and moves down the ladder, and answers for past moments are kept in memory for hours, since they never change.

**Chat bots.** `format=text` returns one ready-to-post message (the sentence, the source, any notes), and errors come back as plain text too, listing every problem. A Telegram bot is a few lines:

```js
// For: /historical-price <address> SOL 13:40 15/09/2026
const arg = ctx.message.text.replace(/^\/historical-price(@\w+)?\s*/i, "");
const res = await fetch(`https://YOUR-SITE/api/v1/historical-price?format=text&q=${encodeURIComponent(arg)}`, {
  headers: { "x-api-key": process.env.REPLAY_KEY }, // only if you set DCA_API_KEYS
});
await ctx.reply(await res.text());
```

## Agent skill

`skills/replay/SKILL.md` teaches an AI agent to use the API: how to turn "$500 a month into the S&P 500 since 1998" into a call, which ticker stands for which index, how to report the answer and its caveats, and what each error means. To use it, copy the `skills/replay` folder into your agent's skills directory (for Claude Code, `~/.claude/skills/replay` or a project's `.claude/skills/replay`). It points at the deployed site by default; set `REPLAY_URL` to use another.

## Limits

- The free CoinGecko tier serves only the last 365 days and rate-limits aggressively. Requests retry with backoff on 429 and responses are cached in memory for one hour.
- Cardano sanity check (NMKR, policy `5dac8536653edc12f6f5e1045d8164b9f59998d3bdc300fc92843489`, $200/month, Dec 2024 to Oct 2026, month-end) should land near 33.6M tokens in total, but only with a paid CoinGecko key. On the free tier the months older than 365 days show n/a and the total will be lower.
