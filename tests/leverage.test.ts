import assert from "node:assert/strict";
import { test } from "node:test";
import { FEE_RATE, liquidationDropPct, liquidationPrice, simulateLeverage, type DailyClose } from "../src/lib/leverage.ts";

const close = (a: number, b: number, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);
const px = (...p: [string, number][]): DailyClose[] => p.map(([date, price]) => ({ date, price }));
const buy = (amount: number, price: number, date = "2024-01-01") => ({ month: date.slice(0, 7), date, price, amount });

test("2x with no funding: the gain is doubled, less the fees both ways", () => {
  const r = simulateLeverage({ buys: [buy(1000, 100)], daily: px(["2024-01-02", 105], ["2024-01-03", 110]), endDate: "2024-01-03", settings: { leverage: 2, fundingApr: 0 } });
  const p = r.positions[0];
  // size 20 units; +10 a unit = +200; entry fee 0.9, exit fee 0.99
  close(p.value, 1000 + 200 - FEE_RATE * 2000 - FEE_RATE * 20 * 110);
  assert.equal(p.status, "open");
  close(r.summary.gain, p.value - 1000);
});

test("a long position is liquidated when the margin left falls to the maintenance level, and the loss stops at the margin", () => {
  const r = simulateLeverage({ buys: [buy(100, 100)], daily: px(["2024-01-02", 95], ["2024-01-03", 90], ["2024-01-04", 120]), endDate: "2024-01-04", settings: { leverage: 10, fundingApr: 0 } });
  const p = r.positions[0];
  assert.equal(p.status, "liquidated");
  assert.equal(p.closeDate, "2024-01-03");
  assert.equal(p.value, 0, "the recovery to 120 comes too late");
  assert.equal(r.summary.liquidated, 1);
  assert.equal(r.summary.value, 0);
  assert.equal(r.summary.gain, -100);
});

test("the liquidation price and the distance to it match the maths", () => {
  close(liquidationPrice(100, 10), 100 * (1 - (0.1 - FEE_RATE)) / 0.99, 1e-9);
  close(liquidationDropPct(10), 9.045, 0.01);
  assert.ok(liquidationDropPct(2) > 45 && liquidationDropPct(2) < 52, "2x survives a fall of about half");
  assert.ok(liquidationDropPct(50) < 2.1, "50x is liquidated by a fall of about 2%");
  assert.ok(liquidationDropPct(100) > 0.3 && liquidationDropPct(100) < 0.6, "100x is liquidated by a fall of about half a percent, not at once");
});

test("topping up keeps the position alive, and its cap limits how much is added", () => {
  const dip = px(["2024-01-02", 93], ["2024-01-03", 91.5], ["2024-01-04", 91.5]);
  const none = simulateLeverage({ buys: [buy(100, 100)], daily: dip, endDate: "2024-01-04", settings: { leverage: 10, fundingApr: 0 } });
  const topped = simulateLeverage({ buys: [buy(100, 100)], daily: dip, endDate: "2024-01-04", settings: { leverage: 10, fundingApr: 0, topUp: true } });
  assert.equal(none.positions[0].status, "open", "a fall to 91.5 is not yet liquidation at 10x");
  assert.equal(topped.positions[0].topUpCount, 1);
  close(topped.positions[0].topUps, 91.5 - 14.55, 0.01);
  close(topped.summary.invested, 100 + topped.positions[0].topUps, 1e-9);
  // a harder fall, liquidated without the guard, saved by it
  const crash = px(["2024-01-02", 91.5], ["2024-01-03", 90.5]);
  const lost = simulateLeverage({ buys: [buy(100, 100)], daily: crash, endDate: "2024-01-03", settings: { leverage: 10, fundingApr: 0 } });
  const saved = simulateLeverage({ buys: [buy(100, 100)], daily: crash, endDate: "2024-01-03", settings: { leverage: 10, fundingApr: 0, topUp: true } });
  assert.equal(lost.positions[0].status, "liquidated");
  assert.equal(saved.positions[0].status, "open");
  const capped = simulateLeverage({ buys: [buy(100, 100)], daily: px(["2024-01-02", 91.5]), endDate: "2024-01-02", settings: { leverage: 10, fundingApr: 0, topUp: true, topUpMax: 30 } });
  close(capped.positions[0].topUps, 30, 1e-9);
});

test("a maximum loss closes the position when that much is gone", () => {
  const r = simulateLeverage({ buys: [buy(1000, 100)], daily: px(["2024-01-02", 95], ["2024-01-03", 85], ["2024-01-04", 130]), endDate: "2024-01-04", settings: { leverage: 5, fundingApr: 0, maxLoss: 300 } });
  const p = r.positions[0];
  assert.equal(p.status, "stopped");
  assert.equal(p.closeDate, "2024-01-03", "5x loses 250 at 95 (under the cap) and 750 at 85 (over it)");
  assert.ok(p.value < 1000 - 300 + 1 && p.value > 0);
});

