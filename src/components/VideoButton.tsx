"use client";

import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { MarkLoader } from "@/components/MarkLoader";
import type { GrowthPoint } from "@/lib/charts.ts";
import { pickVideoFormat, recordReplay, type ReplayView } from "@/lib/replayVideo.ts";

/** "Download video": draws the replay onto a canvas and saves it as a video. Hidden in browsers that can't record canvas video. */
export function VideoButton({ points, view, title, symbol, onStart }: { points: GrowthPoint[]; view: ReplayView; title: string; symbol?: string; onStart?: () => void }) {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [can, setCan] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setCan(pickVideoFormat() !== null), 0);
    return () => clearTimeout(id);
  }, []);
  if (!can) return null;

  async function generate() {
    setError(null);
    onStart?.();
    setProgress(0);
    try {
      const { blob, ext } = await recordReplay({ points, view, title, symbol, onProgress: setProgress });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "replay"}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't make the video.");
    } finally {
      setProgress(null);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void generate()}
        disabled={progress !== null}
        className="flex h-7 items-center gap-1.5 border border-border px-2.5 text-xs font-bold text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-70"
        title="Generate a video of the replay and download it. Keep this tab open while it is made."
      >
        {progress !== null ? <MarkLoader className="size-3.5" /> : <Download className="size-3.5" aria-hidden />}
        {progress !== null ? `Generating video ${Math.round(progress * 100)}%` : "Download video"}
      </button>
      {error && (
        <p role="alert" className="w-full text-sm font-bold">
          {error}
        </p>
      )}
    </>
  );
}
