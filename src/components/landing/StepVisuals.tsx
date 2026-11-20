import { Search } from "lucide-react";

/**
 * Three small pictures for the "how it works" cards, each showing its step happening: a search box typing a name, a switch
 * between one buy and monthly buys with the buys lighting up, and a result line drawing itself. They are plain markup and CSS
 * (no script), loop slowly, and stand still, fully drawn, for people who prefer reduced motion.
 */

const panel = "relative flex h-24 flex-col justify-center gap-3 overflow-hidden border border-border bg-background/50 px-4";

/** Step 1: a search box that types "Bitcoin", then the start month it will use. */
function PickVisual() {
  return (
    <div className={panel} aria-hidden>
      <div className="flex h-9 items-center gap-2 border border-input px-3 text-sm">
        <Search className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="step-type overflow-hidden whitespace-nowrap text-foreground">Bitcoin</span>
        <span className="step-caret -ml-1 h-4 w-px bg-primary" />
      </div>
      <div className="flex gap-2 text-[11px] text-muted-foreground">
        <span className="step-chip border border-border px-2 py-0.5">Crypto</span>
        <span className="step-chip border border-primary/60 px-2 py-0.5 text-primary" style={{ animationDelay: "0.35s" }}>
          Jan 2020
        </span>
      </div>
    </div>
  );
}

/** Step 2: the switch moves from one buy to monthly, and the buy marks light up one by one. */
function BuyVisual() {
  return (
    <div className={panel} aria-hidden>
      <div className="relative flex h-8 w-44 border border-input text-[11px]">
        <span className="step-seg absolute inset-y-0 left-0 w-1/2 bg-primary/90" />
        <span className="relative z-10 grid flex-1 place-items-center font-bold text-primary-foreground step-label-a">Once</span>
        <span className="relative z-10 grid flex-1 place-items-center font-bold text-muted-foreground step-label-b">Monthly</span>
      </div>
      <div className="flex gap-1.5">
        {Array.from({ length: 12 }, (_, i) => (
          <span key={i} className={i === 0 ? "h-2 w-2.5 bg-primary" : "step-bar h-2 w-2.5 bg-primary"} style={{ animationDelay: `${i * 0.06}s` }} />
        ))}
      </div>
    </div>
  );
}

/** Step 3: a worth line pulling away from the dashed money-in line, with its end value tagged. */
function ReadVisual() {
  return (
    <div className={panel} aria-hidden>
      <svg viewBox="0 0 200 56" className="h-full w-full" preserveAspectRatio="none" fill="none">
        <path d="M4 50 L196 24" stroke="var(--muted-foreground)" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
        <path className="step-draw" pathLength="1" d="M4 50 L22 46 L38 48 L56 38 L72 42 L90 30 L108 36 L126 22 L144 28 L162 14 L180 18 L194 8" stroke="var(--primary)" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="step-tag absolute top-3 right-3 bg-primary px-1.5 py-0.5 text-[11px] font-bold text-primary-foreground">Worth today</span>
    </div>
  );
}

export function StepVisual({ step }: { step: "1" | "2" | "3" }) {
  return step === "1" ? <PickVisual /> : step === "2" ? <BuyVisual /> : <ReadVisual />;
}
