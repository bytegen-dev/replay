import { drawHatch } from "./canvasHatch.ts";
import { moneyShort, niceScale, timeTicks, type GrowthPoint } from "./charts.ts";

/**
 * Records the replay chart as a video, in the browser, with nothing but the canvas and MediaRecorder that browsers already have.
 * The chart is drawn again frame by frame onto a canvas (not captured from the page), so the video is the same size and
 * quality whatever the screen: 1280 x 720, the line growing month by month, then a short hold on the final result.
 */

export type ReplayView = "growth" | "price";

export interface ReplayVideoOptions {
  points: GrowthPoint[];
  view: ReplayView;
  /** The big line at the top left, e.g. "Bitcoin, $500 a month". */
  title: string;
  /** The tag at the top right saying what kind of trade it is, e.g. "5x long, leveraged" or "Spot, monthly buys". */
  subtitle?: string;
  /** The currency symbol for money (default "$"). */
  symbol?: string;
  /** Called with 0 to 1 as the recording goes. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  /** Draw the finished result as a still picture (the profit in money as well as in percent, and no progress bar) instead of a frame of the video. */
  still?: boolean;
}

const W = 1280;
const H = 720;
const FPS = 30;
const HOLD_S = 1.8;

/** The best video format this browser can record, or null when it can't record canvas video at all. */
export function pickVideoFormat(): { mime: string; ext: string } | null {
  if (typeof MediaRecorder === "undefined" || typeof HTMLCanvasElement === "undefined" || !("captureStream" in HTMLCanvasElement.prototype)) return null;
  const candidates = [
    { mime: "video/mp4;codecs=avc1", ext: "mp4" },
    { mime: "video/webm;codecs=vp9", ext: "webm" },
    { mime: "video/webm;codecs=vp8", ext: "webm" },
    { mime: "video/webm", ext: "webm" },
  ];
  return candidates.find((c) => MediaRecorder.isTypeSupported(c.mime)) ?? null;
}

/** Seconds the line takes to grow: about a month every 0.15s, but never under 6 or over 16. */
export function replaySeconds(pointCount: number): number {
  return Math.min(16, Math.max(6, pointCount * 0.15));
}

const css = (name: string, fallback: string) => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
};

const money = (n: number, symbol: string) => `${n < 0 ? "-" : ""}${symbol}${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: Math.abs(n) >= 100 ? 0 : 2 })}`;

/** Whole points up to `progress`, plus a tip that slides from the last whole point toward the next. */
function pointsAt(points: GrowthPoint[], progress: number): GrowthPoint[] {
  const total = points.length;
  if (progress >= total) return points;
  const whole = Math.max(2, Math.floor(progress));
  const done = points.slice(0, whole);
  const frac = progress - whole;
  if (frac < 0.001 || whole >= total) return done;
  const a = points[whole - 1];
  const b = points[whole];
  const mix = (x: number, y: number) => x + (y - x) * frac;
  return [...done, { ...b, t: mix(a.t, b.t), value: mix(a.value, b.value), invested: mix(a.invested, b.invested), price: mix(a.price, b.price), avgCost: mix(a.avgCost, b.avgCost) }];
}

export interface Palette {
  bg: string;
  card: string;
  fg: string;
  muted: string;
  primary: string;
  down: string;
  border: string;
  /** The colour of the page's slanted lines. */
  hatch: string;
  body: string;
  head: string;
  /** The Replay mark (white outline on a dark video, dark outline on a light one), or null if it could not be loaded. */
  mark: HTMLImageElement | null;
}

