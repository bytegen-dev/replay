"use client";

import dynamic from "next/dynamic";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useEffect, useState } from "react";
import { MarkLoader } from "@/components/MarkLoader";
import type { EndlessSegment } from "@/lib/flappyCourse.ts";
import type { Level } from "@/lib/gameLevels.ts";
import { OPEN_GAME_EVENT } from "@/lib/viewerClient.ts";

// The game's code is only fetched when someone opens it.
const TonyGame = dynamic(() => import("@/components/play/TonyGame").then((m) => m.TonyGame), { ssr: false });

/**
 * Tony Stonk in a box over the page. Any "Game" link on the site opens it here; the game's own top bar has a button to open it in a
 * new tab instead, and one to close it. A click outside the box does not close it, so a stray click cannot end a run.
 */
export function GameDialog() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ levels: Level[]; segments: EndlessSegment[] } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_GAME_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_GAME_EVENT, onOpen);
  }, []);

  // The courses come the first time the box opens.
  useEffect(() => {
    if (!open || data) return;
    let live = true;
    fetch("/api/game/levels")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad response"))))
      .then((j: { levels: Level[]; segments: EndlessSegment[] }) => live && setData(j))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [open, data]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-background/85 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <DialogPrimitive.Content
          onOpenAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => data && e.preventDefault()}
          className="fixed top-1/2 left-1/2 z-[81] h-[min(94dvh,860px)] w-[min(96vw,1360px)] -translate-x-1/2 -translate-y-1/2 overflow-hidden border border-border bg-background outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:duration-200"
        >
          <DialogPrimitive.Title className="sr-only">Tony Stonk</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Fly Tony through real price history.</DialogPrimitive.Description>
          {data ? (
            <TonyGame embedded levels={data.levels} segments={data.segments} onClose={() => setOpen(false)} />
          ) : (
            <div className="grid h-full place-items-center text-sm text-muted-foreground">
              {failed ? (
                <div className="flex flex-col items-center gap-3">
                  <p>The game could not load.</p>
                  <button type="button" onClick={() => setOpen(false)} className="underline underline-offset-4 hover:text-primary">
                    Close
                  </button>
                </div>
              ) : (
                <MarkLoader className="size-8" />
              )}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
