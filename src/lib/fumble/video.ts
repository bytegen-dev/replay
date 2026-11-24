import { drawHatch } from "../canvasHatch.ts";
import { RECAP_NAME } from "../recapName.ts";
import { canvasTheme, pickVideoFormat, type Palette } from "../replayVideo.ts";
import type { CardHide } from "./card.ts";
import { loadCoinImage } from "./coinImage.ts";
import { bestTrade, worstFumble, worstRoundtrip } from "./highlights.ts";
import { figure, type Display } from "./money.ts";
import type { ApiResult } from "./service.ts";
import type { HideMode } from "./settings.ts";
import { countTrades, coverageNote, figureCoverage, NOT_THERE, reachSpan, shortMint, signedSol, tokenLabel, tradeVolume, type Coverage } from "./view.ts";

/**
 * The recap as a short vertical video (1080 by 1920, about 24 seconds), made in the browser: each scene is drawn onto a canvas frame by frame and the
 * canvas is recorded, like the replay video, so it needs no server and no library.
 *
 * What the scenes say is decided here, apart from the drawing, so it can be tested: `planRecapVideo` turns a scan into scenes, following what the visitor
 * chose to show, mask (***) or hide in the settings (a hidden figure's scene is left out, a masked one counts up to nothing and says ***).
 * The painter below draws a scene at any moment of the timeline.
 */

export const VIDEO_W = 1080;
export const VIDEO_H = 1920;
const FPS = 30;

export type Tone = "up" | "down" | "plain" | "muted";

export interface VideoScene {
  id: "intro" | "pnl" | "roundtrip" | "fumble" | "volume" | "outro";
  seconds: number;
  /** The small line above the figure (the title, on the first scene). */
  label: string;
  /** The big figure: money that counts up from zero, or fixed words (***, Not priced) in its place. */
  figure?: { money: { sol: number; usd: number | null; signed: boolean } | null; text: string | null; tone: Tone };
  /** Lines under it. */
  notes: string[];
  /** A moment from the scan: the coin and what happened. */
  highlight?: { title: string; ticker: string; /** The coin's picture (an address the site can load it from), when the token data has one. */ image?: string; detail: string; tone: Tone };
}

const known = (u: number, s: number) => (u === 0 && s !== 0 ? null : u);
const mode = (m: HideMode | undefined): HideMode => m ?? "show";
const toneOf = (n: number): Tone => (n > 0 ? "up" : n < 0 ? "down" : "plain");

