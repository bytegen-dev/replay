import assert from "node:assert/strict";
import { test } from "node:test";
import { coinMoney, coinRows, compactAmount, smallNumber, unitPrice } from "../src/lib/fumble/coins.ts";
import { showIn, SOL_UNIT, USD_UNIT } from "../src/lib/fumble/money.ts";
import type { ApiTrade } from "../src/lib/fumble/service.ts";

const t = (signature: string, side: "buy" | "sell", token: string, tokens: number, sol: number, time: number): ApiTrade => ({ signature, side, token, tokens, sol, time });

test("a coin bought in two parts and sold out has total money, average entry and exit, and no balance", () => {
  const trades = [t("b1", "buy", "A", 100, 1, 10), t("b2", "buy", "A", 100, 3, 20), t("s1", "sell", "A", 200, 6, 30)];
  const [c] = coinRows(trades, { s1: { profitSol: 2, matchedTokens: 200 } });
  assert.equal(c.boughtSol, 4);
  assert.equal(c.boughtTokens, 200);
  assert.equal(c.soldSol, 6);
  assert.equal(c.avgEntrySol, 0.02);
  assert.equal(c.avgExitSol, 0.03);
  assert.equal(c.balance, 0);
  assert.equal(c.profitSol, 2);
  assert.equal(c.profitPct, 0.5); // 2 profit on 4 cost
  assert.equal(c.firstAt, 10);
  assert.equal(c.lastAt, 30);
});

test("a coin only partly sold keeps a balance, and one only bought has no exit or profit", () => {
  const [partly] = coinRows([t("b", "buy", "A", 100, 1, 1), t("s", "sell", "A", 40, 0.8, 2)], { s: { profitSol: 0.4, matchedTokens: 40 } });
  assert.equal(partly.balance, 60);
  const [held] = coinRows([t("b", "buy", "A", 100, 1, 1)], {});
  assert.equal(held.balance, 100);
  assert.equal(held.avgExitSol, null);
  assert.equal(held.profitSol, null);
  assert.equal(held.costUnknown, false);
});

test("dust left after selling counts as sold out", () => {
  const [c] = coinRows([t("b", "buy", "A", 1000, 1, 1), t("s", "sell", "A", 998, 2, 2)], { s: { profitSol: 1, matchedTokens: 998 } });
  assert.equal(c.balance, 0);
});

test("selling more than the trades read show bought marks the row partial", () => {
  const [c] = coinRows([t("b", "buy", "A", 50, 1, 1), t("s", "sell", "A", 100, 3, 2)], { s: { profitSol: 1, matchedTokens: 50 } });
  assert.equal(c.partial, true);
  assert.equal(c.balance, 0);
});

test("a sell with no matched buy has an unknown cost, and before profits are known there is none to show", () => {
  const sells = [t("s", "sell", "A", 100, 3, 2)];
  assert.equal(coinRows(sells, { s: { profitSol: 0, matchedTokens: 0 } })[0].costUnknown, true);
  const early = coinRows(sells, {})[0];
  assert.equal(early.profitSol, null);
  assert.equal(early.costUnknown, false);
});

test("coins are listed by their latest trade, newest first, with the scan's extras attached", () => {
  const rows = coinRows([t("a", "buy", "A", 1, 1, 5), t("b", "buy", "B", 1, 1, 9)], {}, [{ token: "B", boughtUsd: 100, soldUsd: null, profitUsd: null, missedSol: 0, missedUsd: 0 }]);
  assert.deepEqual(rows.map((r) => r.mint), ["B", "A"]);
  assert.equal(rows[0].extra?.boughtUsd, 100);
  assert.equal(rows[1].extra, null);
});

test("small numbers keep their zeros short, and token amounts are compact", () => {
  assert.equal(smallNumber(0.0000042), "0.0₅42");
  assert.equal(smallNumber(0.008), "0.0₂8");
  assert.equal(smallNumber(0.741), "0.741");
  assert.equal(smallNumber(3.558), "3.558");
  assert.equal(compactAmount(7_280_000), "7.28M");
  assert.equal(compactAmount(342.3), "342.3");
  assert.equal(compactAmount(1500), "1.50K");
});

test("money follows the chosen currency, and falls back to SOL without a dollar value", () => {
  const [c] = coinRows([t("b", "buy", "A", 100, 1, 1), t("s", "sell", "A", 100, 2, 2)], { s: { profitSol: 1, matchedTokens: 100 } }, [{ token: "A", boughtUsd: 150, soldUsd: 300, profitUsd: 150, missedSol: 0, missedUsd: 0 }]);
  const usd = coinMoney(c, showIn(USD_UNIT, SOL_UNIT));
  assert.equal(usd.bought, "$150");
  assert.equal(usd.sold, "$300");
  assert.equal(usd.profit?.main, "+$150");
  assert.equal(usd.entry, "$1.5");
  assert.equal(usd.exit, "$3");
  const sol = coinMoney(c, showIn(SOL_UNIT, USD_UNIT));
  assert.equal(sol.bought, "1.00 SOL");
  assert.equal(sol.entry, "0.01 SOL");
  assert.equal(unitPrice(showIn(USD_UNIT, null), 0.01, null), "0.01 SOL");
});
