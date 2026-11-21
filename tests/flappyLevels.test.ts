import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCourse, buildEndless, placeObstacles, type Obstacle, type Track } from "../src/lib/flappyCourse.ts";
import { finishAt, flap, hitsObstacle, hitsWall, newBird, obstacleSpan, step, PLAY_H } from "../src/lib/flappyPhysics.ts";
import { getLevels, getSurvivalSegments, SCROLL_SPEED, SURVIVAL_COURSE, survivalObstacles, survivalSpeed } from "../src/lib/gameLevels.ts";

/**
 * A simple, human-like autopilot flies every level with the game's own physics. It looks a little way ahead, flaps when it is below
 * where it wants to be, and never flaps faster than a person can tap (about six times a second). If it can clear a level, a person can.
 */
/** Where an autopilot should aim to get through a candle: the middle of the gap it leaves, a little before it and until Tony is past. */
function aimShift(track: Track, obstacles: Obstacle[], x: number, ahead: number, cycle = Infinity): number {
  const lap = Number.isFinite(cycle) ? Math.floor(x / cycle) : 0;
  const base = Number.isFinite(cycle) ? lap * cycle : 0;
  for (const o of obstacles) {
    const ox = base + o.x;
    if (ox > x - 30 && ox < x + ahead) {
      const { top, bottom } = obstacleSpan(o, track, ox);
      const len = bottom - top;
      return o.side === "top" ? len / 2 : -len / 2;
    }
  }
  return 0;
}

function fly(levelIndex: number, reaction = 0.12): { cleared: boolean; at: number; taps: number } {
  const level = getLevels()[levelIndex];
  const course = buildCourse(level.prices, { ...level.course, length: level.seconds * SCROLL_SPEED, height: PLAY_H, runway: 220, margin: 18 });
  const bird = newBird(course);
  const obstacles = level.obstacles ? placeObstacles(course, { from: 700, to: finishAt(course) - 500, ...level.obstacles }) : [];
  const dt = 1 / 120;
  let sinceFlap = 1;
  let taps = 0;
  let t = 0;
  while (bird.x < finishAt(course) && t < level.seconds * 2) {
    // Aim a little ahead of Tony (people anticipate), a touch above the centre so a flap does not overshoot the roof, and through
    // the gap of any candle that is coming.
    const ahead = course.centerAt(bird.x + 40 + Math.max(0, -bird.vy) * 0.1);
    const want = ahead + 4 + aimShift(course, obstacles, bird.x, 150);
    sinceFlap += dt;
    if (bird.y > want && bird.vy > -120 && sinceFlap > reaction) {
      flap(bird);
      sinceFlap = 0;
      taps++;
    }
    step(bird, dt, SCROLL_SPEED);
    t += dt;
    if (hitsWall(bird, course) || hitsObstacle(bird, course, obstacles)) return { cleared: false, at: bird.x, taps };
  }
  return { cleared: bird.x >= finishAt(course), at: bird.x, taps };
}

test("every level has real data and a course a person can fly", () => {
  const levels = getLevels();
  assert.equal(levels.length, 3);
  for (const l of levels) {
    assert.ok(l.prices.length >= 20 && l.prices.length === l.times.length, l.id);
    assert.ok(l.times.every((t, i) => i === 0 || t > l.times[i - 1]), `${l.id}: dates run forward`);
    assert.ok(l.prices.every((p) => p > 0), `${l.id}: prices are positive`);
  }
});

test("a human-like autopilot can clear every level, and never needs to tap faster than a person can", () => {
  getLevels().forEach((l, i) => {
    const r = fly(i);
    assert.ok(r.cleared, `${l.id} was not cleared: crashed at ${Math.round(r.at)}px`);
    assert.ok(r.taps / l.seconds < 6, `${l.id} needs ${(r.taps / l.seconds).toFixed(1)} taps a second`);
  });
});

test("a slower reaction (about a quarter of a second between taps) still clears them, so the levels are forgiving", () => {
  getLevels().forEach((l, i) => {
    const r = fly(i, 0.25);
    assert.ok(r.cleared, `${l.id} was not cleared with slower taps: crashed at ${Math.round(r.at)}px`);
  });
});

test("doing nothing crashes quickly, so the game is not won by standing still", () => {
  const level = getLevels()[0];
  const course = buildCourse(level.prices, { ...level.course, length: level.seconds * SCROLL_SPEED, height: PLAY_H, runway: 220, margin: 18 });
  const bird = newBird(course);
  let t = 0;
  while (!hitsWall(bird, course) && t < 5) {
    step(bird, 1 / 120, SCROLL_SPEED);
    t += 1 / 120;
  }
  assert.ok(t < 3, `survived ${t.toFixed(1)}s without a tap`);
});

