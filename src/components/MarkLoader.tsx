import { cn } from "@/lib/utils";

/** The outline of the Replay mark (the same path as the logo). */
const OUTLINE = "M516 489 L516 1355 A71 71 0 0 0 622.5 1416.49 L1372.48 983.49 A71 71 0 0 0 1372.48 860.51 L622.5 427.51 A71 71 0 0 0 516 489 Z";

/**
 * The loading mark: the Replay logo's two triangles, with the outlined one filling from left to right like a video buffering,
 * then clearing and filling again. It takes the colour of the text around it, so it works on a mint button, a grey label and a
 * dark card alike. With animations reduced it is just the still mark.
 */
export function MarkLoader({ className, label }: { className?: string; label?: string }) {
  return (
    <svg viewBox="350 352 1300 1300" className={cn("mark-loader size-4 shrink-0", className)} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} focusable={false}>
      <polygon transform="translate(1063 1107) scale(0.88) translate(-1063 -1107)" points="688,674 688,1540 1438,1107" fill="currentColor" stroke="currentColor" strokeWidth="188" strokeLinejoin="round" opacity="0.3" />
      <path d={OUTLINE} fill="none" stroke="currentColor" strokeWidth="96" strokeLinejoin="round" opacity="0.4" />
      <g className="mark-loader-fill">
        <path d={OUTLINE} fill="none" stroke="currentColor" strokeWidth="96" strokeLinejoin="round" />
      </g>
    </svg>
  );
}
