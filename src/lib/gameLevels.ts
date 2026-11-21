import data from "../data/gameLevels.json" with { type: "json" };
import { placeObstacles, type CourseOptions, type Endless, type EndlessOptions, type EndlessSegment, type Obstacle, type ObstaclePlan } from "./flappyCourse.ts";

/**
 * The Tony Stonk game's content.
 *
 * Tony Stonk is a trader whose one rule is to protect his liquidity. Three tutorial levels teach the controls on short, fixed stretches
 * of real price history, each with a coach that speaks up as Tony flies. When they are done (or skipped) he lands on the main menu, and
 * from there he can go live: Survival, one endless run through the market since 2018 that starts with Bitcoin and
 * hands over from asset to asset, getting faster and narrower, with every trader's best on a shared board.
 *
 * The prices are saved by scripts/update-game-levels.mjs, so the game ships its courses as plain data.
 */

export interface Hint {
  /** How far through the level (0 to 1) the coach speaks. */
  at: number;
  text: string;
}

export interface Level {
  id: string;
  title: string;
  /** What is being flown through: "S&P 500 (SPY)". */
  asset: string;
  /** The stretch of time, e.g. "Feb 14 to Apr 30, 2020". */
  period: string;
  /** Said before the level starts. */
  intro: string;
  /** Said when it is cleared. */
  outro: string;
  /** What the coach says while Tony flies. */
  hints: Hint[];
  /** The real prices, oldest first, with their dates (ms since 1970). */
  times: number[];
  prices: number[];
  /** How long the level takes to fly, in seconds. */
  seconds: number;
  course: Omit<CourseOptions, "length" | "height" | "runway" | "margin">;
  /** Red candles to dodge, or none. */
  obstacles: Pick<ObstaclePlan, "spacing" | "frac"> | null;
}

/** How fast a tutorial course scrolls past, in pixels a second. A level's length is this times its seconds. */
export const SCROLL_SPEED = 150;

interface Saved {
  tutorial: Record<string, { symbol: string; from: string; to: string; points: [number, number][] }>;
  survival: Record<string, { symbol: string; from: string; to: string; points: [number, number][] }>;
}
const saved = data as unknown as Saved;

const fmt = (iso: string, withYear: boolean) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });
/** "Feb 14 to Apr 30, 2020", or "2017" for a whole year. */
function period(from: string, to: string): string {
  const [fy, fm, fd] = from.split("-");
  const [ty, tm, td] = to.split("-");
  if (fy === ty && fm === "01" && Number(fd) <= 4 && tm === "12" && Number(td) >= 28) return fy;
  return fy === ty ? `${fmt(from, false)} to ${fmt(to, true)}` : `${fmt(from, true)} to ${fmt(to, true)}`;
}

const DEFS: { id: string; title: string; asset: string; seconds: number; gap: number; maxClimb: number; maxFall: number; intro: string; outro: string; hints: Hint[]; obstacles?: Pick<ObstaclePlan, "spacing" | "frac"> }[] = [
  {
    id: "first-steps",
    title: "First Steps",
    asset: "S&P 500 (SPY)",
    seconds: 30,
    gap: 150,
    maxClimb: 0.5,
    maxFall: 1.0,
    intro: "A gentle year to learn the controls.",
    outro: "Controls learned. Now learn to fall.",
    hints: [
      { at: 0.02, text: "Tap, click or press space to flap. Gravity does the rest." },
      { at: 0.2, text: "Stay between the glowing walls. The dotted line down the middle is the real price." },
      { at: 0.46, text: "Gold coins are bonus points. Fly through them when it is easy." },
      { at: 0.85, text: "Reach the glowing gate to finish the run." },
    ],
  },
  {
    id: "the-drop",
    title: "The Drop",
    asset: "S&P 500 (SPY)",
    seconds: 26,
    gap: 152,
    maxClimb: 0.6,
    maxFall: 1.4,
    intro: "Markets fall faster than they rise. Let go, then catch yourself.",
    outro: "Still solvent. One more lesson.",
    hints: [
      { at: 0.04, text: "The line is falling. Let Tony drop with it, then tap to catch him." },
      { at: 0.4, text: "Tap early. A flap needs a moment to lift you." },
      { at: 0.62, text: "After a drop comes a climb. Climbing takes steady taps: about two a second." },
      { at: 0.86, text: "Do not flap into the ceiling. Falling costs nothing." },
    ],
  },
  {
    id: "rocket-fuel",
    title: "Red Candles",
    asset: "GameStop (GME)",
    seconds: 30,
    gap: 156,
    maxClimb: 0.6,
    maxFall: 1.3,
    intro: "The market throws things back. Red candles grow out of the walls. Learn to fly around them.",
    outro: "Tutorial complete. Time to play for real.",
    obstacles: { spacing: 430, frac: 0.3 },
    hints: [
      { at: 0.04, text: "Red candles grow out of the walls and block part of the tunnel." },
      { at: 0.2, text: "Steer through the gap a candle leaves. Touch one and Tony is liquidated." },
      { at: 0.5, text: "They switch sides. Look ahead for the next one, not down at your feet." },
      { at: 0.82, text: "The real game has no gate at the end, and a lot more candles." },
    ],
  },
];

