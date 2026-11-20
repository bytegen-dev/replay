---
name: replay
description: Answers "what would $X a month into <stock, ETF or token> since <date> be worth today?" by calling the Replay API. Use it whenever someone asks about dollar-cost averaging, monthly or recurring investing, "if I had invested", backtesting a fixed monthly purchase, or comparing what a regular investment into the S&P 500, Apple, Nasdaq, Berkshire, a crypto token or similar would be worth now. Also answers "what was X worth on <date> at <time>?" (the price of a token or stock at a past moment). Covers US stocks and ETFs with decades of history, the major coins (Bitcoin, Ethereum and others), and tokens on Ethereum, Base, BSC, Arbitrum, Solana and Cardano. Buys can be every month, every few months, yearly or a single lump sum, and the amount can be in another currency (for example naira or euros).
---

# Replay

Backtests a fixed purchase: invest a set amount on a schedule (every month by default), then see what the holding is worth today. On the website this is the **Hindsight** page, and the price-at-a-moment lookup is **Wayback**. The API does all the math with real historical prices. Your job is to turn the question into one API call, then report the result faithfully.

**Base URL:** `https://dca-checker-neon.vercel.app` (use `$REPLAY_URL` instead if the environment sets it; the address will change if the site is moved to its own domain).
**Auth:** none by default. If the server was set up with keys, send `Authorization: Bearer <key>` (or `x-api-key`); a `401` means a key is needed.
**Machine-readable spec:** `GET /api/v1/openapi.json`.

## The one call

```
GET /api/v1/dca?market=stock&asset=SPY&amount=500&from=1998-01&reinvest=true
```

| Parameter | Required | Meaning |
|---|---|---|
| `market` | yes | `stock` for a US-listed stock or ETF (also the major coins, as `asset=BTC-USD`, `ETH-USD`, `SOL-USD` ...), otherwise the chain: `ethereum`, `base`, `bsc`, `arbitrum`, `hyperevm` (Hyperliquid), `solana`, `cardano` |
| `asset` | yes | Ticker for stocks (`AAPL`, `SPY`, `BRK-B`). Contract address, mint, or Cardano policy id for tokens |
| `amount` | yes | Invested at each buy, in `currency` (dollars unless a currency is given) |
| `currency` | no | ISO code the amount is in (`EUR`, `GBP`, `NGN` ...). Each buy is converted to dollars at that day's official rate. Default `USD` |
| `leverage` | no | 1 to 100. Models the buys as perpetual futures longs (each buy its own position). Also `funding` (yearly %, default 10.95), `topup=true`, `topupMax`, `maxLoss` (dollars per buy). The result gains a `leverage` object and the `answer` says how many positions were liquidated |
| `plan` | no | How often to buy, counted from `from`: `monthly` (default), `quarterly` (every 3 months), `semiannual` (every 6), `yearly`, or `once` (a single buy; if the start month has no price it moves forward to the first month with one) |
| `from` | yes | First month, `YYYY-MM` |
| `to` | no | Last month, `YYYY-MM`. Default is the last full month. Leave it out for "until today" |
| `basis` | no | `month-end` (default), `first-of-month`, or `day-of-month` with `day=15` |
| `reinvest` | no | Stocks only. `true` reinvests dividends (total return). Default `false` is price only |
| `detail` | no | `summary` (default) or `full`, which adds every month |

A `POST` with the same fields as JSON also works. Limits: stocks up to 40 years (480 months), tokens up to 6 years. The `answer` sentence reads "$500 a month for 120 months", "$500 every 3 months for 40 buys" or "$5,000 once", matching the plan.

## What comes back

```json
{
  "answer": "$500.00 a month for 346 months bought 2,203.5 shares of SPY for $173,000.00. Today that is worth $1,420,000.00, a gain of $1,247,000.00 (+720.8%).",
  "summary": { "totalInvested": 173000, "unitsBought": 2203.5, "unit": "shares", "averageBuyPrice": 78.5,
               "priceToday": 644.5, "priceTodayDate": "2026-11-18", "valueToday": 1420000, "gain": 1247000,
               "gainPercent": 720.8, "pricedMonths": 346, "totalMonths": 346, "skippedMonths": 0, "skippedMonthsList": [], "skippedMonthRanges": [] },
  "sources": [...], "warnings": [...]
}
```

