import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCourse, placeCoins, type CourseOptions } from "../src/lib/flappyCourse.ts";

const OPTS: CourseOptions = { length: 4000, height: 360, gap: 124, maxClimb: 0.6, maxFall: 1.2, runway: 200, margin: 18 };

test("the centre line never climbs or falls faster than the limits, even when the prices jump", () => {
  // A cliff: the price halves in one step, then doubles back.
  const prices = [100, 100, 100, 50, 50, 50, 100, 100, 100];
  const c = buildCourse(prices, OPTS);
  const climbLimit = OPTS.maxClimb * c.step * 1.6; // the smoothing may steepen a corner a little
  const fallLimit = OPTS.maxFall * c.step * 1.6;
  for (let i = 1; i < c.ys.length; i++) {
    const d = c.ys[i] - c.ys[i - 1]; // positive is a fall (down the screen)
    assert.ok(d <= fallLimit, `fall of ${d} at ${i}`);
    assert.ok(-d <= climbLimit, `climb of ${-d} at ${i}`);
  }
});

test("the shape survives: a higher price is higher on screen, and the order of peaks and troughs is kept", () => {
  const prices = [10, 20, 40, 20, 10, 30, 60, 30];
  const c = buildCourse(prices, OPTS);
  assert.ok(c.ys[c.peakAt / c.step] < c.ys[c.troughAt / c.step], "the peak is above the trough on screen");
  assert.ok(c.peakAt > 0 && c.peakAt < c.length, "the peak is in the course");
});

test("the course stays inside the playing area with room for the walls, and starts and ends level", () => {
  const prices = [5, 80, 3, 95, 4, 60];
  const c = buildCourse(prices, OPTS);
  const top = OPTS.margin + OPTS.gap / 2;
  const bottom = OPTS.height - OPTS.margin - OPTS.gap / 2;
  for (const y of c.ys) assert.ok(y >= top - 1e-6 && y <= bottom + 1e-6, `${y} is out of the band`);
  assert.ok(Math.abs(c.centerAt(0) - c.centerAt(OPTS.runway / 2)) < 1, "the opening runway is level");
  assert.equal(c.length % c.step, 0);
});

test("centerAt reads between samples and clamps past the ends, and indexAt maps distance to the price series", () => {
  const prices = [1, 2, 3, 4, 5];
  const c = buildCourse(prices, OPTS);
  assert.equal(c.centerAt(-50), c.ys[0]);
  assert.equal(c.centerAt(c.length + 500), c.ys[c.ys.length - 1]);
  assert.equal(c.indexAt(0), 0);
  assert.equal(c.indexAt(c.length), prices.length - 1);
  assert.ok(c.indexAt(c.length / 2) > 0 && c.indexAt(c.length / 2) < prices.length - 1);
});

test("coins sit near the centre line, spaced out, and stay clear of the course's ends", () => {
  const c = buildCourse([1, 3, 2, 5, 4], OPTS);
  const coins = placeCoins(c);
  assert.ok(coins.length > 5);
  for (const k of coins) {
    assert.ok(Math.abs(k.y - c.centerAt(k.x)) <= c.gap * 0.3, "a coin is inside the gap");
    assert.ok(k.x > 300 && k.x < c.length - 200);
  }
  for (let i = 1; i < coins.length; i++) assert.ok(coins[i].x - coins[i - 1].x >= 100);
});

test("a flat price gives a flat tunnel, and a course needs two prices", () => {
  const c = buildCourse([7, 7, 7, 7], OPTS);
  assert.ok(Math.max(...c.ys) - Math.min(...c.ys) < 1e-6);
  assert.throws(() => buildCourse([5], OPTS));
});
