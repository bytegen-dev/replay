"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatChartTime, niceScale, timeTicks } from "@/lib/charts.ts";

/**
 * A small line chart drawn as plain SVG, so it needs no charting library and matches the black-and-white theme:
 * solid white for the main line, dashed grey for the comparison, thin grid, labels in the page font.
 * Hover (or arrow keys) shows the exact values at a point. x values are milliseconds (UTC).
 */

export interface ChartSeries {
  key: string;
  label: string;
  points: { x: number; y: number }[];
  /** A dashed, quieter line, for a comparison. */
  dashed?: boolean;
  /** Fill the area under the line. */
  area?: boolean;
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
  height?: number;
  /** What the chart shows, for screen readers. */
  ariaLabel: string;
}

const M = { top: 14, right: 14, bottom: 26, left: 58 };

export function LineChart({ series, yFormat, zeroBaseline = true, marker, withClock = false, height = 250, ariaLabel }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.floor(entry.contentRect.width))));
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
    const scale = niceScale(Math.min(...ys), Math.max(...ys), zeroBaseline);
    return { xMin, xMax, scale, xTicks: timeTicks(xMin, xMax, width < 480 ? 4 : 6) };
  }, [series, marker, zeroBaseline, width]);

  if (!model) return null;
  const { xMin, xMax, scale, xTicks } = model;
  const iw = width - M.left - M.right;
  const ih = height - M.top - M.bottom;
  const sx = (x: number) => M.left + ((x - xMin) / (xMax - xMin)) * iw;
  const sy = (y: number) => M.top + (1 - (y - scale.lo) / (scale.hi - scale.lo)) * ih;
  const line = (pts: { x: number; y: number }[]) => pts.map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(" ");
  const area = (pts: { x: number; y: number }[]) => `${line(pts)} L${sx(pts[pts.length - 1].x).toFixed(1)} ${sy(scale.lo).toFixed(1)} L${sx(pts[0].x).toFixed(1)} ${sy(scale.lo).toFixed(1)} Z`;

  // The first series decides where the readout can snap to.
  const driver = series[0].points;
  const nearest = (x: number) => driver.reduce((best, p, i) => (Math.abs(p.x - x) < Math.abs(driver[best].x - x) ? i : best), 0);
  const at = (s: ChartSeries, x: number) => s.points.reduce((best, p) => (Math.abs(p.x - x) < Math.abs(best.x - x) ? p : best), s.points[0]);
  const hoverX = hover === null ? null : driver[hover]?.x ?? null;

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

  const tipLeft = hoverX === null ? 0 : Math.min(Math.max(sx(hoverX) + 12, 4), width - 190);
  const markerAt = marker ? series[0].points.filter((p) => p.x <= marker.x).pop() : undefined;

  return (
    // min-w-0 + overflow-hidden: the chart is as wide as the space it is given, never the other way round. Without them
    // the svg's own width holds the box open, the box measures itself, and the chart can never shrink on a narrow screen.
    <div ref={box} className="relative w-full min-w-0 overflow-hidden">
      <ul className="mb-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        {series.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <svg width="22" height="8" aria-hidden>
              <line x1="0" x2="22" y1="4" y2="4" stroke={s.dashed ? "var(--muted-foreground)" : "currentColor"} strokeWidth={s.dashed ? 1.5 : 2.5} strokeDasharray={s.dashed ? "4 3" : undefined} />
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
        className="block touch-pan-y text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        <title>{ariaLabel}</title>

        {scale.ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={width - M.right} y1={sy(t)} y2={sy(t)} stroke="var(--border)" strokeWidth="1" />
            <text x={M.left - 8} y={sy(t)} dy="0.32em" textAnchor="end" fontSize="11" fill="var(--muted-foreground)">
              {yFormat(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <g key={t.t}>
            <line x1={sx(t.t)} x2={sx(t.t)} y1={M.top + ih} y2={M.top + ih + 4} stroke="var(--border)" />
            <text x={sx(t.t)} y={height - 8} textAnchor="middle" fontSize="11" fill="var(--muted-foreground)">
              {t.label}
            </text>
          </g>
        ))}

        {series.filter((s) => s.area && s.points.length > 1).map((s) => <path key={`${s.key}-area`} d={area(s.points)} fill="currentColor" opacity="0.1" />)}
        {series.filter((s) => s.points.length > 1).map((s) => (
          <path key={s.key} d={line(s.points)} fill="none" stroke={s.dashed ? "var(--muted-foreground)" : "currentColor"} strokeWidth={s.dashed ? 1.5 : 2} strokeDasharray={s.dashed ? "5 4" : undefined} strokeLinejoin="round" strokeLinecap="round" />
        ))}

        {/* Direct labels: each line ends with its own value, so the reader needs no legend lookup. Hidden while hovering. */}
        {!marker && hoverX === null && series.filter((s) => s.points.length > 1).map((s, i) => {
          const p = s.points[s.points.length - 1];
          const above = series.length > 1 && series.filter((o) => o.points.length > 1).every((o) => o === s || sy(o.points[o.points.length - 1].y) >= sy(p.y) || i === 0);
          return (
            <text key={`${s.key}-end`} x={sx(p.x)} y={sy(p.y) + (above ? -10 : 16)} textAnchor="end" fontSize="11" fontWeight={s.dashed ? 400 : 700} fill={s.dashed ? "var(--muted-foreground)" : "currentColor"}>
              {yFormat(p.y)}
            </text>
          );
        })}

        {marker && (
          <g>
            <line x1={sx(marker.x)} x2={sx(marker.x)} y1={M.top} y2={M.top + ih} stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" />
            {markerAt && <circle cx={sx(marker.x)} cy={sy(markerAt.y)} r="5" fill="var(--background)" stroke="currentColor" strokeWidth="2" />}
            <text x={Math.min(sx(marker.x), width - M.right - 4)} y={M.top - 3} textAnchor={sx(marker.x) > width - 90 ? "end" : "middle"} fontSize="11" fontWeight="700" fill="currentColor">
              {marker.label}
            </text>
          </g>
        )}

        {hoverX !== null && (
          <g pointerEvents="none">
            <line x1={sx(hoverX)} x2={sx(hoverX)} y1={M.top} y2={M.top + ih} stroke="var(--muted-foreground)" strokeWidth="1" />
            {series.map((s) => {
              const p = at(s, hoverX);
              return <circle key={s.key} cx={sx(p.x)} cy={sy(p.y)} r="4" fill="var(--background)" stroke={s.dashed ? "var(--muted-foreground)" : "currentColor"} strokeWidth="2" />;
            })}
          </g>
        )}
      </svg>

      {hoverX !== null && (
        <div className="pointer-events-none absolute top-8 z-10 w-44 border border-border bg-popover p-2 text-xs shadow-md" style={{ left: tipLeft }} role="status">
          <p className="mb-1 font-bold">{formatChartTime(hoverX, withClock)}</p>
          {series.map((s) => (
            <p key={s.key} className="flex justify-between gap-2 tabular-nums">
              <span className="text-muted-foreground">{s.label}</span>
              <span className="font-bold">{yFormat(at(s, hoverX).y)}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
