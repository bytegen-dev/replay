"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DOWN, LineChart, UP, type ChartSeries } from "@/components/LineChart";
import { moneyShort } from "@/lib/charts.ts";
import type { DemoPoint } from "@/lib/landingData.ts";
import { motionReduced } from "@/lib/settings.ts";

/**
 * A saved result's growth chart that draws itself: the line runs left to right while the axes stay put. It draws again
 * whenever `runKey` changes (a different check picked), and shows complete straight away for people who prefer reduced motion.
 */
export function DrawChart({ points, runKey, height = 280, ariaLabel, durationMs = 1700, firstDelayMs = 0 }: { points: DemoPoint[]; runKey: string; height?: number; ariaLabel: string; durationMs?: number; firstDelayMs?: number }) {
  // The progress belongs to the check it was made for, so picking another starts at zero with no frame of the old line.
  const [drawn, setDrawn] = useState<{ key: string; p: number }>({ key: "", p: 0 });
  const progress = drawn.key === runKey ? drawn.p : 0;
  // Only the very first draw waits (for the card around it to arrive); later ones start at once.
  const first = useRef(true);

  useEffect(() => {
    if (motionReduced()) {
      const id = setTimeout(() => setDrawn({ key: runKey, p: 1 }), 0);
      return () => clearTimeout(id);
    }
    const wait = first.current ? firstDelayMs : 0;
    first.current = false;
    let raf = 0;
    let start = 0;
    const tick = (now: number) => {
      if (!start) start = now;
      const t = Math.min(1, (now - start) / durationMs);
      // Eases out: quick off the mark, settling softly (an exponential curve, like something coming to rest).
      setDrawn({ key: runKey, p: 1 - Math.pow(2, -9 * t) * (1 - t) });
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    const id = setTimeout(() => {
      raf = requestAnimationFrame(tick);
    }, wait);
    return () => {
      clearTimeout(id);
      cancelAnimationFrame(raf);
    };
  }, [runKey, durationMs, firstDelayMs]);

  const range = useMemo(() => {
    const ys = points.flatMap((p) => [p.value, p.invested]);
    return { xMin: points[0].t, xMax: points[points.length - 1].t, yMin: 0, yMax: Math.max(...ys) };
  }, [points]);

  const shown = useMemo(() => {
    const exact = progress * (points.length - 1);
    const whole = Math.floor(exact);
    if (progress >= 1 || whole >= points.length - 1) return points;
    const a = points[whole];
    const b = points[whole + 1];
    const f = exact - whole;
    const mix = (x: number, y: number) => x + (y - x) * f;
    return [...points.slice(0, whole + 1), { t: mix(a.t, b.t), value: mix(a.value, b.value), invested: mix(a.invested, b.invested) }];
  }, [points, progress]);

  const last = points[points.length - 1];
  const up = last.value >= last.invested;
  const series: ChartSeries[] = [
    { key: "value", label: "Worth at the time", area: true, color: up ? UP : DOWN, points: shown.map((p) => ({ x: p.t, y: p.value })) },
    { key: "invested", label: "Total invested", dashed: true, points: shown.map((p) => ({ x: p.t, y: p.invested })) },
  ];
  return <LineChart series={series} fixedRange={progress < 1 ? range : undefined} yFormat={moneyShort} height={height} ariaLabel={ariaLabel} />;
}
