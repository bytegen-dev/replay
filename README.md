# Replay

Replay looks back at money. It has two pages and a public API:

- **Landing page** (`/`): what Replay is, a live demo of both tools, the waitlist, and a FAQ.
- **Hindsight** (`/hindsight`): see what a buy from the past would be worth today. Pick a US stock or ETF (decades of history), a crypto coin or token, or a currency pair, buy once or on a schedule (with or without leverage), and it shows what the buys would have bought and what they are worth now.
- **Wayback** (`/wayback`): the price of a token or stock at any past date and time, typed the way people say it.
- A **public API** and an **AI agent skill** for both.

Next.js (App Router), TypeScript, Tailwind. Dark by default, with light and system themes, a reduced-motion switch and a high-contrast mode.

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
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | The site's public address (no trailing slash), for Open Graph and the PWA. |
| `COINGECKO_API_KEY` | unset | Optional. Without it the public CoinGecko tier is used (last 365 days only). |
| `COINGECKO_PLAN` | `demo` | `demo` or `pro`. Only `pro` unlocks history older than 365 days. |
| `DATABASE_URL` | unset | A Neon Postgres connection string. Needed for Share, and used to keep stock histories and rate-limit counters. |
| `ADMIN_PASSWORD` | unset | 8 or more characters. Turns on the `/admin` page (subscribers, access codes, Tiingo keys). Also encrypts the Tiingo keys saved there, so changing it means adding them again. Needs `DATABASE_URL`. |
| `RESEND_API_KEY`, `MAIL_FROM` | unset | Turn on sign-in by emailed link (Resend). Needs `DATABASE_URL`. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | unset | An invisible Cloudflare Turnstile check for anonymous visitors. Both are needed. |
| `RUN_LIMIT_ANON_DAY`, `RUN_LIMIT_USER_DAY`, `RUN_LIMIT_TRUSTED_DAY`, `RUN_LIMIT_ANON_MINUTE`, `RUN_LIMIT_MINUTE` | 20, 2000, 5000, 10, 30 | How many times someone can run a check per day (anonymous, signed in, access code) and per minute. |
| `ACCESS_CODE`, `TIINGO_API_KEY` | unset | A built-in four-digit code (Cmd+K, or `/access-code` on a phone) that lets a browser use `TIINGO_API_KEY` for stock prices. Codes added on the admin page work beside it. |
| `DEXHUNTER_PARTNER_ID` | unset | Optional DexHunter partner key, sent if present (Cardano history). |
| `YAHOO_BASE_URL` | Yahoo directly | Comma-separated proxy base URLs, for when Yahoo blocks your server's address. |
| `DCA_API_KEYS` | unset | Comma-separated keys. If set, every `/api/v1` request must send one. |
| `DCA_API_RATE_LIMIT_ANON`, `DCA_API_RATE_LIMIT_KEY` | 30, 120 | API requests a minute per caller, without and with a key. |

### Install note

If an install reports `No matching version found for next@16.4.6`, that is stale registry metadata in the package manager cache: rerun with `pnpm install --no-prefer-offline`.

## Hindsight

The form has three tabs in its header, **Stocks**, **Crypto** and **Currencies**. Pick an asset, an amount (typed with commas as you go, in any of 50 currencies), a start and end month, and press **See what it's worth**.

- **How often you buy.** Beside the amount: **once, at the start** (what the form opens on), every month, every 3 months, every 6 months, or every year. Buying months are counted from the start month. A single buy that finds no price in the start month (a token that launched later, a gap in the data) moves *forward* to the first month with a price and says so in its Note; it never goes backwards. Other plans skip a buying month that has no price.
- **Leverage.** A 1x to 100x row models the same buys as perpetual-futures longs: each buy is its own position of `amount x leverage`, with funding on its value (default 10.95% a year), a 0.045% fee each way, liquidation when the margin left falls to the maintenance level (1% of the position, 0.5 / leverage above 50x), optional margin top-ups (with a cap) and an optional max loss per buy. It uses daily closes, so real trading is harsher. The result adds a card with the totals, the liquidations and every position; export and sharing are off while it shows. The engine is `src/lib/leverage.ts`; the API takes `leverage`, `funding`, `topup`, `topupMax` and `maxLoss`.
- **Sell at end month.** A checkbox under End month values the holding at the end month's price instead of today's. Results, exports and shared pages then say "at sale" instead of "today".
- **Buy on.** A custom day (the 15th by default), month-start, or month-end. Each buy uses that day's price, or the nearest day within 3 days.
- **First price.** An asset can't be bought before it has a price. The start month can't be set before that date (shown under the field), and a start before it moves up automatically.
- **Currency.** A non-USD amount is converted to dollars at each month's own exchange rate (see Currencies below). The sentence and a second line give the result in your currency.
- **Remembers itself.** The tab, asset, amount, currency, plan, range and options are kept in the address bar, so a reload or a copied link brings them back. A range that ends last month is stored as a length (`range=10y`), so an old link still means "the last ten years". Add `run=1` to a link and it runs on arrival.
- **Switching tab** clears the results. If they haven't been exported or shared, a dialog asks first.