test("a stop loss in percent is a share of the buy's margin", () => {
  const r = simulateLeverage({ buys: [buy(1000, 100)], daily: px(["2024-01-02", 95], ["2024-01-03", 85], ["2024-01-04", 130]), endDate: "2024-01-04", settings: { leverage: 5, fundingApr: 0, maxLossPct: 30 } });
  assert.equal(r.positions[0].status, "stopped");
  assert.equal(r.positions[0].closeDate, "2024-01-03");
});

test("a shared top-up budget runs out across positions", () => {
  const buys = [buy(1000, 100, "2024-01-01"), { ...buy(1000, 100, "2024-01-01"), month: "2024-02" }];
  const daily = px(["2024-01-02", 85], ["2024-01-03", 100]);
  const free = simulateLeverage({ buys, daily, endDate: "2024-01-03", settings: { leverage: 10, fundingApr: 0, topUp: true } });
  const capped = simulateLeverage({ buys, daily, endDate: "2024-01-03", settings: { leverage: 10, fundingApr: 0, topUp: true, topUpBudget: 50 } });
  assert.ok(free.summary.topUps > 50);
  close(capped.summary.topUps, 50, 1e-9);
});

test("funding is charged on the position's value, by the day", () => {
  const year = simulateLeverage({ buys: [buy(1000, 100, "2023-01-01")], daily: px(["2024-01-01", 100]), endDate: "2024-01-01", settings: { leverage: 2, fundingApr: 10.95 } });
  // 2,000 of position for a year at 10.95%
  close(year.positions[0].funding, 2000 * 0.1095, 0.5);
  const free = simulateLeverage({ buys: [buy(1000, 100, "2023-01-01")], daily: px(["2024-01-01", 100]), endDate: "2024-01-01", settings: { leverage: 2, fundingApr: 0 } });
  assert.ok(free.summary.value > year.summary.value + 200);
});

test("totals add up across several buys", () => {
  const r = simulateLeverage({ buys: [buy(100, 100, "2024-01-01"), buy(100, 110, "2024-02-01")], daily: px(["2024-02-01", 110], ["2024-03-01", 121]), endDate: "2024-03-01", settings: { leverage: 3, fundingApr: 0 } });
  assert.equal(r.positions.length, 2);
  assert.equal(r.summary.invested, 200);
  close(r.summary.value, r.positions[0].value + r.positions[1].value, 1e-9);
  assert.equal(r.summary.gainPct, (r.summary.gain / 200) * 100);
});

test("leverage is held between 1 and 100", () => {
  assert.equal(simulateLeverage({ buys: [buy(100, 100)], daily: [], endDate: "2024-01-02", settings: { leverage: 500 } }).settings.leverage, 100);
  assert.equal(simulateLeverage({ buys: [buy(100, 100)], daily: [], endDate: "2024-01-02", settings: { leverage: 0 } }).settings.leverage, 1);
});

test("the series tracks money in and worth over time", () => {
  const r = simulateLeverage({ buys: [buy(1000, 100, "2024-01-01")], daily: px(["2024-01-01", 100], ["2024-01-02", 101], ["2024-01-09", 110]), endDate: "2024-01-09", settings: { leverage: 2, fundingApr: 0 } });
  const last = r.series[r.series.length - 1];
  assert.equal(last.date, "2024-01-09");
  close(last.invested, 1000, 1e-9);
  assert.ok(last.value > 1000);
});

test("a short gains when the price falls and is liquidated when it rises", () => {
  const down = simulateLeverage({ buys: [buy(1000, 100)], daily: px(["2024-01-02", 90], ["2024-01-03", 80]), endDate: "2024-01-03", settings: { leverage: 5, side: "short", fundingApr: 0 } });
  assert.equal(down.positions[0].status, "open");
  assert.ok(down.positions[0].value > 1000 + 5 * 1000 * 0.19, "5x short on a 20% fall nets about +100% less fees");
  const up = simulateLeverage({ buys: [buy(1000, 100)], daily: px(["2024-01-02", 110], ["2024-01-03", 125]), endDate: "2024-01-03", settings: { leverage: 5, side: "short", fundingApr: 0 } });
  assert.equal(up.positions[0].status, "liquidated");
  assert.equal(up.positions[0].closeDate, "2024-01-03");
  assert.ok(up.positions[0].liquidationPrice > 100 && up.positions[0].liquidationPrice < 125);
  assert.equal(up.settings.side, "short");
});
