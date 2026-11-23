"use client";

import { Download } from "lucide-react";
import { useCallback, useState } from "react";
import { ImagePreviewDialog } from "@/components/ImagePreviewDialog";
import type { GrowthPoint } from "@/lib/charts.ts";
import { renderReplayStill } from "@/lib/replayVideo.ts";

/** "Download PnL": opens a preview of the finished result (what went in, what it is worth, the PnL and the chart) drawn onto a canvas, to download or copy from there. */
export function PnlButton({ points, title, subtitle, fileName, symbol }: { points: GrowthPoint[]; title: string; subtitle?: string; fileName?: string; symbol?: string }) {
  const [open, setOpen] = useState(false);
  const render = useCallback(() => renderReplayStill({ points, view: "growth", title, subtitle, symbol }), [points, title, subtitle, symbol]);
  if (points.length < 2) return null;
  const base = fileName || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "replay";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-7 items-center gap-1.5 border border-border px-2.5 text-xs font-bold text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
        title="Preview a picture of the result: what went in, what it is worth and the PnL."
      >
        <Download className="size-3.5" aria-hidden />
        Download PnL
      </button>
      <ImagePreviewDialog open={open} title="Your result" fileName={`${base}-pnl.png`} render={render} onClose={() => setOpen(false)} />
    </>
  );
}
