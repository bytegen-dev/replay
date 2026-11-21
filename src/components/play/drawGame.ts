import type { Obstacle, Track } from "@/lib/flappyCourse.ts";
import { BIRD_X, H, OBSTACLE_W, obstacleSpan, R, type Bird } from "@/lib/flappyPhysics.ts";

/** Everything the canvas drawing needs for one frame. Plain data, so the game loop and the drawing stay separate. */
export interface Frame {
  track: Track;
  bird: Bird;
  /** The coins of one lap (or of the whole tutorial level), as distances and heights. */
  coins: { x: number; y: number }[];
  /** Which coins are taken: for the endless run a key of lap and index. */
  taken: (lap: number, i: number) => boolean;
  /** The length of a lap, or Infinity for a level that does not repeat. */
  cycle: number;
  /** The red candles of a lap (a level has just the one list). */
  obstacles: (lap: number) => Obstacle[];
  /** The finish gate, for a tutorial level. */
  gate?: { x: number; label: string };
  /** Progress through a tutorial level, 0 to 1 (a bar across the top). */
  progress?: number;
  time: number;
  phase: "ready" | "running" | "crashed";
  bits: { x: number; y: number; age: number }[];
  hud: { left: string; right: string; center: string };
  /** The leverage the run is flying at (1 to 10): the faster it is, the more streaks fly past. */
  speed: number;
  /** The width of the playing area in game pixels (the height is always H), which follows the shape of the screen. */
  w: number;
  /** Where the run is in time: the span the asset or level covers and the date under Tony now, all in milliseconds. */
  timeline?: { from: number; to: number; at: number };
  /** The handover between assets: 0 (none) to 1, and what it is announcing. */
  sync?: { amount: number; label: string };
  fonts: { head: string; body: string };
  /** Feedback: a shake (0 to 1), a red flash, time since the last flap, a dust trail, sparks and floating numbers. */
  fx: {
    shake: number;
    flash: number;
    flapAge: number;
    trail: { x: number; y: number; age: number }[];
    sparks: { x: number; y: number; age: number; color: string }[];
    pops: { x: number; y: number; age: number; text: string }[];
  };
}

const MINT = "#39d6a3";

const stars = Array.from({ length: 90 }, (_, i) => {
  // A fixed scatter (no randomness at render), so the sky is the same every time.
  const a = Math.sin(i * 91.7) * 43758.5453;
  const b = Math.sin(i * 12.9898) * 12543.123;
  return { x: a - Math.floor(a), y: (b - Math.floor(b)) * H, r: 0.5 + ((i * 37) % 10) / 9, depth: 0.05 + ((i * 53) % 10) / 40, tw: i * 1.7 };
});

/** A small repeatable random source, so the backdrop is the same every time and never needs a random number at render. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Faint candlesticks drifting behind everything: a price chart that never ends. */
const CANDLE_LEN = 960;
const candles = (() => {
  const rnd = seeded(23);
  const out: { x: number; o: number; c: number; hi: number; lo: number }[] = [];
  let y = 190;
  for (let x = 6; x < CANDLE_LEN; x += 16) {
    const o = y;
    y = Math.min(250, Math.max(90, y + (rnd() - 0.5) * 60));
    out.push({ x, o, c: y, hi: Math.min(o, y) - rnd() * 14, lo: Math.max(o, y) + rnd() * 14 });
  }
  return out;
})();