/** What the scenes are, in order, for this scan: the intro, a scene for each figure that is not hidden, and the outro. */
export function planRecapVideo(r: ApiResult, now: number, display: Display, hide: CardHide = {}): VideoScene[] {
  const scenes: VideoScene[] = [];
  const cover = figureCoverage(r);

  const sells = r.trades.filter((t) => t.side === "sell").length;
  const buys = r.trades.length - sells;
  const trades = countTrades(r.trades);
  const noun = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  scenes.push({
    id: "intro",
    seconds: 3,
    label: RECAP_NAME,
    notes: [
      hide.wallet ? "***" : shortMint(r.wallet),
      `${noun(trades, "trade", "trades")}, ${noun(buys, "buy", "buys")} and ${noun(sells, "sell", "sells")}`,
      ...(r.coverage.oldest ? [`over ${reachSpan(r.coverage.oldest, now).label}`] : []),
    ],
  });

  // A figure's scene: the figure counts up, unless it is masked or could not be worked out, and a partial one says how much of it was.
  const figureScene = (
    id: VideoScene["id"],
    label: string,
    m: HideMode,
    sol: number,
    usd: number | null,
    signed: boolean,
    cov: Coverage,
    what: "pnl" | "fumble" | "roundtrip" | null,
    tone: Tone,
    seconds: number,
  ): VideoScene => {
    const masked = m === "mask";
    const missing = !masked && what !== null && cov.kind === "none";
    const note = !masked && what !== null ? coverageNote(cov, what) : null;
    return {
      id,
      seconds,
      label,
      figure: { money: masked || missing ? null : { sol, usd, signed }, text: masked ? "***" : missing ? NOT_THERE[what!] : null, tone: masked || missing ? "muted" : tone },
      notes: note && !missing ? [note] : [],
    };
  };

  if (mode(hide.pnl) !== "hide") {
    const s = figureScene("pnl", "PnL", mode(hide.pnl), r.totalProfitSol, known(r.totalProfitUsd, r.totalProfitSol), true, cover.pnl, "pnl", toneOf(r.totalProfitSol), 5);
    const best = bestTrade(r);
    if (best) {
      const masked = mode(hide.pnl) === "mask";
      s.highlight = {
        title: "Best trade",
        ticker: tokenLabel(best.token, r.tokens).ticker,
        image: tokenLabel(best.token, r.tokens).image,
        detail: masked ? "***" : figure(display, best.profitSol, best.profitUsd === 0 ? null : best.profitUsd, true).main,
        tone: masked ? "muted" : "up",
      };
    }
    scenes.push(s);
  }

  if (mode(hide.roundtrip) !== "hide") {
    const s = figureScene("roundtrip", "Roundtripped", mode(hide.roundtrip), r.totalRoundTripSol, known(r.totalRoundTripUsd, r.totalRoundTripSol), false, cover.roundtrip, "roundtrip", r.totalRoundTripSol > 0 ? "down" : "plain", 5);
    const worst = worstRoundtrip(r);
    if (worst) {
      const masked = mode(hide.roundtrip) === "mask";
      s.highlight = {
        title: "Worst roundtrip",
        ticker: tokenLabel(worst.token, r.tokens).ticker,
        image: tokenLabel(worst.token, r.tokens).image,
        detail: masked ? "***" : `Peaked at ${signedSol(worst.peakProfitSol ?? 0)}, ended at ${signedSol(worst.finalProfitSol ?? 0)}`,
        tone: masked ? "muted" : "down",
      };
    }
    scenes.push(s);
  }

  if (mode(hide.fumble) !== "hide") {
    const s = figureScene("fumble", "Fumble", mode(hide.fumble), r.totalFumbleSol, known(r.totalFumbleUsd, r.totalFumbleSol), false, cover.fumble, "fumble", r.totalFumbleSol > 0 ? "down" : "plain", 5);
    const worst = worstFumble(r);
    if (worst) {
      const masked = mode(hide.fumble) === "mask";
      s.highlight = {
        title: "Biggest fumble",
        ticker: tokenLabel(worst.token, r.tokens).ticker,
        image: tokenLabel(worst.token, r.tokens).image,
        detail: masked ? "***" : `Sold, then ${(worst.peakMultiple ?? 1).toFixed(1)}x higher`,
        tone: masked ? "muted" : "down",
      };
    }
    scenes.push(s);
  }

  if (mode(hide.volume) !== "hide") {
    const v = tradeVolume(r.trades, r.coins);
    scenes.push(figureScene("volume", "Total volume", mode(hide.volume), v.sol, v.usd === null ? null : known(v.usd, v.sol), false, { kind: "full" }, null, "plain", 3.5));
  }

  scenes.push({ id: "outro", seconds: 3, label: "Replay", notes: ["A time machine for your money", "replay.bytegen.dev"] });
  return scenes;
}

/** The whole length, and where each scene starts. */
export function timeline(scenes: VideoScene[]): { total: number; starts: number[] } {
  const starts: number[] = [];
  let at = 0;
  for (const s of scenes) {
    starts.push(at);
    at += s.seconds;
  }
  return { total: at, starts };
}

/** The scene playing at second `t`, how far into it (seconds), and its place in the list. Past the end it stays on the last scene. */
export function sceneAt(scenes: VideoScene[], t: number): { scene: VideoScene; index: number; local: number } {
  const { starts } = timeline(scenes);
  let index = 0;
  for (let i = 0; i < scenes.length; i++) if (t >= starts[i]) index = i;
  return { scene: scenes[index], index, local: Math.max(0, t - starts[index]) };
}

/* ------------------------------ drawing ------------------------------ */

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);

/** A colour with an opacity, for the soft light behind a figure: the colour is read back from a one-pixel canvas, so any CSS colour works. */
function withAlpha(color: string, a: number): string {
  const px = document.createElement("canvas");
  px.width = px.height = 1;
  const x = px.getContext("2d");
  if (!x) return color;
  x.fillStyle = color;
  x.fillRect(0, 0, 1, 1);
  const [r, g, b] = x.getImageData(0, 0, 1, 1).data;
  return `rgba(${r},${g},${b},${a})`;
}

