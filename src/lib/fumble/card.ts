import { drawHatch } from "../canvasHatch.ts";
import { canvasTheme } from "../replayVideo.ts";
import type { ApiResult } from "./service.ts";
import { RECAP_NAME } from "../recapName.ts";
import { bestTrade } from "./highlights.ts";
import type { HideMode } from "./settings.ts";
import { figure, type Display } from "./money.ts";
import { countTrades, coverageNote, figureCoverage, NOT_THERE, reachSpan, shortMint, tokenLabel, tradeVolume } from "./view.ts";

/**
 * The scan as a picture to share (PNG, 1200 by 630 drawn at twice the size): the PnL as the headline, what was roundtripped, fumbled and traded under it, how many
 * trades and how far back they reach, and the biggest single fumble. Drawn on a canvas in the site's colours, so it needs nothing from the server.
 * The PnL, the fumble figures and the wallet address can each be hidden on their own, so someone can show what they missed and keep what they made.
 */

const W = 1200;
const H = 630;

// Where the rows sit from the top. Each has room for the one above: the headline, a line, the three figures with a note under each, then the best trade, a clear
// gap above the footer bar (which starts at H - 64).
const HERO_TOP = 176;
const DIVIDER_Y = 350;
const BEST_Y = 520;

/**
 * What the card does with each number: "show" it, draw it as *** ("mask"), or leave it out and close the gap ("hide"). The PnL also covers the best trade,
 * which is part of it. The wallet address can be shown or drawn as ***; there is nothing to leave out there.
 */
export interface CardHide {
  pnl?: HideMode;
  roundtrip?: HideMode;
  fumble?: HideMode;
  volume?: HideMode;
  wallet?: boolean;
}

/** replay-recap-card-9msk-xhzj-2026-11-23.png; with the wallet address hidden the address is left out of the name too, and anything masked or hidden adds -private. */
export function fumbleCardFileName(r: { wallet: string; scannedAt: number }, hide: CardHide = {}): string {
  const day = new Date(r.scannedAt * 1000).toISOString().slice(0, 10);
  const any = [hide.pnl, hide.roundtrip, hide.fumble, hide.volume].some((m) => m === "mask" || m === "hide") || hide.wallet;
  const who = hide.wallet ? "" : `${r.wallet.slice(0, 4)}-${r.wallet.slice(-4)}-`;
  return `replay-recap-card-${who}${day}${any ? "-private" : ""}.png`.toLowerCase();
}