(Numbers above are illustrative. Never reuse them. Always report what the API returns.)

## How to work

1. **Pin down the asset.** If the user gives a name, not a ticker or address, resolve it first with `GET /api/v1/search?q=apple` (add `&type=stock` or `&type=token`). It returns the exact `market` and `asset` to use. For tokens, copycats are common: pick the result with real liquidity and tell the user which one you used.
2. **Map common phrases.**
   - "S&P 500" -> `asset=SPY`, `reinvest=true` (SPY is the S&P 500 ETF, trading since 1993). Say you used SPY.
   - "Nasdaq" / "Nasdaq 100" -> `QQQ` (trading since 1999).
   - "the market", "total market" -> `VTI` (since 2001).
   - "since 1998" -> `from=1998-01`. "Since 2013" -> `from=2013-01`. A bare year means January of that year.
   - "per month", "monthly", "a month" -> `amount`. "Every quarter" -> `plan=quarterly`, "every 6 months" -> `semiannual`, "yearly" or "once a year" -> `yearly`, "lump sum", "all at once" or "one purchase" -> `plan=once`. "$500 weekly" is not supported; say so and offer the closest monthly figure.
   - "With 5x leverage", "futures", "leveraged" -> `leverage=5`. Say it is a daily-close estimate of futures trading: liquidations, funding and fees are modeled, but real trading can be harsher, and it is not advice to use leverage.
   - "In naira", "₦100,000 a month", "€200" -> `currency=NGN` / `EUR` with `amount` in that currency. Rates are official or interbank, not street rates; say so for currencies where the two differ a lot.
   - "Bitcoin", "Ethereum", "Solana" -> `market=stock&asset=BTC-USD` (or `ETH-USD`, `SOL-USD`); these have fixed first-price dates and the API says if the range starts too early.
   - Indexes themselves (`^GSPC`), futures, and non-USD listings are not supported. Use the ETF.
3. **Call the API once.** Use `detail=summary` unless the user wants the month-by-month table.
4. **Report the result.** Lead with the `answer` sentence, which is safe to quote. Add 1 to 3 facts that matter from `summary` (units bought, average buy price, gain percent). Do not recompute or round the numbers differently.
5. **Always pass on the caveats.** Read `warnings` and tell the user anything that changes how they should read the number:
   - **Dividends:** with `reinvest=false` dividends are not counted, so a dividend-paying stock is understated. Say which mode you used, and offer to rerun the other way.
   - **Skipped months:** if `skippedMonths > 0` the answer says "17 of 23 months". Name the missing stretches from `skippedMonthRanges` (for example "1998-01 to 2012-11") and why (warnings explain it).
   - **Thin tokens:** if prices came from a thin pool (low-volume notes, or a source other than CoinGecko), say those months are rough.
   - **Stale data:** a warning about a "copy saved on <date>" means prices may be a little old.
6. **Offer the next step**, such as a different amount, start date, or the other dividend mode.

## Rules

- **Never invent a price, a return, or a missing month.** If the API cannot answer, say so and say why.
- This is a historical backtest. It is not a forecast and not financial advice. State that once, briefly, when giving a result that someone might act on.
- Past results ignore taxes, fees, and spreads.
- Do not call the API in a loop. One question is one call; use `detail=full` rather than many calls.

## Errors

Errors are `{ "error": { "code", "message", "fields" } }`.

