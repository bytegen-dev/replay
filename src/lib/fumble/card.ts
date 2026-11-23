import { drawHatch } from "../canvasHatch.ts";
import { canvasTheme } from "../replayVideo.ts";
import type { ApiResult } from "./service.ts";
import { figure, type Display } from "./money.ts";
import { reachLabel, shortMint, tokenLabel } from "./view.ts";

/**
 * The scan as a picture to share (PNG, 1200 by 630 drawn at twice the size): the total fumble as the headline, the numbers it comes from, how many
 * trades and how far back they reach, and the biggest single fumble. Drawn on a canvas in the site's colours, so it needs nothing from the server.
 */

const W = 1200;
const H = 630;

/** replay-fumble-card-9msk-xhzj-2026-11-23.png */
export function fumbleCardFileName(r: { wallet: string; scannedAt: number }, privacy = false): string {
  const day = new Date(r.scannedAt * 1000).toISOString().slice(0, 10);
  if (privacy) return `replay-fumble-card-${day}-private.png`;
  return `replay-fumble-card-${r.wallet.slice(0, 4)}-${r.wallet.slice(-4)}-${day}.png`.toLowerCase();
}

/** The biggest fumble that was measured, or null when none was. */
export function worstFumble(r: ApiResult) {
  let best: ApiResult["sells"][number] | null = null;
  for (const s of r.sells) if (s.status === "ok" && (s.fumbleUsd ?? 0) > (best?.fumbleUsd ?? 0)) best = s;
  return best;
}

export async function renderFumbleCard(r: ApiResult, now: number, display: Display, opts: { privacy?: boolean } = {}): Promise<Blob> {
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
  const who = opts.privacy ? "***" : shortMint(r.wallet);
  ctx.fillText(who, 64, 124);

  // How much was looked at: the trades, and how far back they reach.
  const reach = r.coverage.oldest ? `, from ${reachLabel(r.coverage.oldest, now)}` : "";
  ctx.fillStyle = c.muted;
  ctx.fillText(`${r.coverage.complete ? "All" : "Latest"} ${r.trades.length} trades${reach}`, 64 + ctx.measureText(who).width + 28, 124);

  // The headline: the total fumble, big. Under it, the three numbers it comes from, smaller. A figure with nothing behind it (no priced sell or
  // position, no sell traced to its buys) is a dash, not a made-up zero. Each figure leads with the chosen currency (SOL unless the visitor
  // picked another) and has the other under it. In privacy mode the PnL and the wallet address are drawn as ***.
  const traced = r.sells.some((x) => x.matchedTokens > 0);
  const known = (u: number, s: number) => (u === 0 && s !== 0 ? null : u);
  const measured = r.sells.some((x) => x.status === "ok") || r.positions.some((p) => p.status === "ok");
  const total = figure(display, r.totalMissedSol, known(r.totalMissedUsd, r.totalMissedSol));
  ctx.fillStyle = c.muted;
  ctx.font = `400 26px ${c.body}`;
  ctx.fillText("Total fumble", 64, 190);
  let size = 120;
  const heroText = measured ? total.main : "\u2014";
  ctx.font = `700 ${size}px ${c.head}`;
  while (size > 48 && ctx.measureText(heroText).width > W - 128) {
    size -= 4;
    ctx.font = `700 ${size}px ${c.head}`;
  }
  ctx.fillStyle = measured ? c.down : c.muted;
  ctx.fillText(heroText, 64, 190 + 24 + size * 0.78);
  if (measured && total.sub) {
    ctx.fillStyle = c.muted;
    ctx.font = `400 28px ${c.body}`;
    ctx.fillText(total.sub, 64, 190 + 24 + size * 0.78 + 42);
  }

  ctx.strokeStyle = c.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(64, 372);
  ctx.lineTo(W - 64, 372);
  ctx.stroke();

  const cols = [
    { label: "Missed after selling", fig: figure(display, r.totalFumbleSol, known(r.totalFumbleUsd, r.totalFumbleSol)), none: !r.sells.some((x) => x.status === "ok"), pnl: false },
    { label: "Roundtripped", fig: figure(display, r.totalRoundTripSol, known(r.totalRoundTripUsd, r.totalRoundTripSol)), none: !r.positions.some((p) => p.status === "ok"), pnl: false },
    { label: "PnL", fig: figure(display, r.totalProfitSol, known(r.totalProfitUsd, r.totalProfitSol), true), none: !traced, pnl: true },
  ];
  const colW = (W - 128) / cols.length;
  cols.forEach((col, i) => {
    const x = 64 + i * colW;
    const masked = opts.privacy === true && col.pnl;
    ctx.fillStyle = c.muted;
    ctx.font = `400 22px ${c.body}`;
    ctx.fillText(col.label, x, 420);
    const main = masked ? "***" : col.none ? "\u2014" : col.fig.main;
    let small = 44;
    ctx.font = `700 ${small}px ${c.head}`;
    while (small > 26 && ctx.measureText(main).width > colW - 24) {
      small -= 2;
      ctx.font = `700 ${small}px ${c.head}`;
    }
    ctx.fillStyle = masked || col.none ? c.muted : col.pnl ? (r.totalProfitSol >= 0 ? c.primary : c.down) : c.fg;
    ctx.fillText(main, x, 474);
  });

  // The worst single fumble, in a line: the coin, and how high it went after the sale.
  const worst = worstFumble(r);
  ctx.font = `400 24px ${c.body}`;
  if (worst) {
    const name = tokenLabel(worst.token, r.tokens).ticker;
    const lead = "Biggest fumble  ";
    ctx.fillStyle = c.muted;
    ctx.fillText(lead, 64, 530);
    let x = 64 + ctx.measureText(lead).width;
    ctx.fillStyle = c.fg;
    ctx.font = `700 28px ${c.head}`;
    ctx.fillText(name, x, 530);
    x += ctx.measureText(name).width;
    ctx.fillStyle = c.muted;
    ctx.font = `400 24px ${c.body}`;
    ctx.fillText(`  sold, then ${(worst.peakMultiple ?? 1).toFixed(1)}x higher`, x, 530);
  } else {
    ctx.fillStyle = c.muted;
    ctx.fillText("No sell with a measurable fumble yet.", 64, 530);
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
