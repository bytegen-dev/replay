import type { DemoCheck } from "./landingData.ts";

/**
 * The picture shown when a link to Replay is shared (1200 x 630), built to match the landing page's hero: the headline and the mint
 * line on the left, the result card on the right. The card is drawn from the same saved results as the page, so the numbers in a
 * link preview are the numbers on the site. Everything is plain shapes and the built-in font (the image renderer takes no CSS
 * beyond the basics, so the slanted corners are drawn as a polygon).
 */

export const OG_SIZE = { width: 1200, height: 630 };

const C = { bg: "#071013", card: "#071215", border: "#25414a", mint: "#39d6a3", text: "#f3f8f8", muted: "#8ea4ad", loss: "#fb7185" };

export type OgCard =
  | { kind: "chart"; check: DemoCheck }
  | { kind: "lookup"; caption: string; price: string; lines: string[] };

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const monthYear = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

/** The card's outline: a rectangle with the top-right and bottom-left corners cut. */
function Frame({ w, h, cut = 30 }: { w: number; h: number; cut?: number }) {
  const pts = `0,0 ${w - cut},0 ${w},${cut} ${w},${h} ${cut},${h} 0,${h - cut}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ position: "absolute", top: 0, left: 0 }}>
      <polygon points={pts} fill={C.card} stroke={C.border} strokeWidth="2" />
    </svg>
  );
}

function Chart({ check, w, h }: { check: DemoCheck; w: number; h: number }) {
  const pts = check.points;
  const x0 = pts[0].t;
  const x1 = pts[pts.length - 1].t;
  const top = Math.max(...pts.map((p) => Math.max(p.value, p.invested))) * 1.05;
  const X = (t: number) => ((t - x0) / (x1 - x0)) * w;
  const Y = (v: number) => h - (v / top) * h;
  const line = pts.map((p, i) => `${i ? "L" : "M"}${X(p.t).toFixed(1)} ${Y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${w} ${h} L0 ${h} Z`;
  const invested = pts.map((p, i) => `${i ? "L" : "M"}${X(p.t).toFixed(1)} ${Y(p.invested).toFixed(1)}`).join(" ");
  const colour = check.gainPct >= 0 ? C.mint : C.loss;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1="0" x2={w} y1={h * f} y2={h * f} stroke={C.border} strokeWidth="1" opacity="0.5" />
      ))}
      <path d={area} fill={colour} fillOpacity="0.14" />
      <path d={invested} fill="none" stroke={C.muted} strokeWidth="2" strokeDasharray="7 6" />
      <path d={line} fill="none" stroke={colour} strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function OgBanner({ headline, sub, body, card, footer }: { headline: string[]; sub: string; body: string; card: OgCard; footer?: string }) {
  const CARD_W = 520;
  const CARD_H = 470;
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", background: C.bg, padding: "58px 64px", position: "relative", color: C.text }}>
      {/* The glow in the corner, as on the site. */}
      <div style={{ position: "absolute", top: 0, right: 0, width: 760, height: 520, background: "radial-gradient(circle at 100% 0%, rgba(57,214,163,0.17), rgba(57,214,163,0) 70%)" }} />

      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 540, position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <svg width="30" height="34" viewBox="0 0 40 46">
            <polygon points="2,2 38,23 2,44" fill={C.mint} />
          </svg>
          <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: -1 }}>Replay</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 70, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2.5 }}>
            {headline.map((l) => (
              <div key={l} style={{ display: "flex" }}>
                {l}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 28, color: C.mint, lineHeight: 1.25 }}>{sub}</div>
          <div style={{ fontSize: 21, color: C.muted, lineHeight: 1.45 }}>{body}</div>
        </div>

        <div style={{ display: "flex" }}>
          <div style={{ display: "flex", background: C.mint, color: "#03090b", fontSize: 24, fontWeight: 700, padding: "15px 34px" }}>Join the waitlist</div>
        </div>
      </div>

      <div style={{ display: "flex", position: "absolute", top: 80, right: 64, width: CARD_W, height: CARD_H }}>
        <Frame w={CARD_W} h={CARD_H} />
        {card.kind === "chart" ? (
          <div style={{ display: "flex", flexDirection: "column", position: "relative", padding: "34px 36px", width: CARD_W, height: CARD_H }}>
            <div style={{ display: "flex", fontSize: 19, color: C.muted }}>{`${card.check.buying} into ${card.check.name} ${card.check.timing}`}</div>
            <div style={{ display: "flex", fontSize: 66, fontWeight: 700, letterSpacing: -2, color: card.check.gainPct >= 0 ? C.mint : C.loss, marginTop: 6 }}>{usd(card.check.value)}</div>
            <div style={{ display: "flex", fontSize: 19, color: C.muted, marginBottom: 20 }}>{`worth today, from ${usd(card.check.invested)} put in (${card.check.gainPct >= 0 ? "+" : "-"}${Math.abs(card.check.gainPct).toFixed(0)}%)`}</div>
            <Chart check={card.check} w={CARD_W - 72} h={190} />
            <div style={{ display: "flex", fontSize: 16, color: C.muted, marginTop: "auto" }}>{footer ?? `Last updated ${monthYear(card.check.asOf)}`}</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", position: "relative", padding: "40px 40px", width: CARD_W, height: CARD_H }}>
            <div style={{ display: "flex", fontSize: 22, color: C.muted }}>{card.caption}</div>
            <div style={{ display: "flex", fontSize: 92, fontWeight: 700, letterSpacing: -3, color: C.mint, marginTop: 10 }}>{card.price}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 24 }}>
              {card.lines.map((l) => (
                <div key={l} style={{ display: "flex", fontSize: 24, color: C.text }}>
                  {l}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", fontSize: 16, color: C.muted, marginTop: "auto" }}>{footer ?? "A real lookup"}</div>
          </div>
        )}
      </div>
    </div>
  );
}