/** Draws text at the largest size from `start` down to `min` that fits `maxWidth`, and returns the size used. */
function fitText(ctx: CanvasRenderingContext2D, text: string, family: string, start: number, min: number, maxWidth: number, weight = 700): number {
  let size = start;
  ctx.font = `${weight} ${size}px ${family}`;
  while (size > min && ctx.measureText(text).width > maxWidth) {
    size -= 4;
    ctx.font = `${weight} ${size}px ${family}`;
  }
  return size;
}

/**
 * Everything needed to draw the video at any second: the background is drawn once, and `draw` paints one frame. Takes the plan and the site's colours;
 * `display` is how money is written (the primary currency, and the small line under it). `images` are the coins' pictures, loaded before the recording starts and
 * keyed by the address a highlight names; a coin with none (or one that failed to load) gets its first letter in the box.
 */
export function createRecapPainter(c: Palette, scenes: VideoScene[], display: Display, images: ReadonlyMap<string, HTMLImageElement> = new Map()) {
  const { total } = timeline(scenes);
  const W = VIDEO_W;
  const H = VIDEO_H;
  const X = 90;
  const wide = W - 2 * X;

  const bg = document.createElement("canvas");
  bg.width = W;
  bg.height = H;
  const b = bg.getContext("2d");
  if (b) {
    b.fillStyle = c.bg;
    b.fillRect(0, 0, W, H);
    drawHatch(b, W, c.hatch, 2);
  }

  const tone = (t: Tone): string => (t === "up" ? c.primary : t === "down" ? c.down : t === "muted" ? c.muted : c.fg);
  const glow: Record<Tone, string> = { up: withAlpha(c.primary, 0.2), down: withAlpha(c.down, 0.2), plain: withAlpha(c.primary, 0.12), muted: withAlpha(c.muted, 0.1) };
  const glowEdge: Record<Tone, string> = { up: withAlpha(c.primary, 0), down: withAlpha(c.down, 0), plain: withAlpha(c.primary, 0), muted: withAlpha(c.muted, 0) };

  function draw(ctx: CanvasRenderingContext2D, t: number) {
    const time = Math.min(Math.max(0, t), total - 0.001);
    const { scene, index, local } = sceneAt(scenes, time);
    const last = index === scenes.length - 1;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(bg, 0, 0);
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";

    // The strip at the top: one segment for each scene, filling as it plays.
    const gap = 10;
    const segW = (wide - gap * (scenes.length - 1)) / scenes.length;
    scenes.forEach((s, i) => {
      const x = X + i * (segW + gap);
      ctx.fillStyle = c.border;
      ctx.fillRect(x, 96, segW, 6);
      const fill = i < index ? 1 : i === index ? clamp01(local / s.seconds) : 0;
      ctx.fillStyle = c.primary;
      ctx.fillRect(x, 96, segW * fill, 6);
    });

    // This scene comes in (rising a little and fading up) and goes out before the next; the last one stays.
    const enter = easeOut(local / 0.45);
    const exit = last ? 1 : clamp01((scene.seconds - local) / 0.35);
    const alpha = Math.min(enter, exit);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(0, (1 - enter) * 40);

    if (scene.id === "intro") drawIntro(ctx, scene, local);
    else if (scene.id === "outro") drawOutro(ctx, scene);
    else drawFigureScene(ctx, scene, local, time);
    ctx.restore();

    // The footer on every scene but the last: the mark and the name.
    if (scene.id !== "outro") {
      ctx.globalAlpha = 1;
      if (c.mark) ctx.drawImage(c.mark, X, H - 190, 64, 64);
      ctx.fillStyle = c.fg;
      ctx.font = `600 44px ${c.head}`;
      ctx.fillText("Replay", X + (c.mark ? 84 : 0), H - 140);
      ctx.fillStyle = c.muted;
      ctx.font = `400 34px ${c.body}`;
      ctx.textAlign = "right";
      ctx.fillText(RECAP_NAME, W - X, H - 142);
      ctx.textAlign = "left";
    }
  }

  function drawIntro(ctx: CanvasRenderingContext2D, scene: VideoScene, local: number) {
    ctx.fillStyle = c.fg;
    fitText(ctx, scene.label, c.head, 190, 90, wide);
    ctx.fillText(scene.label, X, 820);
    // A line under the title that grows across.
    ctx.fillStyle = c.primary;
    ctx.fillRect(X, 820 + 36, wide * easeOut((local - 0.2) / 0.9) * 0.45, 8);
    scene.notes.forEach((line, i) => {
      const a = easeOut((local - 0.5 - i * 0.2) / 0.5);
      ctx.globalAlpha = a;
      ctx.fillStyle = i === 0 ? c.muted : c.fg;
      ctx.font = `${i === 0 ? 400 : 500} ${i === 0 ? 46 : 52}px ${c.body}`;
      ctx.fillText(line, X, 980 + i * 84);
    });
    ctx.globalAlpha = 1;
  }

  function drawOutro(ctx: CanvasRenderingContext2D, scene: VideoScene) {
    if (c.mark) ctx.drawImage(c.mark, X, 700, 190, 190);
    ctx.fillStyle = c.fg;
    ctx.font = `700 150px ${c.head}`;
    ctx.fillText(scene.label, X, 1070);
    ctx.fillStyle = c.muted;
    ctx.font = `400 46px ${c.body}`;
    ctx.fillText(scene.notes[0] ?? "", X, 1160);
    ctx.fillStyle = c.primary;
    ctx.font = `500 46px ${c.body}`;
    ctx.fillText(scene.notes[1] ?? "", X, 1240);
  }

  function drawFigureScene(ctx: CanvasRenderingContext2D, scene: VideoScene, local: number, time: number) {
    const fig = scene.figure;
    if (!fig) return;
    const labelY = 700;

    // The label, then the figure counting up (or its words), over a soft light in its colour that breathes.
    ctx.fillStyle = c.muted;
    ctx.font = `400 50px ${c.body}`;
    ctx.fillText(scene.label, X, labelY);

    const p = easeOut(local / 1.7);
    const shown = fig.money ? figure(display, fig.money.sol * p, fig.money.usd === null ? null : fig.money.usd * p, fig.money.signed) : null;
    const text = fig.text ?? shown?.main ?? "";
    const size = fitText(ctx, text, c.head, fig.text && fig.text !== "***" ? 130 : 220, 70, wide);
    const baseline = labelY + 50 + size * 0.78;

    const cy = baseline - size * 0.4;
    const radius = 760;
    const g = ctx.createRadialGradient(W / 2, cy, 0, W / 2, cy, radius);
    const breathe = 0.85 + 0.15 * Math.sin(time * 2.2);
    g.addColorStop(0, glow[fig.tone]);
    g.addColorStop(1, glowEdge[fig.tone]);
    ctx.save();
    ctx.globalAlpha = ctx.globalAlpha * breathe;
    ctx.fillStyle = g;
    ctx.fillRect(0, cy - radius, W, radius * 2);
    ctx.restore();

    ctx.fillStyle = tone(fig.tone);
    ctx.fillText(text, X, baseline);

    let y = baseline + 78;
    if (shown?.sub) {
      ctx.fillStyle = c.muted;
      ctx.font = `400 50px ${c.body}`;
      ctx.fillText(shown.sub, X, y);
      y += 74;
    }
    for (const note of scene.notes) {
      ctx.fillStyle = c.muted;
      ctx.font = `400 38px ${c.body}`;
      ctx.fillText(note, X, y);
      y += 58;
    }

    // The moment: a card that slides in after the figure has landed.
    const h = scene.highlight;
    if (h) {
      const k = easeOut((local - 1.9) / 0.55);
      if (k > 0) {
        const top = 1180;
        const hgt = 330;
        ctx.save();
        ctx.globalAlpha = ctx.globalAlpha * k;
        ctx.translate((1 - k) * 90, 0);
        ctx.fillStyle = c.card;
        ctx.fillRect(X, top, wide, hgt);
        ctx.strokeStyle = c.border;
        ctx.lineWidth = 2;
        ctx.strokeRect(X + 1, top + 1, wide - 2, hgt - 2);
        ctx.fillStyle = tone(h.tone);
        ctx.fillRect(X, top, 10, hgt);
        ctx.fillStyle = c.muted;
        ctx.font = `400 38px ${c.body}`;
        ctx.fillText(h.title, X + 56, top + 76);
        // The coin's picture at the right of the card, in a box (its first letter if there is none); the ticker takes the room beside it, and the detail below
        // runs the full width of the card.
        const logo = 150;
        const lx = X + wide - 56 - logo;
        const ly = top + 44;
        const pic = h.image ? images.get(h.image) : undefined;
        ctx.fillStyle = c.bg;
        ctx.fillRect(lx, ly, logo, logo);
        if (pic) ctx.drawImage(pic, lx, ly, logo, logo);
        else {
          ctx.fillStyle = c.muted;
          ctx.font = `700 76px ${c.head}`;
          ctx.textAlign = "center";
          ctx.fillText(h.ticker.charAt(0).toUpperCase(), lx + logo / 2, ly + logo / 2 + 26);
          ctx.textAlign = "left";
        }
        ctx.strokeStyle = c.hatch;
        ctx.lineWidth = 3;
        ctx.strokeRect(lx, ly, logo, logo);

        ctx.fillStyle = c.fg;
        const ts = fitText(ctx, h.ticker, c.head, 110, 56, wide - 112 - logo - 28);
        ctx.fillText(h.ticker, X + 56, top + 76 + 28 + ts * 0.8);
        ctx.fillStyle = tone(h.tone);
        ctx.font = `500 42px ${c.body}`;
        // A long line (a roundtrip's peak and end) is cut to the card rather than running off it.
        let detail = h.detail;
        while (detail.length > 8 && ctx.measureText(detail).width > wide - 112) detail = detail.slice(0, -2);
        ctx.fillText(detail === h.detail ? detail : `${detail.trimEnd()}…`, X + 56, top + hgt - 44);
        ctx.restore();
      }
    }
  }

  return { duration: total, draw };
}