### Results

The sentence, the tiles, a chart and a table. The table lists each buying month with its price, price date, amount, units bought, value, **Source** (a link to that source's page for the asset) and Note. It is a real table on phones too: it scrolls sideways with the Month column pinned. Months between buys under a plan are labelled "Not a buying month".

- **Filters.** Year, price range, order, in profit or at a loss, only months with notes, and **Only months bought** (on by default under plans that buy only some months). Filters change what the list shows, never the totals.
- **Ready-made checks.** The "Try one" buttons (S&P 500 monthly, Apple once, Bitcoin monthly and so on) show a result worked out ahead of time at once, marked with its date, then replace it with live prices. Refresh the saved results with `node --experimental-strip-types scripts/update-examples.mjs`; a check a source can't answer right now keeps its previous result.
- **Prices are read-only.** They come from the data source. Tick **Edit prices (what-if)** to type your own price for any month; edits flow into totals, the spreadsheet and shared pages, marked `manual`.
- **Insights.** Best and worst buy, the biggest drop, the longest stretch below break-even, and monthly buying against putting it all in at once.
- **Warnings** say what changed how to read the number: nearest-day prices, thin volume, a fallback source, months left out.

Token math: `tokens = ROUND(amount / price, 0)`. If any single buy would be under 100 tokens (expensive tokens), 6 decimals are used instead. Fractional shares are allowed for stocks (6 decimals).

### Charts and Replay

Charts are plain SVG (no charting library) and resize to the screen. Hover, touch or use the arrow keys for exact values. A **Dots** toggle shows or hides the dot on each month (remembered in the browser); date labels thin out to fit the width.

The growth chart has **Replay**: press play and the line draws month by month, with a speed control (1x, 2x, 4x), a slider to scrub, and a readout of what had been put in and what it was worth at each point. **Download video** (also on the Currencies chart) generates a 1280×720 video of the replay in the browser, using only the canvas and `MediaRecorder` (MP4 where the browser supports it, otherwise WebM). The video carries the title, the readout, the logo and a progress bar; keep the tab open while it generates. The button is hidden in browsers that can't record canvas video.

### Currencies

The **Currencies** tab is a currency "what if": spend a fixed amount of one currency on another every month ("₦500,000 a month into dollars since 2016"). It shows what you hold, the average rate paid, the rate today, what it is worth in the currency you spent, and a month-by-month table with each month's own rate. The pair, amount and range are in the link.

Rates are units of a currency per US dollar, from official or interbank sources (not black-market rates), tried in this order: the US Federal Reserve H.10 series on FRED (some back to 1971), the European Central Bank through Frankfurter (about 30 currencies, daily, from 1999), and the IMF's monthly end-of-period rates through DBnomics (back to the 1950s for most countries; Nigeria from 1957). Recent months are topped up from a daily feed. A month with no rate is left out, never guessed.

## How prices are chosen

### Stocks and ETFs

Ordinary US-listed stocks and ETFs, with decades of history ("what is $100 a month into Apple since 2013 worth today?"). Type a ticker or a company name and pick from the matches: the box opens with popular stocks, searches a saved list of about 12,900 US tickers instantly (refresh it with `node scripts/update-stocks.mjs`), and asks Yahoo only for listings abroad.

- **Sources.** Yahoo Finance's daily chart data, split-adjusted (Apple's 2014 and 2020 splits are already in the prices). If Yahoo refuses, the app tries **your own Tiingo key** if you set one in Settings (full history and dividends), then **Nasdaq's public data** (about ten years, split-adjusted, no dividend series). The result says which source answered and why.
- **Trading days.** A stock can only be bought on a day the market is open: month-end uses the last trading day on or before it, first-of-month the first on or after. A closed-market month says so in its Note.
- **Dividends.** By default the result is price only. **Reinvest** switches to the dividend-adjusted close, the total return of reinvesting each payout.
- **USD only.** A stock quoted in another currency is refused with a clear message. Indexes (`^GSPC`) and futures aren't supported; use the ETF (`SPY`, `QQQ`).
- **Resilience.** Each ticker's full history is fetched once and kept for six hours in memory and in the database (a `stock_history` table, created on first use). If every source refuses and an older copy exists, that copy answers with a warning.
- **Logos.** Company logos come through `/api/stock-logo`, which relays and caches them for a month.
- **Settings → your stock price key.** An optional free [Tiingo](https://www.tiingo.com/) key, kept only in your browser and sent only with stock lookups. It is used after Yahoo and before the Nasdaq backup. A refused key is reported, not hidden.

### Crypto: majors and other tokens

The **Crypto** tab has a **Majors | Other tokens** filter.

- **Majors** are the biggest coins (Bitcoin, Ethereum, BNB, XRP, Solana, Cardano, Dogecoin, Litecoin, Chainlink, Avalanche, Hyperliquid), with years of daily history and no key. Bitcoin, Ethereum and XRP come from **Bitstamp's** public exchange prices first (Bitcoin back to 2011), with Yahoo as the backup. The others come from Yahoo first, with Bitstamp as the backup where it lists the coin (its history for those is shorter, and the result says so). Each coin has a fixed first-price date, so earlier months can't be picked. Hyperliquid (HYPE) comes from Hyperliquid's own public daily prices, which start on 2024-12-05. Through the API, a major is `market=stock&asset=BTC-USD`.
- **Other tokens** use an address or policy id (or a name search). EVM chains and Solana use GeckoTerminal's top pool (daily OHLCV, free, full history). With no pool, which is always the case for Cardano, CoinGecko's coin endpoints are used.

Every month targets the last day or the first day of the month (or a chosen day), using the UTC daily point for that date. If it is missing, the nearest day within 3 days is used (ties go to the earlier day) and the Note says which. No price within 3 days, a month still in the future, or a month older than the free CoinGecko 365-day window: **n/a**. Nothing is guessed or interpolated, and n/a months are excluded from all totals. Warning flags: nearest-day, very low volume (under $1,000 in 24h), and a price more than 50% away from the median of the surrounding days.

### Token details

Once the address is valid, a card appears before you calculate, so a wrong token shows up early. `/api/token-info` merges CoinGecko (name, logo, description, market cap, supply, rank, links) and DexScreener (live price, liquidity, 24h volume, banner, social links). DexScreener doesn't cover Cardano. A field a source doesn't provide is left out, never guessed; only `https://` links and images are used.

### Search or paste

The address box is also the search box. Paste an address or policy ID and it works as a plain input; type a name or ticker and matching tokens drop down (arrow keys and Enter work). Search runs through DexScreener across Ethereum, Base, BSC, Arbitrum, Solana and Cardano. Pools under $500 of liquidity are hidden (paste the address to use one anyway). Copycat tokens are common, so the list shows the address, price and liquidity to check against the real one.

### Cardano history

CoinGecko is the primary source for Cardano, but its free tier stops at 365 days. Months it can't price are filled, only those days and only when something is missing, in this order:

1. **DexHunter** (`charts.dhapi.io`): daily candles for the token against ADA, aggregated across Cardano DEXs, with history well past a year. ADA prices are converted to USD with **Bitstamp's** ADA/USD daily close for the same UTC day (a day with no close is dropped, never estimated). Where it overlaps GeckoTerminal it agrees to within about 1 to 2%. DexHunter's docs ask for a partner key; set `DEXHUNTER_PARTNER_ID` if it starts refusing requests.
2. **GeckoTerminal pools** (up to four, deepest first) for anything still empty. Pool candles exist only on days with trades, so for these prices only, when nothing traded within 3 days of the target, the nearest actual trade up to 7 days away is used and the Note says how far and which way.

CoinGecko always wins on days it has a price. Whatever is still empty stays n/a. With a policy ID alone, the app finds the full asset ID by searching GeckoTerminal; if you paste the full asset ID (policy plus token name in hex), it uses that directly.

## Wayback

`/wayback` on the site, and `/api/v1/historical-price` in the API, answer "what was this worth at that date and time?" (the old `/price` address redirects here). The page has **Stocks** and **Crypto** tabs, a calendar that can't go earlier than the asset's first price, an analog clock with AM/PM for the time, and a searchable timezone list.

```bash
# Named fields
curl "https://YOUR-SITE/api/v1/historical-price?market=ETH&asset=0x6982508145454Ce325dDbE47a25d4ec3d2311933&date=5%20days%20ago&time=13:40"

# One line of text, the way a chat command arrives, answered as a plain-text message
curl -G "https://YOUR-SITE/api/v1/historical-price" --data-urlencode "q=So11111111111111111111111111111111111111112 SOL 13:40 15/09/2026" --data-urlencode "format=text"
```

**The one line** is `<address> <chain> [time] <date> [timezone]`. Chains are `SOL`, `ETH`, `BASE`, `BSC`, `ARB`, `ADA`, or `STOCK` (the address is then a ticker). The chain can be left out for a Solana address or a Cardano policy id; an EVM address needs it.

**Dates** are read the way people write them: `15/09/2026` (day first), `2026-09-15`, `September 15 2026`, `15 Sep`, `today`, `yesterday`, `5 days ago`, `3 weeks ago`, `5 months ago` (calendar months), `1 year ago`, `2 hours ago`, `30 min ago`, `now`, or a unix timestamp. With no year, it uses this year, or last year if that day hasn't happened yet. It never guesses the future: that is an error. **Times** are `13:40`, `1:40pm`, `1pm`. **Timezones** are `UTC` (default), `UTC+2`, `EST`, or a name like `Europe/London`, with daylight saving handled. Whatever was assumed is returned in `when.assumptions`, and the page shows "Reads as ..." before you submit.

**What the price means.** With a time, it is the last trade before that minute. With no time, it is that day's closing price in UTC. If nothing traded for a while, that last price still stands and the answer says how old it is.

**How far back, and how precisely.** The lookup tries the finest data first and steps down, and the response says which it used (`price.resolution`, `source`, `warnings`):

| Tokens on Ethereum, Base, BSC, Arbitrum, Hyperliquid, Solana | Cardano | Stocks |
|---|---|---|
| 1-minute candles from the token's top pool (GeckoTerminal), about six months back | 1-minute candles from DexHunter, converted with Bitstamp's ADA/USD, well past six months | 1-minute bars for about a week, 5-minute for two months, hourly for two years (Yahoo) |
| then hourly or daily candles | then hourly, then daily | then the day's closing price, back decades |
| then CoinGecko hourly snapshots, out to a year on the free plan | CoinGecko hourly snapshots inside a year | A weekend or holiday gets the last close, and says so |
| Older: not available, with the reason (`COINGECKO_PLAN=pro` removes the one-year limit) | | Stocks that have split show the price it traded at then, plus the figure in today's shares |

Thin tokens can have quiet stretches; those are flagged, never smoothed over. When a source says "slow down", the lookup moves down the ladder, and answers for past moments are kept in memory for hours.

**Chat bots.** `format=text` returns one ready-to-post message, and errors come back as plain text too. A Telegram bot is a few lines:

```js
// For: /historical-price <address> SOL 13:40 15/09/2026
const arg = ctx.message.text.replace(/^\/historical-price(@\w+)?\s*/i, "");
const res = await fetch(`https://YOUR-SITE/api/v1/historical-price?format=text&q=${encodeURIComponent(arg)}`, {
  headers: { "x-api-key": process.env.REPLAY_KEY }, // only if you set DCA_API_KEYS
});
await ctx.reply(await res.text());
```

## Export and share

**Export spreadsheet** (`.xlsx`, built server-side from the table you see): `Summary`, `Buys` and `Sources` sheets with the Replay logo. Blue font is a hardcoded input, black is a formula (`ROUND(amount/price, decimals)`, `SUM` totals). Months between buys are listed with a zero amount.

**Share** saves the current result (including edited prices) and returns a public link like `/r/k3x9a2Qw`. Anyone with the link sees a read-only copy. The link is unlisted (`noindex`), not private.

- **Storage:** Neon Postgres via `@neondatabase/serverless` (`DATABASE_URL`; on Vercel, add Neon from the Marketplace). The `shares` table is created on first use. Without it the Share button shows a clear error and everything else works.
- **Delete:** right after saving, the page can delete the link. The delete secret is shown to that browser session only and only its hash is stored.
- **Limits:** at most 72 months and 200 KB per share, 20 saves an hour per client. The server rebuilds the payload from a whitelist of fields, and only `https://` source links are kept.

