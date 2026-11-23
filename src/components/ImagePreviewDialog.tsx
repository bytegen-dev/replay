"use client";

import { Check, Copy, Download } from "lucide-react";
import { useEffect, useState } from "react";
import { MarkLoader } from "@/components/MarkLoader";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

/**
 * A picture to look at before it is saved: shown at full width, with Download and Copy under it, and, where `privacyMode` is on, a switch that draws the PnL and the wallet address as ***.
 * The dialog makes the picture itself (`render`) when it opens and again when the switch flips, so what is shown is what is saved.
 */
export function ImagePreviewDialog({ open, title, fileName, fileNameFor, privacyMode = false, render, onClose }: { open: boolean; title: string; fileName: string; render: (privacy: boolean) => Promise<Blob>; fileNameFor?: (privacy: boolean) => string; privacyMode?: boolean; onClose: () => void }) {
  const [privacy, setPrivacy] = useState(false);
  const [made, setMade] = useState<{ blob: Blob; url: string; hidden: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"done" | "failed" | null>(null);
  const canCopy = typeof window !== "undefined" && typeof ClipboardItem !== "undefined" && !!navigator.clipboard?.write;

  // Makes the picture, and reads it into a data address for showing (set from the reader's callback).
  useEffect(() => {
    if (!open) return;
    let live = true;
    render(privacyMode && privacy)
      .then((blob) => {
        const reader = new FileReader();
        reader.onload = () => live && typeof reader.result === "string" && (setMade({ blob, url: reader.result, hidden: privacyMode && privacy }), setError(null), setCopied(null));
        reader.readAsDataURL(blob);
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : "Couldn't make the picture."));
    return () => {
      live = false;
    };
  }, [open, privacy, privacyMode, render]);

  // "Copied" and "Couldn't copy" go back to the plain button after a few seconds.
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 2500);
    return () => clearTimeout(t);
  }, [copied]);

  const shown = made && made.hidden === (privacyMode && privacy) ? made : null;

  function download() {
    if (!shown) return;
    const href = URL.createObjectURL(shown.blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = fileNameFor ? fileNameFor(shown.hidden) : fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
  }

  async function copy() {
    if (!shown) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ [shown.blob.type || "image/png"]: shown.blob })]);
      setCopied("done");
    } catch {
      setCopied("failed");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && (setMade(null), setError(null), onClose())}>
      <DialogContent className="max-w-3xl gap-5">
        <div className="flex flex-col gap-1 pr-6">
          <DialogTitle className="leading-none">{title}</DialogTitle>
          <DialogDescription className="sr-only">A preview of the picture. Download it or copy it.</DialogDescription>
        </div>
        {/* The picture, or a box of the same shape while it is being made, so the dialog does not jump. */}
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element -- a local blob, nothing for the image optimiser to do
          <img src={shown.url} alt={title} className="max-h-[60dvh] w-full border border-border object-contain" />
        ) : (
          <div className="flex aspect-[1200/630] w-full flex-col items-center justify-center gap-3 border border-border text-sm text-muted-foreground">
            {error ? (
              <span role="alert" className="font-bold text-foreground">
                {error}
              </span>
            ) : (
              <>
                <MarkLoader className="size-10 text-primary" />
                <span>Generating graphic</span>
              </>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <button type="button" onClick={download} disabled={!shown} className="cut-btn cut-btn-solid inline-flex h-10 items-center gap-2 px-5 text-sm font-bold disabled:opacity-60">
            <Download className="size-4" aria-hidden /> Download
          </button>
          {canCopy && (
            <button type="button" onClick={() => void copy()} disabled={!shown} className="cut-btn inline-flex h-10 items-center gap-2 px-5 text-sm font-bold text-primary disabled:opacity-60">
              {copied === "done" ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
              {copied === "done" ? "Copied" : "Copy image"}
            </button>
          )}
          {privacyMode && (
            <div className="ml-auto flex items-center gap-3">
              <Label htmlFor="privacy-mode" className="text-sm font-bold">
                Privacy mode
              </Label>
              <Switch id="privacy-mode" checked={privacy} onCheckedChange={setPrivacy} />
            </div>
          )}
          {copied === "failed" && (
            <span role="alert" className="w-full text-sm font-bold">
              Couldn&rsquo;t copy. Download it instead.
            </span>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
