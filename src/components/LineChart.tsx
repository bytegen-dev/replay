"use client";

import { cn } from "@/lib/utils";
import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { formatChartTime, niceScale, thinTicks, timeTicks } from "@/lib/charts.ts";

/**
 * A chart drawn as plain SVG, so it needs no charting library. It borrows from trading terminals: the price axis is on the
 * right, the latest value wears a tag on that axis, hovering draws a crosshair with price and time pills, the line is
 * green when it ends up and red when it ends down, and the fill fades out under it. Arrow keys move the crosshair too.
 * x values are milliseconds (UTC).
 */

export interface ChartSeries {
  key: string;
  label: string;
  points: { x: number; y: number }[];
  /** A dashed, quieter line, for a comparison. */
  dashed?: boolean;
  /** Fill the area under the line with a fading gradient. */
  area?: boolean;
  /** Line colour. Defaults to the up colour. Use the down colour for a losing line. */
  color?: string;
  /** Mark every point with a small dot (for purchases). Skipped when there are too many to read. */
  dots?: boolean;
}

interface Props {
  series: ChartSeries[];
  /** Formats values on the axis and in the readout. */
  yFormat: (n: number) => string;
  /** Anchor the value axis at zero (money in and out) or let it hug the data (a price). */
  zeroBaseline?: boolean;
  /** A vertical line at a moment, e.g. the time that was looked up. */
  marker?: { x: number; label: string };
  /** Show the clock in the readout (for short spans). */
  withClock?: boolean;
  /** Keeps the axes where they are while the data grows, so a replay draws into a fixed frame. */
  fixedRange?: { xMin: number; xMax: number; yMin: number; yMax: number };
  height?: number;
  /** Tighter margins left and right, for a chart set edge to edge in its card. */
  compact?: boolean;
  /** What the chart shows, for screen readers. */
  ariaLabel: string;
}

export const UP = "var(--primary)";
export const DOWN = "var(--destructive)";

const MARGINS = { top: 18, right: 66, bottom: 28, left: 10 };
/** For a chart that runs to the edges of its card: less room on each side. */
const COMPACT_MARGINS = { top: 18, right: 62, bottom: 28, left: 8 };
const CHAR = 6.7; // width of one 11px mono character, for sizing the pills
const PILL_H = 18;

/** A small rounded tag on an axis. */
function Pill({ x, y, text, fill, ink, anchor = "start" }: { x: number; y: number; text: string; fill: string; ink: string; anchor?: "start" | "middle" }) {
  const w = text.length * CHAR + 12;
  const left = anchor === "middle" ? x - w / 2 : x;
  return (
    <g pointerEvents="none">
      <rect x={left} y={y - PILL_H / 2} width={w} height={PILL_H} rx="2" fill={fill} />
      <text x={left + w / 2} y={y} dy="0.34em" textAnchor="middle" fontSize="11" fontWeight="700" fill={ink}>
        {text}
      </text>
    </g>
  );
}