test("the Survival run has all five assets, from 2018, and goes round again without a jump", () => {
  const segs = getSurvivalSegments();
  assert.equal(segs.length, 5);
  assert.deepEqual(segs.map((x) => x.label.split(" ")[0]), ["Bitcoin", "Ethereum", "S&P", "NVIDIA", "Tesla"]);
  for (const x of segs) assert.ok(x.times[0] >= Date.parse("2018-01-01T00:00:00Z") && x.times[0] < Date.parse("2018-01-10T00:00:00Z"), `${x.label} starts in January 2018`);
  const c = buildEndless(segs, SURVIVAL_COURSE);
  assert.ok(Math.abs(c.centerAt(c.cycle - 0.1) - c.centerAt(0)) < 1, "the lap joins up");
  assert.ok(Math.abs(c.centerAt(c.cycle * 2 + 12) - c.centerAt(12)) < 1e-6, "every lap is the same shape");
  assert.equal(c.segmentAt(10).segment, 0);
  assert.equal(c.segmentAt(c.cycle - 500).segment, 4);
  assert.ok(c.gapAt(0) > c.gapAt(c.cycle * 3), "the tunnel narrows as the run goes on");
  assert.ok(c.gapAt(c.cycle * 50) >= 98, "but never closes");
});

test("a human-like autopilot survives the whole first lap of the Survival run, candles and all, at its rising speed", () => {
  const c = buildEndless(getSurvivalSegments(), SURVIVAL_COURSE);
  const bird = newBird(c);
  const lapObstacles = [survivalObstacles(c, 0), survivalObstacles(c, 1), survivalObstacles(c, 2)];
  const dt = 1 / 120;
  let since = 1;
  let t = 0;
  let taps = 0;
  while (bird.x < c.cycle && t < 600) {
    // People look further ahead the faster things go: about a quarter of a second's worth of the course.
    const speed = survivalSpeed(bird.x);
    const lap = Math.floor(bird.x / c.cycle);
    const want = c.centerAt(bird.x + speed * 0.27 + Math.max(0, -bird.vy) * 0.1) + 4 + aimShift(c, lapObstacles[lap], bird.x, speed * 0.9, c.cycle);
    since += dt;
    if (bird.y > want && bird.vy > -120 && since > 0.16) {
      flap(bird);
      since = 0;
      taps++;
    }
    step(bird, dt, speed);
    t += dt;
    assert.ok(!hitsWall(bird, c), `crashed into a wall at ${Math.round(bird.x)} of ${Math.round(c.cycle)} (asset ${c.segmentAt(bird.x).segment})`);
    assert.ok(!hitsObstacle(bird, c, lapObstacles[lap], c.cycle), `hit a candle at ${Math.round(bird.x)} (lap ${lap})`);
  }
  // The first lap is flyable by a steady player. Later laps (a narrower tunnel, bigger candles, more speed) are the challenge.
  assert.ok(bird.x >= c.cycle);
  assert.ok(taps / t < 6.5, `${(taps / t).toFixed(1)} taps a second`);
});

test("candles are placed the same way every time, alternate sides, keep clear of steep stretches and always leave room to pass", () => {
  const c = buildEndless(getSurvivalSegments(), SURVIVAL_COURSE);
  const a = survivalObstacles(c, 0);
  const b = survivalObstacles(c, 0);
  assert.deepEqual(a, b, "the same every time");
  assert.ok(a.length > 40, `${a.length} candles in a lap`);
  assert.ok(a.every((o) => o.x >= 2400 && o.x < c.cycle - 400), "none in the first stretch or at the end of the lap");
  let run = 1;
  for (let i = 1; i < a.length; i++) {
    run = a[i].side === a[i - 1].side ? run + 1 : 1;
    assert.ok(run <= 2, "never the same side three times running");
    assert.ok(a[i].x - a[i - 1].x >= 250, "enough room between candles");
    const slope = Math.abs(c.centerAt(a[i].x + 60) - c.centerAt(a[i].x - 60)) / 120;
    assert.ok(slope <= 0.42, `a candle on a steep stretch (${slope.toFixed(2)})`);
  }
  // The free gap beside the biggest candle is still wide enough for Tony (a circle about 14px across when counting forgiveness).
  const worst = survivalObstacles(c, 10);
  for (const o of worst.slice(0, 5)) {
    const free = c.gapAt(o.x + 4 * c.cycle) * (1 - o.frac);
    assert.ok(free >= 46, `only ${free.toFixed(0)}px left past a candle`);
  }
  assert.ok(survivalObstacles(c, 1)[0].frac > survivalObstacles(c, 0)[0].frac, "later laps take more of the gap");
});

test("touching a candle is a hit, and flying through the gap beside it is not", () => {
  const c = buildEndless(getSurvivalSegments(), SURVIVAL_COURSE);
  const o: Obstacle = { x: 3000, side: "top", frac: 0.4 };
  const { bottom } = obstacleSpan(o, c, 3000);
  const inside = { x: 3000, y: bottom - 4, vy: 0 };
  const beside = { x: 3000, y: bottom + 30, vy: 0 };
  assert.equal(hitsObstacle(inside, c, [o]), true);
  assert.equal(hitsObstacle(beside, c, [o]), false);
  assert.equal(hitsObstacle({ x: 3000 - 40, y: bottom - 4, vy: 0 }, c, [o]), false, "not yet there");
});