## Settings

The footer's **Settings** opens a dialog: theme (light, system, dark), **Reduce animations**, **High contrast**, and the optional Tiingo key. Everything is saved in the browser. The footer also has a timeline: click a date on it, then pick Stocks, Bitcoin or a currency to start a Hindsight check from that month.

## Public API

A versioned JSON API for other apps and AI agents, under `/api/v1`. The machine-readable description is at `/api/v1/openapi.json`.

```bash
# $500 a month into the S&P 500 (SPY) since 1998, dividends reinvested
curl "https://YOUR-SITE/api/v1/dca?market=stock&asset=SPY&amount=500&from=1998-01&reinvest=true"

# One purchase of 5,000,000 naira into Bitcoin in January 2021
curl "https://YOUR-SITE/api/v1/dca?market=stock&asset=BTC-USD&amount=5000000&currency=NGN&plan=once&from=2021-01"

# Resolve a name to the market and asset to use
curl "https://YOUR-SITE/api/v1/search?q=apple"
```

| Endpoint | Purpose |
|---|---|
| `GET` or `POST /api/v1/dca` | The calculation. `market` (`stock` or a chain), `asset`, `amount`, `from`, optional `to`, `currency`, `plan` (`monthly`, `quarterly`, `semiannual`, `yearly`, `once`), `basis`, `day`, `reinvest`, `detail` (`summary` or `full`) |
| `GET` or `POST /api/v1/historical-price` | The price at a past moment (see Wayback) |
| `GET /api/v1/search?q=&type=` | Find the `market` and `asset` for a name (`type` is `all`, `stock` or `token`) |
| `GET /api/v1/examples` | Suggested checks |
| `GET /api/v1/openapi.json` | OpenAPI 3.1 description |