/** The video file's name: the wallet's ends and the day, and -private when something is masked or hidden. */
export function recapVideoFileName(r: { wallet: string; scannedAt: number }, hide: CardHide, ext: string): string {
  const day = new Date(r.scannedAt * 1000).toISOString().slice(0, 10);
  const any = [hide.pnl, hide.roundtrip, hide.fumble, hide.volume].some((m) => m === "mask" || m === "hide") || hide.wallet;
  const who = hide.wallet ? "" : `${r.wallet.slice(0, 4)}-${r.wallet.slice(-4)}-`;
  return `replay-recap-${who}${day}${any ? "-private" : ""}.${ext}`.toLowerCase();
}

/**
 * Plays the recap onto `canvas` (which the caller may be showing, so the visitor can watch it being made) and records it. It runs in real time, so it
 * takes as long as the video is, and the tab has to stay open. Resolves with the file; rejects if cancelled or if the browser cannot record.
 */
export async function recordRecapVideo(
  canvas: HTMLCanvasElement,
  scan: { result: ApiResult; now: number; display: Display; hide: CardHide },
  o: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {},
): Promise<{ blob: Blob; ext: string; seconds: number }> {
  const format = pickVideoFormat();
  if (!format) throw new Error("This browser can't record video. Try Chrome, Edge or Firefox.");
  const palette = await canvasTheme();
  const scenes = planRecapVideo(scan.result, scan.now, scan.display, scan.hide);
  // The coins' pictures are loaded first (together, each given a few seconds), so a logo is there from the moment its card slides in.
  const urls = [...new Set(scenes.flatMap((sc) => (sc.highlight?.image ? [sc.highlight.image] : [])))];
  const loaded = await Promise.all(urls.map(async (u) => [u, await loadCoinImage(u)] as const));
  const images = new Map<string, HTMLImageElement>();
  for (const [u, img] of loaded) if (img) images.set(u, img);
  if (o.signal?.aborted) throw new Error("Cancelled");
  const painter = createRecapPainter(palette, scenes, scan.display, images);
  canvas.width = VIDEO_W;
  canvas.height = VIDEO_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't start the recording.");

  const stream = canvas.captureStream(FPS);
  const recorder = new MediaRecorder(stream, { mimeType: format.mime, videoBitsPerSecond: 8_000_000 });
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
      resolve({ blob: new Blob(chunks, { type: format.mime.split(";")[0] }), ext: format.ext, seconds: painter.duration });
    };
    recorder.onerror = () => stop(new Error("The recording failed."));
    if (o.signal?.aborted) return reject(new Error("Cancelled"));
    o.signal?.addEventListener("abort", () => stop(new Error("Cancelled")));

    recorder.start(250);
    const t0 = performance.now();
    const tick = (now: number) => {
      const s = (now - t0) / 1000;
      painter.draw(ctx, s);
      o.onProgress?.(Math.min(1, s / painter.duration));
      if (s >= painter.duration) return stop();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  });
}