/** The scenery: a chart grid and a ghost chart, each scrolling at its own pace, and (at high leverage) streaks of speed. */
function drawBackdrop(ctx: CanvasRenderingContext2D, f: Frame, W: number) {
  const x = f.bird.x;
  // Chart gridlines: horizontal price lines stay put, vertical time lines slide by.
  ctx.fillStyle = "rgba(143,200,190,0.05)";
  for (let gy = 40; gy < H - 30; gy += 56) ctx.fillRect(0, gy, W, 1);
  const gOff = Math.round(x * 0.2);
  for (let gx = -(gOff % 120); gx < W; gx += 120) ctx.fillRect(gx, 0, 1, H);
  // A ghost price chart.
  const cOff = Math.round(x * 0.28);
  ctx.globalAlpha = 0.07;
  for (let rep = Math.floor(cOff / CANDLE_LEN); rep * CANDLE_LEN - cOff < W; rep++) {
    for (const k of candles) {
      const sx = rep * CANDLE_LEN + k.x - cOff;
      if (sx > W + 8 || sx < -8) continue;
      ctx.fillStyle = k.c < k.o ? "#39d6a3" : "#fb7185";
      ctx.fillRect(sx - 0.5, k.hi, 1, k.lo - k.hi);
      ctx.fillRect(sx - 3, Math.min(k.o, k.c), 6, Math.max(2, Math.abs(k.o - k.c)));
    }
  }
  ctx.globalAlpha = 1;
  // Speed streaks: more and longer the higher the leverage.
  if (f.speed >= 3 && f.phase === "running") {
    const n = 6 + f.speed * 3;
    for (let i = 0; i < n; i++) {
      const y = ((i * 97) % (H - 40)) + 8;
      const len = 30 + f.speed * 14 + (i % 4) * 12;
      const sx = W + 40 - ((f.time * (500 + f.speed * 260) + i * 173) % (W + 200));
      ctx.globalAlpha = 0.05 + f.speed * 0.012;
      ctx.fillStyle = f.speed >= 7 ? "#fb7185" : "#cfeee6";
      ctx.fillRect(sx, y, len, 1.5);
    }
    ctx.globalAlpha = 1;
  }
}

/**
 * Tony: a trader in a navy suit with a mint tie and a jetpack on his back. Each tap fires the jetpack, so `burn` is how hard it is
 * burning right now (1 on the tap, fading to 0), drawn as a flame out of the nozzle.
 */