The result has an `answer` sentence that is safe to quote, a `summary`, the `sources` and `warnings`, and with `detail=full` every month. Errors always look like `{ "error": { "code", "message", "fields" } }`.

- **CORS** is open (`*`), so browser apps can call it directly.
- **Keys (optional):** set `DCA_API_KEYS` and every request must send one as `Authorization: Bearer <key>` or `x-api-key`.
- **Rate limits:** 30 requests a minute per caller without a key and 120 with one. The counter lives in the database so it holds across serverless instances. `X-RateLimit-*` and `Retry-After` headers are sent.
- The API is **public if you leave `DCA_API_KEYS` unset**, and every call can use your CoinGecko and Yahoo allowance.

## Agent skill

`skills/replay/SKILL.md` teaches an AI agent to use the API: how to turn "$500 a month into the S&P 500 since 1998" into a call, which ticker stands for which index, how to report the answer and its caveats, and what each error means. To use it, copy the `skills/replay` folder into your agent's skills directory (for Claude Code, `~/.claude/skills/replay` or a project's `.claude/skills/replay`). It points at the deployed site by default; set `REPLAY_URL` to use another.

## PWA

`public/manifest.webmanifest` and `public/sw.js` enable install and basic offline shell caching. Set `NEXT_PUBLIC_SITE_URL` in production so metadata uses the correct origin.

## Tests

`pnpm test` runs Node's built-in test runner on the TypeScript files in `tests/` (no extra test dependency): price selection, token and share maths, buy plans, exchange rates, the saved ticker list, the backup sources, filters, settings, URL state, the API and exports.

## Limits

- The free CoinGecko tier serves only the last 365 days and rate-limits aggressively. Requests retry with backoff on 429 and responses are cached in memory for one hour.
- Yahoo Finance's endpoint is unofficial and blocks by address. The Nasdaq and Tiingo fallbacks and the Bitstamp prices for majors reduce the impact, but a stock or coin that only Yahoo has can fail while Yahoo is blocking your server. Set `YAHOO_BASE_URL` to a proxy if that happens.
- Currency rates are official or interbank, which can be far from the rate you could actually get, in some years by a wide margin.
- This is a historical backtest. It is not a forecast and not financial advice, and it ignores taxes, fees and spreads.