export async function renderFumbleCard(r: ApiResult, now: number, display: Display, opts: { hide?: CardHide } = {}): Promise<Blob> {
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
  ctx.fillText(RECAP_NAME, 64, 86);
  ctx.fillStyle = c.muted;
  ctx.font = `400 22px ${c.body}`;
  const hide = opts.hide ?? {};
  const who = hide.wallet ? "***" : shortMint(r.wallet);
  ctx.fillText(who, 64, 124);

  // How much was looked at: the trades, and how far back they reach.
  const reach = r.coverage.oldest ? `, over ${reachSpan(r.coverage.oldest, now).label}` : "";
  ctx.fillStyle = c.muted;
  const sellCount = r.trades.filter((t) => t.side === "sell").length;
  const buyCount = r.trades.length - sellCount;
  const tradeTotal = countTrades(r.trades);
  ctx.fillText(`${r.coverage.complete ? "All" : "Latest"} ${tradeTotal} ${tradeTotal === 1 ? "trade" : "trades"}, ${buyCount} ${buyCount === 1 ? "buy" : "buys"} and ${sellCount} ${sellCount === 1 ? "sell" : "sells"}${reach}`, 64 + ctx.measureText(who).width + 28, 124);

  // The headline: the PnL, big, green when it is a profit and red when it is a loss. Under it, the other numbers, smaller. A figure with nothing behind
  // it because nothing was sold reads zero, which is true. A figure that could not be worked out says so in words (a zero would be false), and one that
  // was only partly worked out shows what was, with how much in a small note under it (a picture has no tooltip). Each figure leads with the chosen
  // currency (SOL unless the visitor picked another) and has the other under it. A masked figure is drawn as ***, with its sign and colour; a hidden one is not drawn, and what is
  // left moves up to fill the space.
  const known = (u: number, s: number) => (u === 0 && s !== 0 ? null : u);
  const mode = (m: HideMode | undefined): HideMode => m ?? "show";
  const showHero = mode(hide.pnl) !== "hide";
  const pnlMasked = mode(hide.pnl) === "mask";
  const pnl = figure(display, r.totalProfitSol, known(r.totalProfitUsd, r.totalProfitSol), true);
  const cover = figureCoverage(r);
  if (showHero) {
    ctx.fillStyle = c.muted;
    ctx.font = `400 26px ${c.body}`;
    ctx.fillText("PnL", 64, HERO_TOP);
    let size = 112;
    const pnlMissing = !pnlMasked && cover.pnl.kind === "none";
    const heroText = pnlMasked ? "***" : pnlMissing ? NOT_THERE.pnl : pnl.main;
    ctx.font = `700 ${size}px ${c.head}`;
    while (size > 48 && ctx.measureText(heroText).width > W - 128) {
      size -= 4;
      ctx.font = `700 ${size}px ${c.head}`;
    }
    ctx.fillStyle = pnlMasked || pnlMissing ? c.muted : r.totalProfitSol > 0 ? c.primary : r.totalProfitSol < 0 ? c.down : c.fg;
    ctx.fillText(heroText, 64, HERO_TOP + 24 + size * 0.78);
    // Under it: the other currency, and for a figure only partly worked out, how much was (or for one that could not be, why).
    const pnlNote = pnlMasked ? null : coverageNote(cover.pnl, "pnl");
    const under = [pnlMissing ? null : pnlMasked ? null : pnl.sub, pnlNote].filter(Boolean).join(", ");
    if (under) {
      ctx.fillStyle = c.muted;
      ctx.font = `400 28px ${c.body}`;
      ctx.fillText(under, 64, HERO_TOP + 24 + size * 0.78 + 40);
    }
  }

  const volume = tradeVolume(r.trades, r.coins);
  const all = [
    { label: "Roundtripped", value: r.totalRoundTripSol, cover: cover.roundtrip, fig: figure(display, r.totalRoundTripSol, known(r.totalRoundTripUsd, r.totalRoundTripSol)), kind: "roundtrip" as const },
    { label: "Fumble", value: r.totalFumbleSol, cover: cover.fumble, fig: figure(display, r.totalFumbleSol, known(r.totalFumbleUsd, r.totalFumbleSol)), kind: "fumble" as const },
    { label: "Total volume", value: volume.sol, cover: { kind: "full" } as const, fig: figure(display, volume.sol, volume.usd), kind: "volume" as const },
  ];
  const cols = all.filter((col) => mode(hide[col.kind]) !== "hide");
  // With the headline there is a line, and the numbers sit below it; without it they move up and are drawn larger, since they are all there is.
  const labelY = showHero ? 392 : 250;
  const valueY = showHero ? 444 : 250 + 30 + 88 * 0.78;
  const biggest = showHero ? 44 : 88;
  if (showHero && cols.length > 0) {
    ctx.strokeStyle = c.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(64, DIVIDER_Y);
    ctx.lineTo(W - 64, DIVIDER_Y);
    ctx.stroke();
  }
  const colW = (W - 128) / Math.max(cols.length, 1);
  cols.forEach((col, i) => {
    const x = 64 + i * colW;
    const masked = mode(hide[col.kind]) === "mask";
    ctx.fillStyle = c.muted;
    ctx.font = `400 ${showHero ? 22 : 26}px ${c.body}`;
    ctx.fillText(col.label, x, labelY);
    const missing = !masked && col.cover.kind === "none" && col.kind !== "volume";
    const main = masked ? "***" : missing ? NOT_THERE[col.kind as "roundtrip" | "fumble"] : col.fig.main;
    let small = biggest;
    ctx.font = `700 ${small}px ${c.head}`;
    while (small > 26 && ctx.measureText(main).width > colW - 24) {
      small -= 2;
      ctx.font = `700 ${small}px ${c.head}`;
    }
    ctx.fillStyle = masked || missing ? c.muted : col.kind === "fumble" && col.value > 0 ? c.down : c.fg;
    ctx.fillText(main, x, valueY);
    // Only a partial figure gets a note: for one that is not there the word already says it, and the long sentence would run into the next column.
    const colNote = masked || col.kind === "volume" || col.cover.kind !== "partial" ? null : coverageNote(col.cover, col.kind);
    if (colNote) {
      ctx.fillStyle = c.muted;
      ctx.font = `400 ${showHero ? 20 : 24}px ${c.body}`;
      ctx.fillText(colNote, x, valueY + (showHero ? 32 : 38));
    }
  });

  // The best trade, in a line: the coin and what it made. Part of the PnL: masked with it, and left out when the PnL is.
  if (showHero) {
    const lineY = cols.length > 0 ? BEST_Y : 400;
    const best = bestTrade(r);
    ctx.font = `400 24px ${c.body}`;
    if (best) {
      const name = tokenLabel(best.token, r.tokens).ticker;
      const lead = "Best trade  ";
      ctx.fillStyle = c.muted;
      ctx.fillText(lead, 64, lineY);
      let x = 64 + ctx.measureText(lead).width;
      ctx.fillStyle = c.fg;
      ctx.font = `700 28px ${c.head}`;
      ctx.fillText(name, x, lineY);
      x += ctx.measureText(name).width;
      ctx.font = `700 28px ${c.head}`;
      ctx.fillStyle = pnlMasked ? c.muted : c.primary;
      ctx.fillText(`  ${pnlMasked ? "***" : figure(display, best.profitSol, best.profitUsd === 0 ? null : best.profitUsd, true).main}`, x, lineY);
    } else {
      ctx.fillStyle = c.muted;
      ctx.fillText("No winning trade yet.", 64, lineY);
    }
  } else if (cols.length === 0) {
    ctx.fillStyle = c.muted;
    ctx.font = `400 26px ${c.body}`;
    ctx.fillText("Everything is hidden.", 64, 300);
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