| Status / code | Meaning | What to do |
|---|---|---|
| 400 `invalid_request` | A parameter is missing or wrong. `fields` names each one | Fix it and retry once |
| 401 `api_key_required` / `invalid_api_key` | The server wants a key | Ask the user for a key |
| 404 `not_found` | Unknown ticker or token | Search for it; check the spelling |
| 422 `unsupported` | For example, a stock not priced in USD | Explain; suggest a USD-listed alternative |
| 429 `rate_limited` | Too many requests (`retry-after` header) | Wait that long once, then retry |
| 429 `upstream_rate_limited`, 502 `upstream_unavailable` | The price provider is busy or down | Tell the user, retry once after a minute |

## Price at a past moment

For "what was X worth on 15 September at 13:40?" or "what was it 5 days ago?", use the price endpoint, not the backtest:

```
GET /api/v1/historical-price?q=<address> SOL 13:40 15/09/2026&format=text
GET /api/v1/historical-price?market=ETH&asset=<address>&date=5 days ago&time=13:40
```

| Parameter | Meaning |
|---|---|
| `q` | One line, in this order: `<address> <chain> [time] <date> [timezone]`. Easiest when the user typed a chat command |
| `market` | Chain prefix: `SOL`, `ETH`, `BASE`, `BSC`, `ARB`, `ADA`, or `STOCK` for a ticker. May be left out for a Solana address or a Cardano policy id. An EVM address (`0x...`) needs one |
| `asset` | Contract address, mint, Cardano policy id, or stock ticker |
| `date` | `15/09/2026` (day first), `2026-09-15`, `September 15 2026`, `September 15` (this year, or last year's if still ahead), `today`, `yesterday`, `5 days ago`, `3 weeks ago`, `5 months ago`, `1 year ago`, `2 hours ago`, `now` |
| `time` | `13:40`, `1:40pm`, `1pm`. Optional |
| `tz` | `UTC` (default), `UTC+2`, `EST`, `Europe/London`. Optional |
| `format` | `text` gives one chat-ready message instead of JSON |

How to read the result:

- With a **time**, the price is the last trade before that minute. With **no time**, it is that day's **closing price** (UTC). Say which one you are giving.
- Always quote `answer`. It already says the resolution and how the price compares with now.
- `price.resolution` tells you how precise it is: `1-minute`, `1-hour`, `daily`, or `hourly snapshot`. Tokens get minute precision about six months back (Cardano about a year), then hourly out to a year, and nothing beyond that without a paid data plan. If you got a coarser price than the user asked for, `warnings` says why. Pass that on.
- If `price.ageSeconds` is large, nothing traded for a while and the price is the last known one. Tell the user.
- Stocks: if the market was closed you get the last close or last bar, and the answer says so. `price.usd` is what the stock traded at then; `price.splitAdjustedUsd` is the same price in today's shares after splits.
- `when.assumptions` lists anything guessed (for example "No year given, so used 2026"). Mention it when it matters.
- A `400` lists every bad field at once in `error.fields` (for example the chain missing, or a date it could not read). Fix them together and retry once. A `404` says why no price was found (usually: older than a source can see, or the token had not traded yet). Do not guess a price.

## Suggested checks

`GET /api/v1/examples` returns ready-made questions, each with the exact call that answers it. Good ones to offer when the user is not sure what to ask:

- $500 a month into the S&P 500 since January 2017, or since January 1998 with dividends reinvested.
- $5,000 into Apple in a single buy in January 2017 (`plan=once`).
- $200 a month into Bitcoin since January 2020 (`asset=BTC-USD`).
- $1,000 into Ethereum in a single buy in January 2021 (`plan=once`).
- $250 a month into the Nasdaq-100 since January 2017, dividends reinvested.

`GET /api/v1/examples` also returns `priceExamples`: ready-made price lookups, each as a chat command and as the exact call.

## Quick checks

```bash
# Resolve a name
curl -s "$BASE/api/v1/search?q=berkshire&type=stock"

# S&P 500 since 1998, $500 a month, dividends reinvested
curl -s "$BASE/api/v1/dca?market=stock&asset=SPY&amount=500&from=1998-01&reinvest=true"

# The same, with every month
curl -s "$BASE/api/v1/dca?market=stock&asset=SPY&amount=500&from=1998-01&reinvest=true&detail=full"
```
