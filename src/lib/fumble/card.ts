import { drawHatch } from "../canvasHatch.ts";
import { canvasTheme } from "../replayVideo.ts";
import type { ApiResult } from "./service.ts";
import { figure, type Display } from "./money.ts";
import { reachLabel, shortMint, tokenLabel } from "./view.ts";

/**
 * The scan as a picture to share (PNG, 1200 by 630 drawn at twice the size): the three headline numbers, how many trades and how far back they
 * reach, and the biggest single fumble. Drawn on a canvas in the site's colours, so it needs nothing from the server.
 */

const W = 1200;
const H = 630;

/** replay-fumble-card-9msk-xhzj-2026-11-23.png */
export function fumbleCardFileName(r: { wallet: string; scannedAt: number }): string {
  const day = new Date(r.scannedAt * 1000).toISOString().slice(0, 10);
  return `replay-fumble-card-${r.wallet.slice(0, 4)}-${r.wallet.slice(-4)}-${day}.png`.toLowerCase();
}

/** The biggest fumble that was measured, or null when none was. */
export function worstFumble(r: ApiResult) {
  let best: ApiResult["sells"][number] | null = null;
  for (const s of r.sells) if (s.status === "ok" && (s.fumbleUsd ?? 0) > (best?.fumbleUsd ?? 0)) best = s;
  return best;
}

export async function renderFumbleCard(r: ApiResult, now: number, display: Display): Promise<Blob> {
  const c = await canvasTheme();
  const canvas = document.createElement("canvas");
  canvas.width = W * 2;
  canvas.height = H * 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't make the picture.");
  ctx.scale(2, 2);
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, W, H);
  // The site's slanted lines in the top right corner. The logo is in the footer, once.
  drawHatch(ctx, W, c.hatch, 2);

  // Header: the name of the check and whose wallet it is, with the logo.
  ctx.fillStyle = c.fg;
  ctx.font = `600 40px ${c.head}`;
  ctx.fillText("Fumble check", 64, 86);
  ctx.fillStyle = c.muted;
  ctx.font = `400 22px ${c.body}`;
  ctx.fillText(shortMint(r.wallet), 64, 124);

  // How much was looked at: the trades, and how far back they reach.
  const reach = r.coverage.oldest ? `, from ${reachLabel(r.coverage.oldest, now)}` : "";
  ctx.fillStyle = c.muted;
  ctx.fillText(`${r.coverage.complete ? "All" : "Latest"} ${r.trades.length} trades${reach}`, 64 + ctx.measureText(shortMint(r.wallet)).width + 28, 124);

  // The three headline numbers.
  // A figure with nothing behind it (no sell traced to its buys, no closed position) is a dash, not a made-up zero. Each figure leads with the
  // chosen currency (SOL unless the visitor picked another) and has the other under it.
  const traced = r.sells.some((x) => x.matchedTokens > 0);
  const known = (u: number, s: number) => (u === 0 && s !== 0 ? null : u);
  const cols = [
    { label: "Profit", fig: figure(display, r.totalProfitSol, known(r.totalProfitUsd, r.totalProfitSol), true), none: !traced, tone: r.totalProfitSol },
    { label: "Fumbled", fig: figure(display, r.totalFumbleSol, known(r.totalFumbleUsd, r.totalFumbleSol)), none: false, tone: 0 },
    { label: "Roundtripped", fig: figure(display, r.totalRoundTripSol, known(r.totalRoundTripUsd, r.totalRoundTripSol)), none: !r.positions.some((p) => p.status === "ok"), tone: 0 },
  ];
  const colW = (W - 128) / 3;
  cols.forEach((col, i) => {
    const x = 64 + i * colW;
    ctx.fillStyle = c.muted;
    ctx.font = `400 24px ${c.body}`;
    ctx.fillText(col.label, x, 232);
    const main = col.none ? "\u2014" : col.fig.main;
    // The big figure shrinks until it fits its column.
    let size = 64;
    ctx.font = `700 ${size}px ${c.head}`;
    while (size > 30 && ctx.measureText(main).width > colW - 24) {
      size -= 2;
      ctx.font = `700 ${size}px ${c.head}`;
    }
    ctx.fillStyle = col.none ? c.muted : col.label === "Profit" ? (col.tone >= 0 ? c.primary : c.down) : c.fg;
    ctx.fillText(main, x, 308);
    if (!col.none && col.fig.sub) {
      ctx.fillStyle = c.muted;
      ctx.font = `400 24px ${c.body}`;
      ctx.fillText(col.fig.sub, x, 348);
    }
  });

  // The biggest single fumble, in a line.
  const worst = worstFumble(r);
  ctx.strokeStyle = c.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(64, 400);
  ctx.lineTo(W - 64, 400);
  ctx.stroke();
  if (worst) {
    const name = tokenLabel(worst.token, r.tokens).ticker;
    ctx.fillStyle = c.muted;
    ctx.font = `400 24px ${c.body}`;
    ctx.fillText("Biggest fumble", 64, 452);
    ctx.fillStyle = c.fg;
    ctx.font = `600 38px ${c.head}`;
    ctx.fillText(name, 64, 502);
    ctx.fillStyle = c.muted;
    ctx.font = `400 26px ${c.body}`;
    const sold = figure(display, worst.soldSol, worst.soldUsd ?? null).main;
    const left = figure(display, worst.fumbleSol ?? 0, worst.fumbleUsd ?? null).main;
    ctx.fillText(`Sold for ${sold}, then reached ${(worst.peakMultiple ?? 1).toFixed(1)}x: ${left} left on the table`, 64, 546);
  } else {
    ctx.fillStyle = c.muted;
    ctx.font = `400 26px ${c.body}`;
    ctx.fillText("No sell with a measurable fumble yet.", 64, 452);
  }

  // Footer: the mark and the name.
  ctx.fillStyle = c.card;
  ctx.fillRect(0, H - 64, W, 64);
  if (c.mark) ctx.drawImage(c.mark, 64, H - 52, 40, 40);
  ctx.fillStyle = c.fg;
  ctx.font = `600 26px ${c.head}`;
  ctx.fillText("Replay", c.mark ? 118 : 64, H - 23);
  ctx.fillStyle = c.muted;
  ctx.font = `400 20px ${c.body}`;
  ctx.textAlign = "right";
  ctx.fillText("A time machine for your money", W - 64, H - 24);
  ctx.textAlign = "left";

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't make the picture."))), "image/png"));
}
