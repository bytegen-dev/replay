/**
 * The course of a Tony Stonk level: a price series turned into a tunnel that a flapping character can fly through.
 *
 * The tunnel's centre follows the real price, higher price higher on screen. A real chart is far too steep for that to be
 * playable as it is (a crash can fall off a cliff in a single day), so the centre line is limited in how fast it may climb
 * and how fast it may fall, in pixels of height per pixel of distance. Climbing is limited more than falling, because a flap
 * lifts the character slowly while gravity drops it fast. Limiting it keeps the chart's overall shape (every peak and trough is
 * still there, in the same order) while making sure a person can always follow it.
 *
 * Pure maths: no canvas, no clock. The game draws and moves things; this only says where the tunnel is.
 */

export interface CourseOptions {
  /** How long the course is, in pixels of distance along the level. */
  length: number;
  /** The playing area's height, in pixels. */
  height: number;
  /** The gap between the tunnel's walls, in pixels. */
  gap: number;
  /** The most the centre line may climb, in pixels of height per pixel of distance. */
  maxClimb: number;
  /** The most the centre line may fall, in pixels of height per pixel of distance. */
  maxFall: number;
  /** Distance of flat, easy tunnel at the start and the end, so a level opens and closes gently. */
  runway: number;
  /** Space kept clear above and below the tunnel (so the walls always have room on screen). */
  margin: number;
}

/** Anything Tony can fly through: where the tunnel's middle is, and how wide it is, at a distance along it. */
export interface Track {
  centerAt(x: number): number;
  gapAt(x: number): number;
}

export interface Course extends Track {
  /** The distance between the samples in `ys`, in pixels. */
  step: number;
  /** The centre line's height (0 at the top of the screen) at every `step` along the course. */
  ys: number[];
  length: number;
  gap: number;
  /** Where the price was highest and lowest, as a distance along the course (for the level's labels). */
  peakAt: number;
  troughAt: number;
  /** The centre line's height at a distance along the course (clamped to the ends). */
  centerAt(x: number): number;
  /** Index into the original price series for a distance along the course (for showing the real date and price). */
  indexAt(x: number): number;
}

const STEP = 4;

/** Linear interpolation of `v` through evenly spaced samples, at position `t` from 0 to 1. */
function sample(v: number[], t: number): number {
  const f = Math.min(1, Math.max(0, t)) * (v.length - 1);
  const i = Math.floor(f);
  const j = Math.min(v.length - 1, i + 1);
  return v[i] + (v[j] - v[i]) * (f - i);
}

export function buildCourse(prices: number[], o: CourseOptions): Course {
  if (prices.length < 2) throw new Error("A course needs at least two prices.");
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const span = hi - lo || 1;
  const top = o.margin + o.gap / 2;
  const bottom = o.height - o.margin - o.gap / 2;
  // Price to height: the highest price at the top of the playing band, the lowest at the bottom.
  const toY = (p: number) => bottom - ((p - lo) / span) * (bottom - top);

  const n = Math.max(2, Math.round(o.length / STEP) + 1);
  const runwaySteps = Math.round(o.runway / STEP);
  const chartSteps = Math.max(1, n - 1 - 2 * runwaySteps);
  const start = toY(prices[0]);
  const end = toY(prices[prices.length - 1]);

  // The raw centre line: a level runway, the chart, a level runway.
  const ys: number[] = [];
  for (let i = 0; i < n; i++) {
    if (i <= runwaySteps) ys.push(start);
    else if (i >= n - 1 - runwaySteps) ys.push(end);
    else ys.push(toY(sample(prices, (i - runwaySteps) / chartSteps)));
  }

  // Limit the slopes, forward then backward, so a steep move is spread over the distance before it as well as after it.
  const up = o.maxClimb * STEP;
  const down = o.maxFall * STEP;
  for (let i = 1; i < n; i++) ys[i] = Math.min(ys[i - 1] + down, Math.max(ys[i - 1] - up, ys[i]));
  for (let i = n - 2; i >= 0; i--) ys[i] = Math.min(ys[i + 1] + up, Math.max(ys[i + 1] - down, ys[i]));
  // Smooth the corners a little (a short moving average), then keep it inside the band.
  const smooth = ys.map((_, i) => {
    let s = 0;
    let c = 0;
    for (let k = -3; k <= 3; k++) {
      const j = i + k;
      if (j >= 0 && j < n) {
        s += ys[j];
        c++;
      }
    }
    return Math.min(bottom, Math.max(top, s / c));
  });

  let peak = 0;
  let trough = 0;
  smooth.forEach((y, i) => {
    if (y < smooth[peak]) peak = i;
    if (y > smooth[trough]) trough = i;
  });

  const chartStart = runwaySteps * STEP;
  const chartLength = chartSteps * STEP;
  return {
    step: STEP,
    ys: smooth,
    length: (n - 1) * STEP,
    gap: o.gap,
    gapAt: () => o.gap,
    peakAt: peak * STEP,
    troughAt: trough * STEP,
    centerAt(x) {
      const f = Math.min(smooth.length - 1, Math.max(0, x / STEP));
      const i = Math.floor(f);
      const j = Math.min(smooth.length - 1, i + 1);
      return smooth[i] + (smooth[j] - smooth[i]) * (f - i);
    },
    indexAt(x) {
      const t = Math.min(1, Math.max(0, (x - chartStart) / chartLength));
      return Math.round(t * (prices.length - 1));
    },
  };
}

