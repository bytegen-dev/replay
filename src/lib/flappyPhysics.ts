import type { Course, Obstacle, Track } from "./flappyCourse.ts";

/**
 * How Tony moves. One place for the numbers, so the game and the tests fly with exactly the same physics.
 * Distances are pixels on a 640 x 360 playing area; the world scrolls past at a steady speed while Tony stays at one spot on screen.
 */

export const W = 640;
export const H = 360;
/** The height the tunnel may use: the strip below it is left for the line of text about the chart. */
export const PLAY_H = 322;
/** Where Tony sits on screen, from the left. */
export const BIRD_X = 150;
/** Tony's radius. */
export const R = 11;
export const GRAVITY = 1500;
/** The upward speed a flap gives. */
export const FLAP_V = -360;
export const MAX_FALL = 560;
/** How much of Tony's radius may overlap a wall before it counts as a hit (a little forgiveness). */
export const FORGIVE = 0.45;

export interface Bird {
  /** Distance travelled along the course. */
  x: number;
  y: number;
  vy: number;
}

export function newBird(course: Track): Bird {
  return { x: 0, y: course.centerAt(0), vy: 0 };
}

export function flap(b: Bird): void {
  b.vy = FLAP_V;
}

/** Moves Tony on by `dt` seconds at `speed` pixels a second. */
export function step(b: Bird, dt: number, speed: number): void {
  b.x += speed * dt;
  b.vy = Math.min(MAX_FALL, b.vy + GRAVITY * dt);
  b.y += b.vy * dt;
}

/** True when Tony is touching a wall of the tunnel (or the top or bottom of the screen). */
export function hitsWall(b: Bird, course: Track): boolean {
  const half = course.gapAt(b.x) / 2;
  return Math.abs(b.y - course.centerAt(b.x)) > half - R * FORGIVE || b.y < R || b.y > H - R;
}

/** How far along the course Tony must get to clear it. */
export const finishAt = (course: Course) => course.length - 30;

/** How wide a candle is. */
export const OBSTACLE_W = 24;

/** The vertical span a candle takes, at its place on the course. */
export function obstacleSpan(o: Obstacle, track: Track, worldX: number): { top: number; bottom: number } {
  const c = track.centerAt(worldX);
  const g = track.gapAt(worldX);
  const len = o.frac * g;
  return o.side === "top" ? { top: c - g / 2, bottom: c - g / 2 + len } : { top: c + g / 2 - len, bottom: c + g / 2 };
}

/**
 * True when Tony is touching a candle. `cycle` is the length of a lap for the endless run (the candles are listed once per lap), or
 * Infinity for a level. A candle is a rectangle; Tony counts as a circle a little smaller than he looks.
 */
export function hitsObstacle(b: Bird, track: Track, obstacles: Obstacle[], cycle = Infinity): boolean {
  const lap = Number.isFinite(cycle) ? Math.floor(b.x / cycle) : 0;
  const base = Number.isFinite(cycle) ? lap * cycle : 0;
  const r = R * 0.62;
  for (const o of obstacles) {
    const ox = base + o.x;
    if (Math.abs(b.x - ox) > OBSTACLE_W / 2 + r) continue;
    const { top, bottom } = obstacleSpan(o, track, ox);
    const nx = Math.max(ox - OBSTACLE_W / 2, Math.min(b.x, ox + OBSTACLE_W / 2));
    const ny = Math.max(top, Math.min(b.y, bottom));
    if ((b.x - nx) ** 2 + (b.y - ny) ** 2 < r * r) return true;
  }
  return false;
}
