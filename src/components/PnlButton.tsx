"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { MarkLoader } from "@/components/MarkLoader";
import type { GrowthPoint } from "@/lib/charts.ts";
import { renderReplayStill } from "@/lib/replayVideo.ts";

/** "Download PnL": the finished result (what went in, what it is worth, the profit and the chart) drawn onto a canvas and saved as a picture. */
export function PnlButton({ points, title, subtitle, fileName, symbol }: { points: GrowthPoint[]; title: string; subtitle?: string; fileName?: string; symbol?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (points.length < 2) return null;

  async function download() {
    setError(null);
    setBusy(true);
    try {
      const blob = await renderReplayStill({ points, view: "growth", title, subtitle, symbol });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const base = fileName || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "replay";
      a.download = `${base}-pnl.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't make the picture.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void download()}
        disabled={busy}
        className="flex h-7 items-center gap-1.5 border border-border px-2.5 text-xs font-bold text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-70"
        title="Download a picture of the result: what went in, what it is worth and the profit."
      >
        {busy ? <MarkLoader className="size-3.5" /> : <Download className="size-3.5" aria-hidden />}
        Download PnL
      </button>
      {error && (
        <p role="alert" className="w-full text-sm font-bold">
          {error}
        </p>
      )}
    </>
  );
}