export function LineChart({ series, yFormat, zeroBaseline = true, marker, withClock = false, fixedRange, height = 280, compact = false, ariaLabel }: Props) {
  const M = compact ? COMPACT_MARGINS : MARGINS;
  const box = useRef<HTMLDivElement>(null);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [width, setWidth] = useState(320);
  // False until the box has been measured. The server (and the first paint) can only guess the width, and drawing the chart at the guess
  // makes it show short and then widen, so the drawing stays out of sight until the real width is known.
  const [measured, setMeasured] = useState(false);
  const [hover, setHover] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = (w: number) => setWidth(Math.max(280, Math.floor(w)));
    fit(el.getBoundingClientRect().width);
    setMeasured(true);
    const ro = new ResizeObserver(([entry]) => fit(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const model = useMemo(() => {
    const xs = series.flatMap((s) => s.points.map((p) => p.x));
    const ys = series.flatMap((s) => s.points.map((p) => p.y));
    if (xs.length < 2) return null;
    let xMin = Math.min(...xs);
    let xMax = Math.max(...xs);
    if (marker) {
      xMin = Math.min(xMin, marker.x);
      xMax = Math.max(xMax, marker.x);
    }
    if (fixedRange) {
      xMin = fixedRange.xMin;
      xMax = fixedRange.xMax;
    }
    const scale = fixedRange ? niceScale(fixedRange.yMin, fixedRange.yMax, zeroBaseline) : niceScale(Math.min(...ys), Math.max(...ys), zeroBaseline);
    // Labels are about 55px wide, so only as many as fit with a gap between them: three or four on a phone.
    const room = Math.floor((width - M.left - M.right) / 80);
    return { xMin, xMax, scale, xTicks: thinTicks(timeTicks(xMin, xMax, 6), room) };
  }, [series, marker, zeroBaseline, width, fixedRange, M.left, M.right]);

  if (!model) return null;
  const { xMin, xMax, scale, xTicks } = model;
  const iw = width - M.left - M.right;
  const ih = height - M.top - M.bottom;
  const sx = (x: number) => M.left + ((x - xMin) / (xMax - xMin)) * iw;
  const sy = (y: number) => M.top + (1 - (y - scale.lo) / (scale.hi - scale.lo)) * ih;
  const line = (pts: { x: number; y: number }[]) => pts.map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(" ");
  const area = (pts: { x: number; y: number }[]) => `${line(pts)} L${sx(pts[pts.length - 1].x).toFixed(1)} ${sy(scale.lo).toFixed(1)} L${sx(pts[0].x).toFixed(1)} ${sy(scale.lo).toFixed(1)} Z`;
  const colorOf = (s: ChartSeries) => (s.dashed ? "var(--muted-foreground)" : (s.color ?? UP));

  // The first series decides where the crosshair can snap to.
  const driver = series[0].points;
  const nearest = (x: number) => driver.reduce((best, p, i) => (Math.abs(p.x - x) < Math.abs(driver[best].x - x) ? i : best), 0);
  const at = (s: ChartSeries, x: number) => s.points.reduce((best, p) => (Math.abs(p.x - x) < Math.abs(best.x - x) ? p : best), s.points[0]);
  const hoverPoint = hover === null ? null : (driver[hover] ?? null);

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = xMin + ((e.clientX - rect.left - M.left) / iw) * (xMax - xMin);
    setHover(nearest(Math.min(xMax, Math.max(xMin, x))));
  }
  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? driver.length) - 1));
    else if (e.key === "ArrowRight") setHover((h) => Math.min(driver.length - 1, (h === null ? -1 : h) + 1));
    else if (e.key === "Escape") setHover(null);
    else return;
    e.preventDefault();
  }

  const markerAt = marker ? series[0].points.filter((p) => p.x <= marker.x).pop() : undefined;
  const axisX = width - M.right;

  // The latest value of each line, tagged on the price axis. Tags that would overlap are pushed apart.
  const lasts = series
    .filter((s) => s.points.length > 1)
    .map((s) => ({ s, y: sy(s.points[s.points.length - 1].y), v: s.points[s.points.length - 1].y }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < lasts.length; i++) if (lasts[i].y - lasts[i - 1].y < PILL_H + 2) lasts[i].y = lasts[i - 1].y + PILL_H + 2;

  const hoverLabel = hoverPoint ? formatChartTime(hoverPoint.x, withClock) : "";
  const timeW = hoverLabel.length * CHAR + 12;
  const timeX = hoverPoint ? Math.min(Math.max(sx(hoverPoint.x), M.left + timeW / 2), axisX - timeW / 2 + 4) : 0;
  const tipLeft = hoverPoint ? Math.min(Math.max(sx(hoverPoint.x) + 14, 4), width - M.right - 216) : 0;

  return (
    // min-w-0 + overflow-hidden: the chart is as wide as the space it is given, never the other way round. Without them
    // the svg's own width holds the box open, the box measures itself, and the chart can never shrink on a narrow screen.
    <div ref={box} className="relative w-full min-w-0 overflow-hidden">
      <ul className={cn("mb-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground", compact && "pl-1 sm:pl-2")}>
        {series.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <svg width="22" height="8" aria-hidden>
              <line x1="0" x2="22" y1="4" y2="4" stroke={colorOf(s)} strokeWidth={s.dashed ? 1.5 : 2.5} strokeDasharray={s.dashed ? "4 3" : undefined} />
            </svg>
            {s.label}
          </li>
        ))}
      </ul>

      <svg
        width={width}
        height={height}
        role="img"
        aria-label={ariaLabel}
        tabIndex={0}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        onBlur={() => setHover(null)}
        onKeyDown={onKey}
        style={measured ? undefined : { visibility: "hidden" }}
        className="block touch-pan-y text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        <title>{ariaLabel}</title>
        <defs>
          {series.filter((s) => s.area).map((s) => (
            <linearGradient key={s.key} id={`${uid}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              {/* style, not attributes: only CSS properties can use var(--colour) here */}
              <stop offset="0" style={{ stopColor: colorOf(s), stopOpacity: 0.38 }} />
              <stop offset="1" style={{ stopColor: colorOf(s), stopOpacity: 0 }} />
            </linearGradient>
          ))}
        </defs>

        {scale.ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={axisX} y1={sy(t)} y2={sy(t)} stroke="var(--border)" strokeWidth="1" opacity="0.55" />
            <text x={axisX + 8} y={sy(t)} dy="0.32em" fontSize="11" fill="var(--muted-foreground)">
              {yFormat(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <g key={t.t}>
            <line x1={sx(t.t)} x2={sx(t.t)} y1={M.top} y2={M.top + ih + 4} stroke="var(--border)" strokeWidth="1" opacity="0.3" />
            {/* A label near an edge is kept inside the chart: left-aligned at the start, right-aligned at the end. */}
            {(() => {
              const half = (t.label.length * CHAR) / 2;
              const x = sx(t.t);
              const anchor = x - half < 2 ? "start" : x + half > axisX + 8 ? "end" : "middle";
              return (
                <text x={anchor === "start" ? Math.max(2, x - 2) : anchor === "end" ? x + 2 : x} y={height - 9} textAnchor={anchor} fontSize="11" fill="var(--muted-foreground)">
                  {t.label}
                </text>
              );
            })()}
          </g>
        ))}

        {series.filter((s) => s.area && s.points.length > 1).map((s) => <path className="fade-late" key={`${s.key}-area`} d={area(s.points)} fill={`url(#${uid}-${s.key})`} />)}
        {series.filter((s) => s.points.length > 1).map((s) => (
          <path key={s.key} className={s.dashed ? "fade-late" : "draw-line"} pathLength={s.dashed ? undefined : 1} d={line(s.points)} fill="none" stroke={colorOf(s)} strokeWidth={s.dashed ? 1.5 : 2.25} strokeDasharray={s.dashed ? "5 4" : undefined} strokeLinejoin="round" strokeLinecap="round" />
        ))}

        {/* A dot on each purchase, when there are few enough to tell apart. */}
        {series.filter((s) => s.dots && s.points.length <= 72).map((s) => (
          <g key={`${s.key}-dots`} className="fade-late">
            {s.points.map((p) => (
              <circle key={p.x} cx={sx(p.x)} cy={sy(p.y)} r="2.6" fill="var(--background)" stroke={colorOf(s)} strokeWidth="1.5" />
            ))}
          </g>
        ))}

        {/* Latest value: a dotted line across and a tag on the price axis. */}
        {lasts.map(({ s, y, v }, i) => (
          <g key={`${s.key}-last`}>
            {i === 0 || !s.dashed ? <line x1={M.left} x2={axisX} y1={sy(v)} y2={sy(v)} stroke={colorOf(s)} strokeWidth="1" strokeDasharray="1 4" strokeLinecap="round" opacity="0.7" /> : null}
            <Pill x={axisX + 2} y={y} text={yFormat(v)} fill={s.dashed ? "var(--secondary)" : colorOf(s)} ink={s.dashed ? "var(--muted-foreground)" : "var(--primary-foreground)"} />
          </g>
        ))}

        {marker && (
          <g>
            <line x1={sx(marker.x)} x2={sx(marker.x)} y1={M.top} y2={M.top + ih} stroke="var(--foreground)" strokeWidth="1" strokeDasharray="3 3" opacity="0.7" />
            {markerAt && <circle cx={sx(marker.x)} cy={sy(markerAt.y)} r="5" fill="var(--background)" stroke="var(--foreground)" strokeWidth="2" />}
            <text x={Math.min(sx(marker.x), axisX - 4)} y={M.top - 5} textAnchor={sx(marker.x) > width - 150 ? "end" : "middle"} fontSize="11" fontWeight="700" fill="var(--foreground)">
              {marker.label}
            </text>
          </g>
        )}

        {/* Crosshair, with the price and time pills on the axes. */}
        {hoverPoint && (
          <g pointerEvents="none">
            <line x1={sx(hoverPoint.x)} x2={sx(hoverPoint.x)} y1={M.top} y2={M.top + ih} stroke="var(--muted-foreground)" strokeWidth="1" strokeDasharray="3 3" />
            <line x1={M.left} x2={axisX} y1={sy(hoverPoint.y)} y2={sy(hoverPoint.y)} stroke="var(--muted-foreground)" strokeWidth="1" strokeDasharray="3 3" />
            {series.map((s) => {
              const p = at(s, hoverPoint.x);
              return <circle key={s.key} cx={sx(p.x)} cy={sy(p.y)} r="4.5" fill="var(--background)" stroke={colorOf(s)} strokeWidth="2" />;
            })}
            <Pill x={axisX + 2} y={sy(hoverPoint.y)} text={yFormat(hoverPoint.y)} fill="var(--foreground)" ink="var(--background)" />
            <Pill x={timeX} y={M.top + ih + 14} text={hoverLabel} fill="var(--foreground)" ink="var(--background)" anchor="middle" />
          </g>
        )}
      </svg>

      {hoverPoint && series.length > 1 && (
        <div className="pointer-events-none absolute top-8 z-10 w-52 border border-border bg-popover p-2 text-xs shadow-md" style={{ left: tipLeft }} role="status">
          {series.map((s) => (
            <p key={s.key} className="flex justify-between gap-2 tabular-nums">
              <span className="text-muted-foreground">{s.label}</span>
              <span className="font-bold">{yFormat(at(s, hoverPoint.x).y)}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
