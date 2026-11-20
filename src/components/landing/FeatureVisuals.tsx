/**
 * One small moving picture for each of the four tools, so the section shows what they do instead of listing it. Plain
 * markup and CSS (no script): each loops on its own beat and, for people who prefer reduced motion, stands finished.
 */

const panel = "relative h-40 overflow-hidden border border-border bg-background/50 sm:h-44";
const grid = "pointer-events-none absolute inset-0 opacity-60 [background-image:linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] [background-size:32px_32px] [mask-image:linear-gradient(to_bottom,#000,transparent_90%)]";

/** Hindsight: the worth line draws away from the money put in, then the result lands. */
export function HindsightVisual() {
  return (
    <div className={panel} aria-hidden>
      <div className={grid} />
      <svg viewBox="0 0 400 160" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" fill="none">
        <path d="M8 146 L392 92" stroke="var(--muted-foreground)" strokeWidth="1" strokeDasharray="4 4" opacity="0.55" vectorEffect="non-scaling-stroke" />
        <path className="fx-area" d="M8 146 L40 138 L66 142 L98 120 L128 126 L160 100 L196 108 L232 78 L268 90 L304 56 L340 66 L392 26 L392 160 L8 160 Z" fill="var(--primary)" opacity="0.12" />
        <path className="fx-draw" pathLength="1" d="M8 146 L40 138 L66 142 L98 120 L128 126 L160 100 L196 108 L232 78 L268 90 L304 56 L340 66 L392 26" stroke="var(--primary)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="absolute bottom-3 left-3 text-[11px] text-muted-foreground">Put in</span>
      <span className="fx-pop absolute top-3 right-3 bg-primary px-2 py-1 text-xs font-bold text-primary-foreground">Worth today</span>
    </div>
  );
}

/** Wayback: a playhead scans along a price line and flags the price at three moments. */
export function WaybackVisual() {
  return (
    <div className={panel} aria-hidden>
      <div className={grid} />
      <svg viewBox="0 0 300 160" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" fill="none">
        <path d="M0 110 L24 96 L44 104 L70 70 L94 84 L120 52 L146 76 L172 58 L198 90 L224 66 L250 78 L276 44 L300 54" stroke="var(--primary)" strokeWidth="1.8" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="fx-scan absolute inset-y-0 w-px bg-primary/80" />
      <span className="fx-flag-1 absolute top-[14%] left-[20%] border border-primary/70 bg-card px-1.5 py-0.5 text-[11px] text-primary">$12.40</span>
      <span className="fx-flag-2 absolute top-[10%] left-[47%] border border-primary/70 bg-card px-1.5 py-0.5 text-[11px] text-primary">$48.10</span>
      <span className="fx-flag-3 absolute top-[8%] left-[76%] border border-primary/70 bg-card px-1.5 py-0.5 text-[11px] text-primary">$31.05</span>
    </div>
  );
}

/** Leverage: the price falls through the liquidation line and the position is closed. */
export function LeverageVisual() {
  return (
    <div className={panel} aria-hidden>
      <div className={grid} />
      <svg viewBox="0 0 300 160" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" fill="none">
        <path d="M0 120 H300" stroke="var(--destructive)" strokeWidth="1" strokeDasharray="5 4" opacity="0.8" vectorEffect="non-scaling-stroke" />
        <path className="fx-draw-fall" pathLength="1" d="M0 40 L30 36 L56 50 L84 44 L112 66 L140 62 L170 92 L198 84 L226 128 L252 140 L280 150" stroke="var(--primary)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="absolute top-3 left-3 flex gap-1.5 text-[11px]">
        <b className="bg-primary px-1.5 py-0.5 text-primary-foreground">Long</b>
        <b className="border border-border px-1.5 py-0.5 text-muted-foreground">25x</b>
      </span>
      <span className="fx-liq absolute right-3 bottom-[18%] bg-destructive px-2 py-1 text-xs font-bold text-white">Liquidated</span>
    </div>
  );
}

/** Share and build: a request types out, then the answer arrives. */
export function ShareVisual() {
  const line = (k: number) => ({ animationDelay: `${k * 0.9}s` });
  return (
    <div className={`${panel} flex flex-col justify-center gap-1.5 px-4 font-mono text-[11px] leading-5 sm:text-xs`} aria-hidden>
      <div className="fx-line text-muted-foreground" style={line(0)}>
        <span className="text-primary">GET</span> /api/v1/historical-price
      </div>
      <div className="fx-line text-muted-foreground" style={line(1)}>
        ?market=stock&amp;asset=AAPL&amp;date=14/03/2025
      </div>
      <div className="fx-line text-foreground" style={line(2.4)}>
        {"{"} &quot;price&quot;: 213.49, &quot;marketCap&quot;: &quot;$3.07T&quot; {"}"}
      </div>
      <div className="fx-line mt-1 flex items-center gap-2" style={line(3.6)}>
        <span className="border border-primary/70 px-2 py-0.5 text-primary">/r/Qx7aB2mP</span>
        <span className="text-muted-foreground">shared link</span>
      </div>
    </div>
  );
}