/** Coins along the course: a distance and a height, spaced out and swung a little either side of the centre so they ask for steering. */
export function placeCoins(c: Course, spacing = 120, firstAt = 420): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let x = firstAt, i = 0; x < c.length - 240; x += spacing, i++) {
    out.push({ x, y: c.centerAt(x) + Math.sin(i * 2.1 + 0.7) * c.gap * 0.28 });
  }
  return out;
}

/* ------------------------------------------------------------------------------------------------------------------------------ */
/* The Survival run: several assets one after another, forever. */

export interface EndlessSegment {
  prices: number[];
  times: number[];
  /** What it is called in the game ("Bitcoin (BTC)"). */
  label: string;
  /** The address of its round logo. */
  logo?: string;
}

export interface EndlessOptions {
  /** How long each asset's stretch is, in pixels. */
  segmentLength: number;
  height: number;
  /** The gap at the start of the first lap. It narrows as the run goes on. */
  gap: number;
  maxClimb: number;
  maxFall: number;
  margin: number;
  /** The flat stretch either side of each seam, where one asset hands over to the next. */
  seamRunway: number;
}

export interface Endless extends Track {
  /** The length of one lap through every asset. After it the run goes round again, harder. */
  cycle: number;
  /** The centre of each hand-over between assets, as a distance within a lap (the last is the join back to the start). */
  seams: number[];
  segments: EndlessSegment[];
  /** Which lap a distance is in (from 0). */
  passAt(x: number): number;
  /** The asset Tony is flying over at a distance, and the index of the real price under him. */
  segmentAt(x: number): { segment: number; index: number };
}

const SEAM_BLEND = 320;
const SMOOTH = 20;

/** The gap at a distance: it starts wide and narrows through the first lap, and a little more with every lap after. */
export function endlessGap(base: number, x: number, cycle: number): number {
  const pass = Math.floor(x / cycle);
  const local = (x % cycle) / cycle;
  return Math.max(98, base - 10 * Math.min(4, pass) - 8 * local);
}

