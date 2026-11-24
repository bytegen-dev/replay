import { drawHatch } from "../canvasHatch.ts";
import { canvasTheme } from "../replayVideo.ts";
import { coinMoney, compactAmount, type CoinRow } from "./coins.ts";
import { loadCoinImage } from "./coinImage.ts";
import type { Display } from "./money.ts";
import { reachSpan } from "./view.ts";

/**
 * One trade (one coin) as a picture to share (PNG, 1200 by 630 drawn at twice the size): the coin, the PnL as the headline, and what was bought and
 * sold, the average entry and exit, and what is left. The wallet address is not on it. Drawn on a canvas in the site's colours.
 */

const W = 1200;
const H = 630;

/** replay-trade-pepe-2026-11-23.png */
export function tradeCardFileName(ticker: string, at: number): string {
  const day = new Date(at * 1000).toISOString().slice(0, 10);
  const name = ticker.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "coin";
  return `replay-trade-${name}-${day}.png`;
}

export async function renderTradeCard(coin: CoinRow, ticker: string, display: Display, now: number, image?: string, opts: { hidePnl?: boolean } = {}): Promise<Blob> {
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
  drawHatch(ctx, W, c.hatch, 2);

  const m = coinMoney(coin, display);

  // Header: the coin's picture (or its first letter in a box), its name, and how long ago it was traded.
  const icon = 68;
  const pic = image ? await loadCoinImage(image) : null;
  ctx.fillStyle = c.card ?? c.bg;
  ctx.fillRect(64, 46, icon, icon);
  if (pic) {
    ctx.drawImage(pic, 64, 46, icon, icon);
  } else {
    ctx.fillStyle = c.muted;
    ctx.font = `700 34px ${c.head}`;
    ctx.textAlign = "center";
    ctx.fillText(ticker.charAt(0).toUpperCase(), 64 + icon / 2, 46 + icon / 2 + 12);
    ctx.textAlign = "left";
  }
  ctx.strokeStyle = c.hatch;
  ctx.lineWidth = 2;
  ctx.strokeRect(64, 46, icon, icon);
  ctx.fillStyle = c.fg;
  ctx.font = `600 52px ${c.head}`;
  ctx.fillText(ticker, 64 + icon + 22, 96);
  ctx.fillStyle = c.muted;
  ctx.font = `400 22px ${c.body}`;
  ctx.fillText(`Traded over ${reachSpan(coin.firstAt, now).label}`, 64 + icon + 22, 134);

  // The PnL, big, and its percent.
  ctx.fillStyle = c.muted;
  ctx.font = `400 26px ${c.body}`;
  ctx.fillText("PnL", 64, 214);
  const gain = (coin.profitSol ?? 0) >= 0;
  // A hidden PnL is *** (a figure only; "Cost unknown" says nothing about the amount), with no percent or second line.
  const hidePnl = opts.hidePnl === true && !!m.profit;
  const main = hidePnl ? "***" : m.profit ? m.profit.main : coin.costUnknown ? "Cost unknown" : "—";
  let size = 112;
  ctx.font = `700 ${size}px ${c.head}`;
  while (size > 48 && ctx.measureText(main).width > W - 128 - 260) {
    size -= 4;
    ctx.font = `700 ${size}px ${c.head}`;
  }
  ctx.fillStyle = hidePnl ? c.muted : m.profit ? (gain ? c.primary : c.down) : c.muted;
  ctx.fillText(main, 64, 214 + 20 + size * 0.78);
  const baseline = 214 + 20 + size * 0.78;
  if (!hidePnl && m.profit && coin.profitPct !== null) {
    ctx.font = `600 44px ${c.head}`;
    const pct = `${coin.profitPct >= 0 ? "+" : "-"}${Math.abs(coin.profitPct * 100).toFixed(1)}%`;
    ctx.font = `700 ${size}px ${c.head}`;
    const x = 64 + ctx.measureText(main).width + 32;
    ctx.font = `600 44px ${c.head}`;
    ctx.fillText(pct, x, baseline);
  }
  if (!hidePnl && m.profit?.sub) {
    ctx.fillStyle = c.muted;
    ctx.font = `400 28px ${c.body}`;
    ctx.fillText(m.profit.sub, 64, baseline + 42);
  }

  ctx.strokeStyle = c.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(64, 392);
  ctx.lineTo(W - 64, 392);
  ctx.stroke();

  // What was bought and sold, the averages, and what is left.
  const cols = [
    { label: "Bought", value: m.bought, sub: `${compactAmount(coin.boughtTokens)} ${ticker}` },
    { label: "Sold", value: coin.soldTokens > 0 ? m.sold : "—", sub: coin.soldTokens > 0 ? `${compactAmount(coin.soldTokens)} ${ticker}` : "" },
    { label: "Avg entry", value: m.entry, sub: "" },
    { label: "Avg exit", value: coin.soldTokens > 0 ? m.exit : "—", sub: "" },
  ];
  const colW = (W - 128) / cols.length;
  cols.forEach((col, i) => {
    const x = 64 + i * colW;
    ctx.fillStyle = c.muted;
    ctx.font = `400 22px ${c.body}`;
    ctx.fillText(col.label, x, 438);
    let small = 40;
    ctx.font = `700 ${small}px ${c.head}`;
    while (small > 24 && ctx.measureText(col.value).width > colW - 20) {
      small -= 2;
      ctx.font = `700 ${small}px ${c.head}`;
    }
    ctx.fillStyle = c.fg;
    ctx.fillText(col.value, x, 484);
    if (col.sub) {
      ctx.fillStyle = c.muted;
      ctx.font = `400 20px ${c.body}`;
      ctx.fillText(col.sub, x, 516);
    }
  });
  ctx.fillStyle = c.muted;
  ctx.font = `400 22px ${c.body}`;
  ctx.fillText(coin.balance > 0 ? `Still holding ${compactAmount(coin.balance)} ${ticker}` : "Sold all", 64, 552);

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
