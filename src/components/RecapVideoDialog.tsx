"use client";

import { Download, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { CardHide } from "@/lib/fumble/card.ts";
import type { Display } from "@/lib/fumble/money.ts";
import type { ApiResult } from "@/lib/fumble/service.ts";
import { recapVideoFileName, recordRecapVideo } from "@/lib/fumble/video.ts";
import { RECAP_NAME } from "@/lib/recapName.ts";
import { pickVideoFormat } from "@/lib/replayVideo.ts";

/**
 * "Generate video": the recap as a short vertical video. It starts as soon as the dialog opens and shows the video being drawn as it is recorded (it runs in
 * real time, so the tab has to stay open); when it is done the dialog plays the finished file, with a download button. Closing it stops a recording that is
 * still going. What the video shows follows the settings (shown, masked as ***, or hidden), the same as the picture.
 */
export function RecapVideoDialog({ open, onClose, result, now, display, hide }: { open: boolean; onClose: () => void; result: ApiResult; now: number; display: Display; hide: CardHide }) {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [run, setRun] = useState(0);
  const [progress, setProgress] = useState(0);
  const [made, setMade] = useState<{ url: string; name: string; seconds: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Whether this browser can record canvas video at all; checked once, when the dialog is made (it is only made when opened, so this runs in the browser).
  const [unsupported] = useState(() => !pickVideoFormat());

  // Records when the dialog opens (or "Make it again" is pressed), and stops when it closes. The dialog is made fresh each time it opens, so the state starts
  // clean; "Make it again" clears it itself. The scan and settings are read when the recording starts: changing them while it records does not restart it.
  useEffect(() => {
    if (!open || !canvas || unsupported) return;
    const controller = new AbortController();
    let url: string | null = null;
    recordRecapVideo(canvas, { result, now, display, hide }, { onProgress: setProgress, signal: controller.signal })
      .then(({ blob, ext, seconds }) => {
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(blob);
        setMade({ url, name: recapVideoFileName(result, hide, ext), seconds });
      })
      .catch((e) => {
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Couldn't make the video.");
      });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the scan and settings are read once, when the recording starts
  }, [open, canvas, run, unsupported]);

  function again() {
    setMade(null);
    setError(null);
    setProgress(0);
    setRun((n) => n + 1);
  }

  function download() {
    if (!made) return;
    const a = document.createElement("a");
    a.href = made.url;
    a.download = made.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  const problem = unsupported ? "This browser can't record video. Try Chrome, Edge or Firefox." : error;
  const making = !made && !problem;
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md gap-4">
        <div className="flex flex-col gap-1 pr-6">
          <DialogTitle className="leading-none">{RECAP_NAME} video</DialogTitle>
          <DialogDescription className="sr-only">Your recap as a short video. It is made in your browser; download it when it is ready.</DialogDescription>
        </div>
        {/* The video's shape (vertical) is kept while it is made and after, so the dialog does not jump. The canvas shows it being drawn, then the finished video replaces it. */}
        <div className="relative mx-auto aspect-[9/16] h-[min(60dvh,560px)] border border-border bg-background">
          <canvas ref={setCanvas} aria-label="The video being made" className={made || problem ? "hidden" : "h-full w-full"} />
          {made && <video src={made.url} controls autoPlay loop playsInline muted aria-label={`${RECAP_NAME} video`} className="h-full w-full" />}
          {problem && (
            <p role="alert" className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm font-bold">
              {problem}
            </p>
          )}
        </div>
        {making && (
          <div className="flex flex-col gap-2" role="status">
            <div className="h-1.5 w-full bg-border" aria-hidden>
              <div className="h-full bg-primary transition-[width] duration-200" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <p className="text-sm text-muted-foreground">Making your video, {Math.round(progress * 100)}%. Keep this tab open until it is done.</p>
          </div>
        )}
        {(made || problem) && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            {made && (
              <button type="button" onClick={download} className="cut-btn cut-btn-solid inline-flex h-10 items-center gap-2 px-5 text-sm font-bold">
                <Download className="size-4" aria-hidden /> Download video
              </button>
            )}
            {!unsupported && (
              <button type="button" onClick={again} className="inline-flex items-center gap-1.5 text-sm font-bold text-foreground underline underline-offset-4 hover:text-primary">
              <RotateCcw className="size-3.5" aria-hidden /> {problem ? "Try again" : "Make it again"}
            </button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