function drawFrame(ctx: CanvasRenderingContext2D, o: ReplayVideoOptions, c: Palette, progress: number) {
  const { points, view } = o;
  const sym = o.symbol ?? "$";
  const usd = (n: number) => money(n, sym);
  const short = (n: number) => moneyShort(n).replace("$", sym);
  const total = points.length;
  const shown = pointsAt(points, progress);
  const tip = shown[shown.length - 1];
  const wholeIdx = Math.min(total - 1, Math.max(1, Math.floor(progress) - 1));
  const reading = progress >= total ? points[total - 1] : points[wholeIdx];

  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, W, H);
  // The site's slanted lines in the top right corner.
  drawHatch(ctx, W, c.hatch, o.still ? 2 : 1);

  // Header: the title, then the numbers for the month reached.
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = c.fg;
  ctx.font = `600 38px ${c.head}`;
  ctx.fillText(o.title, 64, 78);
  if (o.subtitle) {
    // The kind of trade, as a tag at the top right: outlined in the brand colour so it is the first thing after the title.
    ctx.font = `600 22px ${c.body}`;
    const tw = ctx.measureText(o.subtitle).width;
    const pad = 16;
    const boxW = tw + pad * 2;
    const boxX = W - 64 - boxW;
    ctx.strokeStyle = c.primary;
    ctx.lineWidth = 2;
    ctx.strokeRect(boxX, 46, boxW, 42);
    ctx.fillStyle = c.primary;
    ctx.fillText(o.subtitle, boxX + pad, 74);
    ctx.fillStyle = c.fg;
    ctx.font = `600 38px ${c.head}`;
  }
  ctx.fillStyle = c.muted;
  ctx.font = `400 22px ${c.body}`;
  const gain = reading.invested > 0 ? ((reading.value - reading.invested) / reading.invested) * 100 : 0;
  const up = reading.value >= reading.invested;
  ctx.fillText(reading.date, 64, 116);
  const head2 = view === "growth" ? `Put in ${usd(reading.invested)}   Worth ${usd(reading.value)}` : `Price ${usd(reading.price)}   Your average cost ${usd(reading.avgCost)}`;
  ctx.fillStyle = c.fg;
  ctx.fillText(head2, 64, 152);
  if (view === "growth") {
    const w = ctx.measureText(head2).width;
    ctx.fillStyle = up ? c.primary : c.down;
    const pct = `${up ? "+" : ""}${gain.toFixed(1)}%`;
    ctx.fillText(o.still ? `   ${up ? "+" : ""}${usd(reading.value - reading.invested)} (${pct})` : `   ${pct}`, 64 + w, 152);
  }

  // (The logo is in the footer; the top right has the slanted lines.)

  // The chart box.
  const L = 64;
  const R = W - 150;
  const T = 196;
  const B = H - 96;
  const xs = points.map((p) => p.t);
  const xMin = xs[0];
  const xMax = xs[xs.length - 1];
  const a = (p: GrowthPoint) => (view === "growth" ? p.value : p.price);
  const b = (p: GrowthPoint) => (view === "growth" ? p.invested : p.avgCost);
  const all = points.flatMap((p) => [a(p), b(p)]);
  const scale = niceScale(Math.min(...all), Math.max(...all), view === "growth");
  const sx = (t: number) => L + ((t - xMin) / (xMax - xMin || 1)) * (R - L);
  const sy = (v: number) => T + (1 - (v - scale.lo) / (scale.hi - scale.lo || 1)) * (B - T);

  ctx.lineWidth = 1;
  ctx.font = `400 18px ${c.body}`;
  ctx.textAlign = "left";
  for (const tv of scale.ticks) {
    const y = sy(tv);
    ctx.strokeStyle = c.border;
    ctx.beginPath();
    ctx.moveTo(L, y);
    ctx.lineTo(R, y);
    ctx.stroke();
    ctx.fillStyle = c.muted;
    ctx.fillText(short(tv), R + 14, y + 6);
  }
  for (const tk of timeTicks(xMin, xMax, 7)) {
    const x = sx(tk.t);
    ctx.fillStyle = c.muted;
    ctx.textAlign = "center";
    ctx.fillText(tk.label, x, B + 32);
  }
  ctx.textAlign = "left";

  const color = up ? c.primary : c.down;
  // Area, then the two lines, up to the sliding tip.
  const mainPts = shown.map((p) => [sx(p.t), sy(a(p))] as const);
  const refPts = shown.map((p) => [sx(p.t), sy(b(p))] as const);
  if (view === "growth") {
    const g = ctx.createLinearGradient(0, T, 0, B);
    g.addColorStop(0, withAlpha(color, 0.32));
    g.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(mainPts[0][0], sy(scale.lo));
    for (const [x, y] of mainPts) ctx.lineTo(x, y);
    ctx.lineTo(mainPts[mainPts.length - 1][0], sy(scale.lo));
    ctx.closePath();
    ctx.fill();
  }
  ctx.setLineDash([8, 7]);
  ctx.strokeStyle = c.muted;
  ctx.lineWidth = 2;
  ctx.beginPath();
  refPts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3.5;
  ctx.lineJoin = "round";
  ctx.beginPath();
  mainPts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();

  // The tip: a dot with a halo, and its value on the axis.
  const [tx, ty] = mainPts[mainPts.length - 1];
  ctx.fillStyle = withAlpha(color, 0.25);
  ctx.beginPath();
  ctx.arc(tx, ty, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(tx, ty, 6.5, 0, Math.PI * 2);
  ctx.fill();
  const tag = short(a(tip));
  ctx.font = `700 18px ${c.body}`;
  const tw = ctx.measureText(tag).width + 16;
  ctx.fillStyle = color;
  ctx.fillRect(R + 8, ty - 15, tw, 30);
  ctx.fillStyle = c.bg;
  ctx.fillText(tag, R + 16, ty + 6);

  // Footer: the mark and name, and a progress bar.
  ctx.fillStyle = c.card;
  ctx.fillRect(0, H - 44, W, 44);
  if (c.mark) {
    ctx.drawImage(c.mark, 64, H - 38, 30, 30);
  } else {
    ctx.fillStyle = c.primary;
    ctx.beginPath();
    ctx.moveTo(64, H - 33);
    ctx.lineTo(64, H - 11);
    ctx.lineTo(82, H - 22);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = c.fg;
  ctx.font = `600 20px ${c.head}`;
  ctx.fillText("Replay", 104, H - 15);
  if (!o.still) {
    const frac = Math.min(1, (progress - 2) / Math.max(1, total - 2));
    ctx.fillStyle = c.border;
    ctx.fillRect(W - 364, H - 25, 300, 4);
    ctx.fillStyle = c.primary;
    ctx.fillRect(W - 364, H - 25, 300 * frac, 4);
  }
}

/** "#39d6a3" or "rgb(...)" with an alpha. Falls back to the colour itself for anything it can't read. */
function withAlpha(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  const rgb = /^rgba?\(([^)]+)\)$/.exec(color);
  if (rgb) return `rgba(${rgb[1].split(",").slice(0, 3).join(",")}, ${alpha})`;
  return color;
}