export function drawTony(ctx: CanvasRenderingContext2D, x: number, y: number, tilt: number, t: number, crashed: boolean, burn = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  const nx = -10.5;
  const ny = R + 9;
  // The flame, behind everything else: a long orange teardrop with a hot core, flickering.
  if (burn > 0.02 && !crashed) {
    const len = (7 + 15 * burn) * (0.85 + 0.15 * Math.sin(t * 90));
    const wid = 3.2 + 2.2 * burn;
    ctx.shadowColor = "#ffb347";
    ctx.shadowBlur = 10;
    ctx.fillStyle = "#ff8a3d";
    ctx.beginPath();
    ctx.moveTo(nx - wid, ny);
    ctx.quadraticCurveTo(nx, ny + len * 1.3, nx + wid, ny);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff1b8";
    ctx.beginPath();
    ctx.moveTo(nx - wid * 0.5, ny);
    ctx.quadraticCurveTo(nx, ny + len * 0.75, nx + wid * 0.5, ny);
    ctx.closePath();
    ctx.fill();
  }
  // The jetpack: a steel tank with a red band and a dark nozzle.
  ctx.fillStyle = "#8fa3ab";
  ctx.beginPath();
  ctx.roundRect(-15, R - 7, 9, 16, 2.5);
  ctx.fill();
  ctx.fillStyle = "#fb7185";
  ctx.fillRect(-15, R - 1, 9, 3);
  ctx.fillStyle = "#37474f";
  ctx.fillRect(nx - 2.5, ny - 1, 5, 3.5);
  // Legs and shoes.
  ctx.fillStyle = "#16242d";
  ctx.fillRect(-6, R + 7, 5, 8);
  ctx.fillRect(1, R + 7, 5, 8);
  ctx.fillStyle = "#0a1418";
  ctx.fillRect(-6.5, R + 14, 6.5, 3);
  ctx.fillRect(0.5, R + 14, 6.5, 3);
  // The suit.
  ctx.fillStyle = "#1d3140";
  ctx.beginPath();
  ctx.roundRect(-8, R - 4, 16, 14, 3);
  ctx.fill();
  ctx.fillStyle = "#2c4757";
  ctx.fillRect(-8, R - 4, 3, 14);
  // Shirt collar, lapels and a red tie with a knot.
  ctx.fillStyle = "#eef3f4";
  ctx.beginPath();
  ctx.moveTo(-5.5, R - 3);
  ctx.lineTo(0, R + 4);
  ctx.lineTo(5.5, R - 3);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#35566a";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-6.5, R - 3);
  ctx.lineTo(-1.5, R + 8);
  ctx.moveTo(6.5, R - 3);
  ctx.lineTo(1.5, R + 8);
  ctx.stroke();
  ctx.fillStyle = "#e11d48";
  ctx.beginPath();
  ctx.moveTo(-1.8, R - 1);
  ctx.lineTo(1.8, R - 1);
  ctx.lineTo(1.2, R + 1.5);
  ctx.lineTo(-1.2, R + 1.5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#be123c";
  ctx.beginPath();
  ctx.moveTo(-1.3, R + 1.5);
  ctx.lineTo(1.3, R + 1.5);
  ctx.lineTo(2.2, R + 8.5);
  ctx.lineTo(0, R + 10.5);
  ctx.lineTo(-2.2, R + 8.5);
  ctx.closePath();
  ctx.fill();
  // A pocket square.
  ctx.fillStyle = "#eef3f4";
  ctx.fillRect(-7, R + 2, 3, 2);
  // The head: skin, an ear, and swept dark hair with a cowlick.
  ctx.fillStyle = "#f2c79a";
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e3b184";
  ctx.beginPath();
  ctx.arc(-R + 1.2, 2, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1c2b30";
  ctx.beginPath();
  ctx.arc(0, 0, R, Math.PI * 1.02, Math.PI * 1.98);
  ctx.lineTo(0, -R + 3);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-1, -R + 1);
  ctx.quadraticCurveTo(2, -R - 6, 6, -R - 3);
  ctx.quadraticCurveTo(3, -R - 2, 3, -R + 2);
  ctx.fill();
  // Dark shades: two lenses, a bridge and an arm back to the ear, with a glint. After a crash they sit crooked and cracked.
  ctx.save();
  if (crashed) ctx.rotate(0.28);
  ctx.strokeStyle = "#05090b";
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(-R + 0.5, -1.5);
  ctx.lineTo(-7.4, -1);
  ctx.moveTo(-0.9, -0.6);
  ctx.lineTo(0.9, -0.6);
  ctx.stroke();
  ctx.fillStyle = "#05090b";
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.roundRect(sx < 0 ? -7.6 : 0.6, -2.8, 7, 5.2, 1.6);
    ctx.fill();
  }
  ctx.strokeStyle = crashed ? "rgba(255,255,255,0.8)" : "rgba(160,235,255,0.55)";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  if (crashed) {
    ctx.moveTo(1.8, -2.4);
    ctx.lineTo(4, 0);
    ctx.lineTo(3, 1.8);
    ctx.moveTo(-6.4, -2);
    ctx.lineTo(-4.6, 0.2);
  } else {
    ctx.moveTo(-6.4, -1.9);
    ctx.lineTo(-4.3, -1.9);
    ctx.moveTo(1.8, -1.9);
    ctx.lineTo(3.9, -1.9);
  }
  ctx.stroke();
  ctx.restore();
  // A small smirk (or a grimace after a crash).
  ctx.strokeStyle = "#5a2f22";
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  if (crashed) ctx.arc(0, 7.2, 1.7, 0, Math.PI * 2);
  else {
    ctx.moveTo(-2.6, 6);
    ctx.quadraticCurveTo(0.5, 8, 3.2, 5.2);
  }
  ctx.stroke();
  ctx.restore();
}

