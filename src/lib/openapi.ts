import { CHAINS } from "./types.ts";

/** The OpenAPI 3.1 description of the public API, served at /api/v1/openapi.json. */
export function openApiSpec(origin: string): Record<string, unknown> {
  const market = {
    type: "string",
    enum: ["stock", ...CHAINS],
    description: '"stock" for a listed US stock or ETF, otherwise the blockchain the token lives on.',
  };
  const params = [
    { name: "market", in: "query", required: true, schema: market },
    { name: "asset", in: "query", required: true, schema: { type: "string" }, description: "Ticker for stocks (AAPL, SPY, BRK-B). Contract address, mint or Cardano policy id for tokens." },
    { name: "amount", in: "query", required: true, schema: { type: "number", exclusiveMinimum: 0 }, description: "Invested at each buy, in `currency` (US dollars unless `currency` is given). Each buy is every month by default." },
    { name: "currency", in: "query", schema: { type: "string", example: "NGN" }, description: "Optional ISO code the amount is in (EUR, GBP, NGN ...). Each buy is converted to dollars at that day's official exchange rate. Default USD." },
    { name: "plan", in: "query", schema: { type: "string", enum: ["monthly", "quarterly", "semiannual", "yearly", "once"], default: "monthly" }, description: 'How often to buy, counted from `from`: every month, every 3 or 6 months, every year, or "once" (a single buy in the first month with a price).' },
    { name: "from", in: "query", required: true, schema: { type: "string", pattern: "^\\d{4}-\\d{2}$" }, description: "First month, YYYY-MM." },
    { name: "to", in: "query", schema: { type: "string", pattern: "^\\d{4}-\\d{2}$" }, description: "Last month, YYYY-MM. Default: the last full month." },
    { name: "leverage", in: "query", schema: { type: "number", minimum: 1, maximum: 100 }, description: "Buy with leverage, like a perpetual futures long: each buy opens its own position of amount x leverage. The response gains a `leverage` object with the totals, how many positions were liquidated and (detail=full) every position. Uses daily closes." },
    { name: "funding", in: "query", schema: { type: "number", default: 10.95 }, description: "With leverage: funding charged on the position's value, a yearly percent. 10.95 is the usual 0.01% every 8 hours." },
    { name: "topup", in: "query", schema: { type: "boolean", default: false }, description: "With leverage: add margin when a position nears liquidation, to keep it at its starting leverage." },
    { name: "topupMax", in: "query", schema: { type: "number" }, description: "With topup: the most margin, in dollars, one position may be given." },
    { name: "side", in: "query", schema: { type: "string", enum: ["long", "short"] }, description: "With leverage: long (default) gains when the price rises; short gains when it falls and is liquidated when it rises." },
    { name: "topupBudget", in: "query", schema: { type: "number" }, description: "With leverage and topup: the most extra margin, in dollars, all the positions together may be given." },
    { name: "maxLoss", in: "query", schema: { type: "number" }, description: "With leverage: close a position when it has lost this many dollars (stop loss)." },
    { name: "maxLossPct", in: "query", schema: { type: "number" }, description: "With leverage: close a position when it has lost this percent of its margin (stop loss). 100 is all of it." },
    { name: "basis", in: "query", schema: { type: "string", enum: ["month-end", "first-of-month", "day-of-month"], default: "month-end" }, description: "Which day each monthly purchase is priced on." },
    { name: "day", in: "query", schema: { type: "integer", minimum: 1, maximum: 31 }, description: 'Day of the month, with basis "day-of-month".' },
    { name: "reinvest", in: "query", schema: { type: "boolean", default: false }, description: "Stocks only. Treat dividends as reinvested (total return). Default is price only, adjusted for stock splits." },
    { name: "detail", in: "query", schema: { type: "string", enum: ["summary", "full"], default: "summary" }, description: '"full" adds every month to the response.' },
  ];
  const errorResponse = (description: string) => ({ description, content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } });

  return {
    openapi: "3.1.0",
    info: {
      title: "Replay API",
      version: "1.0.0",
      description:
        "What would a fixed monthly purchase have been worth today? Works for US stocks and ETFs (decades of history) and for tokens on Ethereum, Base, BSC, Arbitrum, Hyperliquid, Solana and Cardano. Prices are historical and indicative only. This is not financial advice.",
    },
    servers: [{ url: origin }],
    security: [{}, { ApiKey: [] }, { Bearer: [] }],
    paths: {
      "/api/v1/dca": {
        get: {
          operationId: "calculateDca",
          summary: "Calculate a dollar-cost-averaging result",
          description: 'Example: `?market=stock&asset=SPY&amount=500&from=1998-01&reinvest=true` answers "$500 a month into the S&P 500 since 1998, what is it worth today?".',
          parameters: params,
          responses: {
            "200": { description: "The result.", content: { "application/json": { schema: { $ref: "#/components/schemas/Result" } } } },
            "400": errorResponse("A field is missing or not valid. `error.fields` says which."),
            "401": errorResponse("An API key is required or not valid."),
            "404": errorResponse("The ticker or token was not found."),
            "422": errorResponse("Not supported, for example a stock not priced in USD."),
            "429": errorResponse("Too many requests, or the price provider is rate limiting."),
            "502": errorResponse("The price provider could not be reached."),
          },
        },
        post: {
          operationId: "calculateDcaPost",
          summary: "Same as GET, with a JSON body",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Request" },
                example: { market: "stock", asset: "AAPL", amount: 100, from: "2013-01", reinvest: false },
              },
            },
          },
          responses: { "200": { description: "The result.", content: { "application/json": { schema: { $ref: "#/components/schemas/Result" } } } }, "400": errorResponse("Invalid input.") },
        },
      },
      "/api/v1/historical-price": {
        get: {
          operationId: "historicalPrice",
          summary: "The price of a token or stock at a past date and time",
          description:
            "The price is the last trade before the moment asked about: the close of the last 1-minute (or hourly, or daily) candle that had finished. Give the named fields, or one line of text in `q` the way a chat command arrives: `<address> SOL 13:40 15/09/2026`. With no time you get that day's closing price (UTC). Minute-level data reaches back about six months for tokens (a year for Cardano, two for stock hours); further back you get hourly or daily prices, and the response says which.",
          parameters: [
            { name: "q", in: "query", schema: { type: "string" }, description: "One line: `<address> <chain> [time] <date> [timezone]`. Named fields below override the same part of `q`.", example: "So11111111111111111111111111111111111111112 SOL 13:40 15/09/2026" },
            { name: "market", in: "query", schema: { type: "string", enum: ["SOL", "ETH", "BASE", "BSC", "ARB", "ADA", "STOCK"] }, description: "Chain prefix. May be left out when the address only fits one chain (Solana, Cardano)." },
            { name: "asset", in: "query", schema: { type: "string" }, description: "Contract address, mint, Cardano policy id, or stock ticker." },
            { name: "date", in: "query", schema: { type: "string" }, description: "dd/mm/yyyy, 2026-09-15, `September 15 2026`, `September 15` (this year, or the last one if still ahead), `today`, `yesterday`, `5 days ago`, `3 weeks ago`, `5 months ago`, `1 year ago`, `2 hours ago`, `now`. Empty means now.", example: "5 days ago" },
            { name: "time", in: "query", schema: { type: "string" }, description: "13:40, 1:40pm or 1pm. Optional.", example: "13:40" },
            { name: "tz", in: "query", schema: { type: "string" }, description: "UTC (default), UTC+2, GMT-5, +05:30, EST, or a name like Europe/London." },
            { name: "format", in: "query", schema: { type: "string", enum: ["json", "text"], default: "json" }, description: '"text" returns one plain-text message ready to post in a chat.' },
          ],
          responses: {
            "200": { description: "The price.", content: { "application/json": { schema: { $ref: "#/components/schemas/HistoricalPrice" } }, "text/plain": { schema: { type: "string" } } } },
            "400": errorResponse("A field is missing or not valid. `error.fields` says which, all at once."),
            "404": errorResponse("No price was found for that token at that time. The message says why (for example, older than a source can see)."),
            "422": errorResponse("Not supported, for example a stock not priced in USD."),
            "429": errorResponse("Too many requests, or a price provider is rate limiting."),
          },
        },
        post: {
          operationId: "historicalPricePost",
          summary: "Same as GET, with a JSON body",
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { q: { type: "string" }, market: { type: "string" }, asset: { type: "string" }, date: { type: "string" }, time: { type: "string" }, tz: { type: "string" } } }, example: { market: "ETH", asset: "0x6982508145454Ce325dDbE47a25d4ec3d2311933", date: "5 days ago", time: "13:40" } } } },
          responses: { "200": { description: "The price.", content: { "application/json": { schema: { $ref: "#/components/schemas/HistoricalPrice" } } } }, "400": errorResponse("Invalid input.") },
        },
      },
      "/api/v1/search": {
        get: {
          operationId: "searchAssets",
          summary: "Find the market and asset to use",
          description: "Turns a name or ticker into the `market` and `asset` values that /api/v1/dca expects.",
          parameters: [
            { name: "q", in: "query", required: true, schema: { type: "string" }, description: "A company or token name, a ticker, or an address." },
            { name: "type", in: "query", schema: { type: "string", enum: ["all", "stock", "token"], default: "all" } },
          ],
          responses: { "200": { description: "Matching stocks and tokens.", content: { "application/json": { schema: { type: "object" } } } }, "400": errorResponse("q is missing.") },
        },
      },
      "/api/v1/examples": {
        get: { operationId: "listExamples", summary: "Ready-made questions with the call that answers each", responses: { "200": { description: "Examples.", content: { "application/json": { schema: { type: "object" } } } } } },
      },
    },
    components: {
      securitySchemes: {
        ApiKey: { type: "apiKey", in: "header", name: "x-api-key" },
        Bearer: { type: "http", scheme: "bearer" },
      },
      schemas: {
        Request: {
          type: "object",
          required: ["market", "asset", "amount", "from"],
          properties: {
            market,
            asset: { type: "string" },
            amount: { type: "number" },
            from: { type: "string" },
            to: { type: "string" },
            basis: { type: "string", enum: ["month-end", "first-of-month", "day-of-month"] },
            day: { type: "integer" },
            reinvest: { type: "boolean" },
            currency: { type: "string" },
            plan: { type: "string", enum: ["monthly", "quarterly", "semiannual", "yearly", "once"] },
            leverage: { type: "object", description: "{ leverage, side, fundingApr, topUp, topUpMax, topUpBudget, maxLoss, maxLossPct }" },
            detail: { type: "string", enum: ["summary", "full"] },
          },
        },
        Result: {
          type: "object",
          properties: {
            answer: { type: "string", description: "One plain-English sentence with the answer. Safe to quote." },
            request: { type: "object" },
            asset: { type: "object" },
            summary: {
              type: "object",
              properties: {
                totalMonths: { type: "integer" },
                pricedMonths: { type: "integer" },
                skippedMonths: { type: "integer" },
                skippedMonthsList: { type: "array", items: { type: "string" } },
                totalInvested: { type: "number" },
                unitsBought: { type: "number" },
                unit: { type: "string", enum: ["shares", "tokens"] },
                averageBuyPrice: { type: ["number", "null"] },
                priceToday: { type: ["number", "null"] },
                priceTodayDate: { type: "string" },
                valueToday: { type: ["number", "null"] },
                gain: { type: ["number", "null"] },
                gainPercent: { type: ["number", "null"] },
              },
            },
            months: { type: "array", items: { type: "object" }, description: 'Only with detail="full".' },
            sources: { type: "array", items: { type: "object" } },
            warnings: { type: "array", items: { type: "string" } },
          },
        },
        HistoricalPrice: {
          type: "object",
          properties: {
            answer: { type: "string", description: "One plain sentence with the answer. Safe to quote." },
            asset: { type: "object" },
            when: { type: "object", description: "The moment priced, in UTC, how the date was read, and any assumptions made." },
            price: {
              type: "object",
              properties: {
                usd: { type: "number" },
                basis: { type: "string" },
                resolution: { type: "string", description: "1-minute, 1-hour, daily, hourly snapshot..." },
                asOfUtc: { type: "string" },
                ageSeconds: { type: "integer", description: "How long before the moment this price was set. 0 means it was current." },
                open: { type: ["number", "null"] },
                high: { type: ["number", "null"] },
                low: { type: ["number", "null"] },
                close: { type: ["number", "null"] },
                volumeUsd: { type: ["number", "null"] },
                splitAdjustedUsd: { type: "number", description: "Stocks that have split since: the same price in today's shares." },
              },
            },
            current: { type: ["object", "null"], description: "The price now and the percent change since." },
            series: {
              type: "array",
              items: { type: "object", properties: { t: { type: "integer", description: "Seconds since the epoch (UTC): when this price was set." }, usd: { type: "number" } } },
              description: "Prices around the moment, oldest first, for drawing a chart. The point at `when.instantUtc` is the price returned. Empty when there are too few to draw.",
            },
            source: { type: "object" },
            warnings: { type: "array", items: { type: "string" } },
          },
        },
        Error: {
          type: "object",
          properties: {
            error: {
              type: "object",
              properties: { code: { type: "string" }, message: { type: "string" }, fields: { type: "object", additionalProperties: { type: "string" } } },
            },
          },
        },
      },
    },
  };
}