/** True when a CSS colour such as "#f2f7f7" is light, so the dark-outlined mark is used on it. */
function isLight(color: string): boolean {
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 140;
}

/** Loads the logo mark as an image to draw on the canvas. Null if it can't be loaded, so the video still records without it. */
function loadMark(light: boolean): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = light ? "/replay-mark-dark.svg" : "/replay-mark.svg";
  });
}

/** The site's colours, fonts and logo as a canvas draws them, read from the page's current theme. Used by every picture the site makes. */
export async function canvasTheme() {
  const [mark] = await Promise.all([loadMark(isLight(css("--background", "#03090b"))), document.fonts?.ready]);
  return makePalette(mark);
}

/** The site's colours and fonts as the canvas draws them, read from the page's current theme. */
function makePalette(mark: HTMLImageElement | null): Palette {
  return {
    bg: css("--background", "#03090b"),
    card: css("--card", "#071215"),
    fg: css("--foreground", "#f3f8f8"),
    muted: css("--muted-foreground", "#8ea4ad"),
    primary: css("--primary", "#39d6a3"),
    down: css("--destructive", "#fb7185"),
    border: css("--border", "#25414a"),
    hatch: css("--hatch", "rgba(105, 170, 193, 0.16)"),
    body: `"JetBrains Mono", ui-monospace, monospace`,
    head: `"Chakra Petch", ui-sans-serif, sans-serif`,
    mark,
  };
}

/**
 * The finished result as a picture (PNG): the title and what kind of trade it was, what went in, what it is worth and the profit in money and percent,
 * the whole chart, and the Replay mark. It is the last frame of the video, drawn at twice the size so it stays sharp when shared.
 */
export async function renderReplayStill(o: ReplayVideoOptions): Promise<Blob> {
  if (o.points.length < 2) throw new Error("There aren't enough months to make a picture.");
  const [mark] = await Promise.all([loadMark(isLight(css("--background", "#03090b"))), document.fonts?.ready]);
  const canvas = document.createElement("canvas");
  canvas.width = W * 2;
  canvas.height = H * 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't make the picture.");
  ctx.scale(2, 2);
  drawFrame(ctx, { ...o, view: "growth", still: true }, makePalette(mark), o.points.length);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't make the picture."))), "image/png"));
}

/** Plays the replay onto a canvas and records it. Resolves with the video file; rejects if cancelled. */
export function recordReplay(o: ReplayVideoOptions): Promise<{ blob: Blob; ext: string }> {
  return loadMark(isLight(css("--background", "#03090b"))).then((mark) => record(o, mark));
}

function record(o: ReplayVideoOptions, mark: HTMLImageElement | null): Promise<{ blob: Blob; ext: string }> {
  const format = pickVideoFormat();
  if (!format) return Promise.reject(new Error("This browser can't record video. Try Chrome, Edge or Firefox."));
  if (o.points.length < 3) return Promise.reject(new Error("There aren't enough months to make a video."));

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Couldn't start the recording."));

  const palette = makePalette(mark);

  const total = o.points.length;
  const runS = replaySeconds(total);
  const stream = canvas.captureStream(FPS);
  const recorder = new MediaRecorder(stream, { mimeType: format.mime, videoBitsPerSecond: 6_000_000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);

  return new Promise((resolve, reject) => {
    let raf = 0;
    const stop = (err?: Error) => {
      cancelAnimationFrame(raf);
      if (recorder.state !== "inactive") recorder.stop();
      if (err) reject(err);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (o.signal?.aborted) return reject(new Error("Cancelled"));
      resolve({ blob: new Blob(chunks, { type: format.mime.split(";")[0] }), ext: format.ext });
    };
    recorder.onerror = () => stop(new Error("The recording failed."));
    o.signal?.addEventListener("abort", () => stop(new Error("Cancelled")));

    recorder.start(250);
    const t0 = performance.now();
    const tick = (now: number) => {
      const s = (now - t0) / 1000;
      const progress = s >= runS ? total : 2 + (s / runS) * (total - 2);
      drawFrame(ctx, o, palette, progress);
      o.onProgress?.(Math.min(1, s / (runS + HOLD_S)));
      if (s >= runS + HOLD_S) return stop();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  });
}