export function drawFrame(ctx: CanvasRenderingContext2D, f: Frame) {
  const { bird, track } = f;
  const W = f.w;
  const left = bird.x - BIRD_X;
  ctx.save();
  if (f.fx.shake > 0) {
    const k = f.fx.shake * f.fx.shake * 6;
    ctx.translate(k * Math.sin(f.time * 71), k * Math.sin(f.time * 53 + 1));
  }
  // Sky: a deep teal-black wash, and stars that drift past slower than the course (they are far away).
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#050c0f");
  sky.addColorStop(1, "#0c2a30");
  ctx.fillStyle = sky;
  ctx.fillRect(-12, -12, W + 24, H + 24);
  for (const s of stars) {
    const sx = (((s.x * W - bird.x * s.depth) % W) + W) % W;
    ctx.globalAlpha = 0.35 + 0.35 * Math.sin(f.time * 1.5 + s.tw);
    ctx.fillStyle = "#cfeee6";
    ctx.beginPath();
    ctx.arc(sx, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  drawBackdrop(ctx, f, W);

  // The tunnel.
  const tops: number[] = [];
  const bots: number[] = [];
  const xs: number[] = [];
  for (let sx = -12; sx <= W + 12; sx += 4) {
    const c = track.centerAt(left + sx);
    const g = track.gapAt(left + sx);
    xs.push(sx);
    tops.push(c - g / 2);
    bots.push(c + g / 2);
  }
  ctx.fillStyle = "#08161a";
  ctx.beginPath();
  ctx.moveTo(xs[0], -2);
  xs.forEach((x, i) => ctx.lineTo(x, tops[i]));
  ctx.lineTo(xs[xs.length - 1], -2);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(xs[0], H + 2);
  xs.forEach((x, i) => ctx.lineTo(x, bots[i]));
  ctx.lineTo(xs[xs.length - 1], H + 2);
  ctx.closePath();
  ctx.fill();
  const glow = ctx.createLinearGradient(0, 0, 0, H);
  glow.addColorStop(0, "rgba(57,214,163,0)");
  glow.addColorStop(0.5, "rgba(57,214,163,0.05)");
  glow.addColorStop(1, "rgba(57,214,163,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  xs.forEach((x, i) => (i === 0 ? ctx.moveTo(x, tops[i]) : ctx.lineTo(x, tops[i])));
  for (let i = xs.length - 1; i >= 0; i--) ctx.lineTo(xs[i], bots[i]);
  ctx.closePath();
  ctx.fill();
  ctx.shadowColor = MINT;
  ctx.shadowBlur = 8;
  ctx.strokeStyle = MINT;
  ctx.lineWidth = 2;
  for (const edge of [tops, bots]) {
    ctx.beginPath();
    xs.forEach((x, i) => (i === 0 ? ctx.moveTo(x, edge[i]) : ctx.lineTo(x, edge[i])));
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  ctx.setLineDash([3, 7]);
  ctx.strokeStyle = "rgba(57,214,163,0.32)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  xs.forEach((x, i) => (i === 0 ? ctx.moveTo(x, (tops[i] + bots[i]) / 2) : ctx.lineTo(x, (tops[i] + bots[i]) / 2)));
  ctx.stroke();
  ctx.setLineDash([]);

  // The finish gate of a tutorial level.
  if (f.gate) {
    const gateX = f.gate.x - left;
    if (gateX > -20 && gateX < W + 20) {
      const gc = track.centerAt(f.gate.x);
      const gp = track.gapAt(f.gate.x);
      const g = ctx.createLinearGradient(gateX - 18, 0, gateX + 18, 0);
      g.addColorStop(0, "rgba(57,214,163,0)");
      g.addColorStop(0.5, "rgba(57,214,163,0.55)");
      g.addColorStop(1, "rgba(57,214,163,0)");
      ctx.fillStyle = g;
      ctx.fillRect(gateX - 18, gc - gp / 2, 36, gp);
      ctx.fillStyle = "#f3f8f8";
      ctx.font = `700 11px ${f.fonts.head}`;
      ctx.textAlign = "center";
      ctx.fillText(f.gate.label, gateX, gc - gp / 2 - 8);
      ctx.textAlign = "left";
    }
  }

  // Red candles: a body growing out of the wall into the gap, with a wick that pokes a little further.
  const laps0 = Number.isFinite(f.cycle) ? Math.floor(left / f.cycle) : 0;
  for (let lap = laps0; lap <= (Number.isFinite(f.cycle) ? laps0 + 1 : 0); lap++) {
    const base = Number.isFinite(f.cycle) ? lap * f.cycle : 0;
    for (const o of f.obstacles(lap)) {
      const sx = base + o.x - left;
      if (sx < -OBSTACLE_W || sx > W + OBSTACLE_W) continue;
      const { top, bottom } = obstacleSpan(o, track, base + o.x);
      const tip = o.side === "top" ? bottom : top;
      ctx.shadowColor = "#fb7185";
      ctx.shadowBlur = 10;
      ctx.strokeStyle = "#fb7185";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx, o.side === "top" ? top - 2 : bottom + 2);
      ctx.lineTo(sx, tip + (o.side === "top" ? 9 : -9));
      ctx.stroke();
      const body = ctx.createLinearGradient(sx - OBSTACLE_W / 2, 0, sx + OBSTACLE_W / 2, 0);
      body.addColorStop(0, "#c2415a");
      body.addColorStop(0.5, "#fb7185");
      body.addColorStop(1, "#a83650");
      ctx.fillStyle = body;
      ctx.fillRect(sx - OBSTACLE_W / 2, top, OBSTACLE_W, bottom - top);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "#ffd0d8";
      ctx.lineWidth = 1.2;
      ctx.strokeRect(sx - OBSTACLE_W / 2 + 0.5, top + 0.5, OBSTACLE_W - 1, bottom - top - 1);
    }
  }

  // Coins (for a lap that repeats, this lap's and the next one's).
  const lap0 = Number.isFinite(f.cycle) ? Math.floor(left / f.cycle) : 0;
  for (let lap = lap0; lap <= (Number.isFinite(f.cycle) ? lap0 + 1 : 0); lap++) {
    const base = Number.isFinite(f.cycle) ? lap * f.cycle : 0;
    f.coins.forEach((k, i) => {
      if (f.taken(lap, i)) return;
      const sx = base + k.x - left;
      if (sx < -10 || sx > W + 10) return;
      // A coin turning on its edge.
      const rx = Math.max(1.6, 6.5 * Math.abs(Math.cos(f.time * 4 + i * 0.9)));
      ctx.shadowColor = "#f5c451";
      ctx.shadowBlur = 8;
      ctx.fillStyle = "#f5c451";
      ctx.beginPath();
      ctx.ellipse(sx, k.y, rx, 6.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "#fff1b8";
      ctx.lineWidth = 1.2;
      ctx.stroke();
    });
  }

  // Smoke from the jetpack.
  for (const d of f.fx.trail) {
    ctx.globalAlpha = Math.max(0, 1 - d.age / 0.5) * 0.4;
    ctx.fillStyle = d.age < 0.12 ? "#ffb347" : "#9fb3b8";
    ctx.beginPath();
    ctx.arc(d.x - left, d.y, 1.5 + d.age * 6, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const p of f.fx.sparks) {
    ctx.globalAlpha = Math.max(0, 1 - p.age / 0.7);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - left - 1.5, p.y - 1.5, 3, 3);
  }
  ctx.globalAlpha = 1;
  ctx.font = `700 12px ${f.fonts.head}`;
  for (const b of f.bits) {
    ctx.globalAlpha = Math.max(0, 1 - b.age / 0.8);
    ctx.fillStyle = b.age % 0.2 < 0.1 ? "#f5c451" : MINT;
    ctx.fillRect(b.x - left, b.y, 3, 3);
  }
  ctx.globalAlpha = 1;

  const tilt = Math.max(-0.5, Math.min(0.7, bird.vy / 700));
  const burn = f.phase === "running" ? Math.max(0, 1 - f.fx.flapAge / 0.3) : 0;
  drawTony(ctx, BIRD_X, bird.y, f.phase === "crashed" ? f.time * 7 : tilt, f.time, f.phase === "crashed", burn);
  // Numbers that float up from a coin.
  ctx.font = `700 12px ${f.fonts.head}`;
  ctx.textAlign = "center";
  for (const p of f.fx.pops) {
    ctx.globalAlpha = Math.max(0, 1 - p.age / 0.8);
    ctx.fillStyle = "#ffe08a";
    ctx.fillText(p.text, p.x - left, p.y - 14 - p.age * 36);
  }
  ctx.textAlign = "left";
  ctx.globalAlpha = 1;
  ctx.restore();
  if (f.fx.flash > 0) {
    ctx.fillStyle = `rgba(251,113,133,${(f.fx.flash * 0.35).toFixed(3)})`;
    ctx.fillRect(0, 0, W, H);
  }

  // The handover from one asset to the next: the picture tears sideways, and a banner says where it is going.
  if (f.sync && f.sync.amount > 0) {
    const a = f.sync.amount;
    for (let i = 0; i < 7; i++) {
      const y = ((f.time * 190 + i * 53) % H) | 0;
      ctx.fillStyle = i % 2 ? "rgba(57,214,163,0.16)" : "rgba(207,238,230,0.1)";
      ctx.fillRect(0, y, W, 2 + (i % 3) * 3 * a);
    }
    ctx.globalAlpha = Math.min(1, a * 1.4);
    ctx.fillStyle = "rgba(5,12,15,0.7)";
    ctx.fillRect(W / 2 - 150, 46, 300, 30);
    ctx.strokeStyle = MINT;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(W / 2 - 150, 46, 300, 30);
    ctx.fillStyle = "#f3f8f8";
    ctx.font = `700 13px ${f.fonts.head}`;
    ctx.textAlign = "center";
    ctx.fillText(f.sync.label, W / 2, 66);
    ctx.textAlign = "left";
    ctx.globalAlpha = 1;
  }

  // Heads-up display.
  ctx.fillStyle = "rgba(243,248,248,0.9)";
  ctx.font = `600 12px ${f.fonts.head}`;
  ctx.textAlign = "left";
  ctx.fillText(f.hud.left, 14, 22);
  ctx.textAlign = "right";
  ctx.fillStyle = "#f5c451";
  ctx.fillText(f.hud.right, W - 14, 22);
  if (f.progress !== undefined) {
    ctx.fillStyle = MINT;
    ctx.fillRect(0, 0, W * Math.min(1, f.progress), 3);
  }
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(243,248,248,0.85)";
  ctx.font = `500 12px ${f.fonts.body}`;
  ctx.fillText(f.hud.center, W / 2, 22);
  ctx.textAlign = "left";
  if (f.timeline) drawTimeline(ctx, f, W);
}

/** The strip along the bottom: a timeline of the years the asset covers, filling in as Tony flies, with the date under him ticking along. */
function drawTimeline(ctx: CanvasRenderingContext2D, f: Frame, W: number) {
  const { from, to, at } = f.timeline!;
  const x0 = 36;
  const x1 = W - 36;
  const y = H - 9;
  const p = Math.min(1, Math.max(0, (at - from) / Math.max(1, to - from)));
  ctx.fillStyle = "rgba(243,248,248,0.14)";
  ctx.fillRect(x0, y - 1.5, x1 - x0, 3);
  ctx.fillStyle = MINT;
  ctx.fillRect(x0, y - 1.5, (x1 - x0) * p, 3);
  const y0 = new Date(from).getUTCFullYear();
  const y1 = new Date(to).getUTCFullYear();
  const step = Math.max(1, Math.ceil(((y1 - y0) * 34) / (x1 - x0)));
  ctx.font = `500 9px ${f.fonts.body}`;
  ctx.textAlign = "center";
  for (let yr = y0 + 1; yr <= y1; yr++) {
    const fx = x0 + ((x1 - x0) * (Date.UTC(yr, 0, 1) - from)) / Math.max(1, to - from);
    ctx.fillStyle = "rgba(243,248,248,0.35)";
    ctx.fillRect(Math.round(fx) - 0.5, y - 5, 1, 10);
    if ((yr - y0) % step === 0) ctx.fillText(String(yr), fx, y - 8);
  }
  const px = x0 + (x1 - x0) * p;
  ctx.shadowColor = MINT;
  ctx.shadowBlur = 8;
  ctx.fillStyle = "#f3f8f8";
  ctx.beginPath();
  ctx.arc(px, y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  const label = new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  ctx.font = `700 12px ${f.fonts.head}`;
  ctx.fillStyle = "#f3f8f8";
  ctx.fillText(label, Math.min(x1 - 46, Math.max(x0 + 46, px)), y - 22);
  ctx.textAlign = "left";
}

/** Price lines drifting slowly across the title screen: long random walks, each at its own height, pace and brightness. */
const LINE_LEN = 2400;
const LINE_STEP = 30;
const priceLines = [
  { seed: 5, base: 0.3, amp: 46, speed: 9, alpha: 0.1, width: 1.6 },
  { seed: 17, base: 0.62, amp: 62, speed: 15, alpha: 0.14, width: 1.8 },
  { seed: 29, base: 0.82, amp: 38, speed: 24, alpha: 0.08, width: 1.4 },
].map((l) => {
  const rnd = seeded(l.seed);
  const pts: number[] = [];
  let y = 0;
  for (let x = 0; x <= LINE_LEN; x += LINE_STEP) {
    y = Math.max(-l.amp, Math.min(l.amp, y + (rnd() - 0.5) * 34));
    pts.push(y);
  }
  // Join the end back to the start so the line can repeat without a jump.
  const n = 12;
  for (let i = 0; i < n; i++) pts[pts.length - 1 - i] = pts[pts.length - 1 - i] * (i / n) + pts[0] * (1 - i / n);
  return { ...l, pts };
});

export interface MenuBuddy {
  x: number;
  y: number;
  vx: number;
  vy: number;
  acc: number;
  smoke: { x: number; y: number; age: number }[];
}

/**
 * The scene behind the title screen and the main menu: the same teal-black as the rest of the game, faint price lines drifting through it, and
 * Tony floating about on his jetpack. He trails the cursor (or a finger) a little behind it on a soft spring, and wanders slowly when
 * nobody is pointing.
 */
export function drawMenuScene(ctx: CanvasRenderingContext2D, o: { w: number; dt: number; time: number; buddy: MenuBuddy; pointer: { x: number; y: number } | null }) {
  const { w: W, dt, time: t, buddy: b, pointer } = o;
  const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.hypot(W, H) * 0.55);
  g.addColorStop(0, "#0c2a30");
  g.addColorStop(0.8, "#050c0f");
  g.addColorStop(1, "#050c0f");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Price lines. The nearer ones shift against the pointer a little, so the scene has depth.
  const px = pointer ? (pointer.x - W / 2) / W : 0;
  const py = pointer ? (pointer.y - H / 2) / H : 0;
  ctx.fillStyle = "rgba(143,200,190,0.045)";
  for (let gy = 50; gy < H; gy += 70) ctx.fillRect(0, gy, W, 1);
  ctx.lineJoin = "round";
  for (const l of priceLines) {
    const off = t * l.speed + px * 30 * (l.speed / 15);
    ctx.globalAlpha = l.alpha;
    ctx.strokeStyle = "#39d6a3";
    ctx.lineWidth = l.width;
    ctx.beginPath();
    for (let sx = -LINE_STEP; sx <= W + LINE_STEP; sx += LINE_STEP) {
      const u = (((sx + off) % LINE_LEN) + LINE_LEN) % LINE_LEN;
      const i = Math.floor(u / LINE_STEP);
      const f = u / LINE_STEP - i;
      const y = l.base * H + l.pts[i] * (1 - f) + l.pts[(i + 1) % l.pts.length] * f - py * 14 * (l.speed / 15);
      if (sx === -LINE_STEP) ctx.moveTo(sx, y);
      else ctx.lineTo(sx, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Tony: a soft spring toward a spot just below the pointer, or a slow wander.
  const tx = pointer ? pointer.x : W / 2 + Math.sin(t * 0.5) * W * 0.3;
  const ty = (pointer ? pointer.y + 28 : H / 2 + Math.sin(t * 0.8) * H * 0.14) + Math.sin(t * 2.4) * 3;
  const step = Math.min(dt, 1 / 30);
  b.vx += ((tx - b.x) * 5 - b.vx * 2.6) * step;
  b.vy += ((ty - b.y) * 5 - b.vy * 2.6) * step;
  b.x = Math.min(W - 20, Math.max(20, b.x + b.vx * step));
  b.y = Math.min(H - 30, Math.max(24, b.y + b.vy * step));
  const speed = Math.hypot(b.vx, b.vy);
  const burn = Math.min(1, 0.2 + speed / 240 + (b.vy < -40 ? 0.3 : 0));

  b.acc += step;
  if (b.acc > 0.05 && burn > 0.35) {
    b.acc = 0;
    b.smoke.push({ x: b.x - 10, y: b.y + 22, age: 0 });
  }
  for (const d of b.smoke) {
    d.age += step;
    ctx.globalAlpha = Math.max(0, 1 - d.age / 0.55) * 0.4;
    ctx.fillStyle = d.age < 0.12 ? "#ffb347" : "#9fb3b8";
    ctx.beginPath();
    ctx.arc(d.x, d.y, 1.5 + d.age * 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  b.smoke = b.smoke.filter((d) => d.age < 0.55);
  drawTony(ctx, b.x, b.y, Math.max(-0.4, Math.min(0.4, b.vx / 500)), t, false, burn);
}