/** The tutorial levels, in order (the ones that have saved data). */
export function getLevels(): Level[] {
  const out: Level[] = [];
  for (const d of DEFS) {
    const s = saved.tutorial[d.id];
    if (!s || s.points.length < 2) continue;
    out.push({
      id: d.id,
      title: d.title,
      asset: d.asset,
      period: period(s.from, s.to),
      intro: d.intro,
      outro: d.outro,
      hints: d.hints,
      times: s.points.map((p) => p[0]),
      prices: s.points.map((p) => p[1]),
      seconds: d.seconds,
      course: { gap: d.gap, maxClimb: d.maxClimb, maxFall: d.maxFall },
      obstacles: d.obstacles ?? null,
    });
  }
  return out;
}

/* ------------------------------------------------------------------------------------------------------------------------ */
/* Survival */

const SURVIVAL_ORDER: { id: string; label: string }[] = [
  { id: "btc", label: "Bitcoin (BTC)" },
  { id: "eth", label: "Ethereum (ETH)" },
  { id: "spy", label: "S&P 500 (SPY)" },
  { id: "nvda", label: "NVIDIA (NVDA)" },
  { id: "tsla", label: "Tesla (TSLA)" },
];

/** The assets of the Survival run, in order, from 2018 up to the latest saved day. */
export function getSurvivalSegments(): EndlessSegment[] {
  const out: EndlessSegment[] = [];
  for (const d of SURVIVAL_ORDER) {
    const s = saved.survival[d.id];
    if (!s || s.points.length < 2) continue;
    out.push({ label: d.label, times: s.points.map((p) => p[0]), prices: s.points.map((p) => p[1]) });
  }
  return out;
}

/** How the Survival course is shaped: each asset gets this much distance, the gap starts wide, the slopes are the same gentle limits. */
export const SURVIVAL_COURSE: Omit<EndlessOptions, never> = { segmentLength: 7500, height: 322, gap: 150, maxClimb: 0.55, maxFall: 1.05, margin: 18, seamRunway: 240 };

/**
 * Candles in the Survival run: none for the first stretch (Tony gets his bearings), then one about every 470px, taking a little more of the
 * gap each lap. The candles are listed once per lap; `frac` here is the first lap's, and the game adds a little per lap.
 */
export const SURVIVAL_OBSTACLES = { from: 2400, spacing: 470, frac: 0.24, perLap: 0.03, maxFrac: 0.42 };

/** The candles of one lap of the Survival run: the same places every lap, each taking a little more of the gap than the lap before. */
export function survivalObstacles(track: Endless, lap: number): Obstacle[] {
  const o = SURVIVAL_OBSTACLES;
  return placeObstacles(track, { from: o.from, to: track.cycle - 500, spacing: o.spacing, frac: Math.min(o.maxFrac, o.frac + o.perLap * lap), seed: 11 });
}

/** How fast the Survival run scrolls at a distance: it starts at the tutorial speed and gets faster, up to 1.25 times that. */
export function survivalSpeed(distance: number): number {
  return SCROLL_SPEED * (1 + Math.min(0.25, distance / 120000));
}

/** The score for a distance: one point per ten pixels, and five for a coin. */
export const scoreFor = (distance: number, coins = 0) => Math.floor(distance / 10) + coins * 5;

/** The story around the game. */
export const STORY = {
  title: "Tony Stonk",
  tagline: "Protect the liquidity.",
};

/** A price for the game's heads-up display: whole dollars when large, cents when small. */
export function gamePrice(p: number): string {
  return p >= 1000 ? `$${Math.round(p).toLocaleString("en-US")}` : `$${p.toFixed(p >= 100 ? 0 : 2)}`;
}