export function buildEndless(segments: EndlessSegment[], o: EndlessOptions): Endless {
  if (segments.length === 0) throw new Error("A run needs at least one asset.");
  const top = o.margin + o.gap / 2;
  const bottom = o.height - o.margin - o.gap / 2;
  const perSeg = Math.round(o.segmentLength / STEP);
  const ys: number[] = [];
  const bounds: { from: number; to: number; chartFrom: number; chartTo: number }[] = [];
  const seams: number[] = [];
  segments.forEach((seg, k) => {
    // Heights follow the log of the price, as on a log chart: otherwise an asset that grew a hundredfold is a flat line for years and
    // then a wall (Bitcoin from 2018 is the example), where in percentage terms it was moving all along.
    const logs = seg.prices.map((p) => Math.log(Math.max(p, 1e-9)));
    const lo = Math.min(...logs);
    const span = Math.max(...logs) - lo || 1;
    const toY = (p: number) => bottom - ((Math.log(Math.max(p, 1e-9)) - lo) / span) * (bottom - top);
    const run = Math.round(o.seamRunway / STEP);
    const first = toY(seg.prices[0]);
    const last = toY(seg.prices[seg.prices.length - 1]);
    const chartSteps = Math.max(1, perSeg - 2 * run);
    const from = ys.length;
    for (let i = 0; i < perSeg; i++) {
      if (i <= run) ys.push(first);
      else if (i >= perSeg - 1 - run) ys.push(last);
      else ys.push(toY(sample(seg.prices, (i - run) / chartSteps)));
    }
    bounds.push({ from: from * STEP, to: ys.length * STEP, chartFrom: (from + run) * STEP, chartTo: (from + perSeg - 1 - run) * STEP });
    if (k > 0) seams.push(from * STEP);
  });
  // The close of the lap: a long blend back to where the first asset starts, so the run can go round again without a jump.
  const closeSteps = Math.round(SEAM_BLEND / STEP);
  const endY = ys[ys.length - 1];
  const startY = ys[0];
  seams.push(ys.length * STEP);
  for (let i = 1; i <= closeSteps; i++) ys.push(endY + (startY - endY) * (i / closeSteps));
  const n = ys.length;
  const up = o.maxClimb * STEP;
  const down = o.maxFall * STEP;
  for (let i = 1; i < n; i++) ys[i] = Math.min(ys[i - 1] + down, Math.max(ys[i - 1] - up, ys[i]));
  for (let i = n - 2; i >= 0; i--) ys[i] = Math.min(ys[i + 1] + up, Math.max(ys[i + 1] - down, ys[i]));
  const smooth = ys.map((_, i) => {
    let s = 0;
    let c = 0;
    // A wide window (about 80px each side), so a steep drop eases in instead of starting all at once.
    for (let k = -SMOOTH; k <= SMOOTH; k++) {
      const j = i + k;
      if (j >= 0 && j < n) {
        s += ys[j];
        c++;
      }
    }
    return Math.min(bottom, Math.max(top, s / c));
  });
  // Pin the last stretch to the first value, so lap after lap joins up exactly.
  for (let i = n - closeSteps; i < n; i++) smooth[i] = smooth[i - 1] + (smooth[0] - smooth[i - 1]) * (1 / Math.max(1, n - i));
  smooth[n - 1] = smooth[0];
  const cycle = (n - 1) * STEP;
  const at = (x: number) => {
    const local = ((x % cycle) + cycle) % cycle;
    const f = local / STEP;
    const i = Math.floor(f);
    const j = Math.min(n - 1, i + 1);
    return smooth[i] + (smooth[j] - smooth[i]) * (f - i);
  };
  return {
    cycle,
    seams,
    segments,
    centerAt: at,
    gapAt: (x) => endlessGap(o.gap, Math.max(0, x), cycle),
    passAt: (x) => Math.floor(Math.max(0, x) / cycle),
    segmentAt(x) {
      const local = ((x % cycle) + cycle) % cycle;
      const k = Math.max(0, bounds.findIndex((b) => local >= b.from && local < b.to));
      const found = bounds.findIndex((b) => local >= b.from && local < b.to);
      const b = bounds[found === -1 ? bounds.length - 1 : k];
      const t = Math.min(1, Math.max(0, (local - b.chartFrom) / Math.max(1, b.chartTo - b.chartFrom)));
      const seg = segments[found === -1 ? bounds.length - 1 : k];
      return { segment: found === -1 ? bounds.length - 1 : k, index: Math.round(t * (seg.prices.length - 1)) };
    },
  };
}

/* ------------------------------------------------------------------------------------------------------------------------------ */
/* Obstacles: red candles. */

/**
 * A red candle growing out of the tunnel's top or bottom wall into the gap, leaving only part of it free. `frac` is how much of the gap it
 * takes (0.4 is two fifths), so it stays in proportion as the tunnel narrows.
 */
export interface Obstacle {
  /** Distance along the course (within a lap, for the endless run). */
  x: number;
  side: "top" | "bottom";
  frac: number;
}

export interface ObstaclePlan {
  from: number;
  to: number;
  /** About how far apart they are, in pixels. */
  spacing: number;
  /** How much of the gap each takes (0 to 1). */
  frac: number;
  /** Where the tunnel is steeper than this (height per distance) no candle is put, so one never lands on a hard climb or drop. */
  maxSlope?: number;
  seed?: number;
}

/**
 * Places candles along a track, the same way every time. They alternate sides (never the same side three times running), are spread with a
 * little jitter, and skip steep stretches of the tunnel, so there is always time to get from one gap to the next.
 */
export function placeObstacles(track: Track, p: ObstaclePlan): Obstacle[] {
  const out: Obstacle[] = [];
  let seed = (p.seed ?? 7) * 2654435761;
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const maxSlope = p.maxSlope ?? 0.3;
  let sideRun = 0;
  let last: "top" | "bottom" = rnd() < 0.5 ? "top" : "bottom";
  for (let x = p.from; x < p.to; x += p.spacing * (0.8 + rnd() * 0.4)) {
    let at = x;
    // Slide forward off a steep stretch.
    for (let tries = 0; tries < 20; tries++) {
      // Steep anywhere from just before the candle to a good way after it (where Tony is heading next) counts as steep.
      let steepest = 0;
      for (let d = -60; d <= 260; d += 40) steepest = Math.max(steepest, Math.abs(track.centerAt(at + d + 40) - track.centerAt(at + d - 40)) / 80);
      if (steepest <= maxSlope) break;
      at += 24;
    }
    if (at >= p.to) break;
    let side: "top" | "bottom" = rnd() < 0.62 ? (last === "top" ? "bottom" : "top") : last;
    if (side === last && sideRun >= 1) side = last === "top" ? "bottom" : "top";
    sideRun = side === last ? sideRun + 1 : 0;
    last = side;
    out.push({ x: Math.round(at), side, frac: p.frac });
    x = Math.max(x, at);
  }
  return out;
}
