"use client";

import { TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** How long the leaving animation runs (see `.toast-out`), after which the toast is gone. */
const EXIT_MS = 800;

/**
 * A short message at the bottom of the screen with one button, that goes away by itself (a few seconds, or when the next one replaces it). It leaves with a small animation: a jump up, then down off the bottom of the screen.
 * Made here rather than taken from a package: it is one message and one action.
 *
 * It is drawn straight under <body>, not where it is used: a `fixed` box is placed against the screen only if nothing above it has a transform, filter or
 * blur, and the page has such a wrapper (an animation leaves one), which would put the toast at the bottom of the page content instead of the screen.
 */
export function Toast({ message, action, onAction, onClose, seconds = 5, warning = false }: { message: string; action?: string; onAction?: () => void; onClose: () => void; seconds?: number; /** An amber border, tint and alert icon, for something that is wrong (a limit hit) rather than something that was done. */ warning?: boolean }) {
  const [leaving, setLeaving] = useState(false);
  // A new message in the same toast starts over: it stays, and its time starts again.
  const [shown, setShown] = useState(message);
  if (shown !== message) {
    setShown(message);
    setLeaving(false);
  }
  // The latest `onClose`, so a parent that makes a new function on every render does not restart the timers below.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  // After its time the toast starts to leave, and is gone once the animation has run.
  useEffect(() => {
    const id = setTimeout(() => setLeaving(true), seconds * 1000);
    return () => clearTimeout(id);
  }, [message, seconds]);
  useEffect(() => {
    if (!leaving) return;
    const id = setTimeout(() => closeRef.current(), EXIT_MS);
    return () => clearTimeout(id);
  }, [leaving]);
  // Only ever shown after the page has loaded (a scan, a button), never during the server's render, so `document` is there.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div role="status" aria-live="polite" className={`pointer-events-none fixed inset-x-0 bottom-6 z-[95] flex justify-center px-8 sm:px-4${leaving ? " toast-out" : ""}`}>
      <div
        className={`enter-up pointer-events-auto relative flex max-w-[21rem] items-center gap-4 border py-3 pr-10 pl-4 text-sm sm:max-w-md shadow-lg ${warning ? "border-amber-500/40 bg-card bg-gradient-to-r from-amber-500/10 to-amber-500/10" : "border-border bg-card"}`}
        style={{ "--base": "0ms" } as React.CSSProperties}
      >
        {warning && <TriangleAlert className="size-4 shrink-0 text-amber-500" aria-hidden />}
        <span className="min-w-0 leading-snug">{message}</span>
        {action && onAction && (
          <button type="button" onClick={onAction} className="shrink-0 font-bold text-primary underline-offset-4 hover:underline">
            {action}
          </button>
        )}
        {/* Closes it early, with the same leaving animation as when its time runs out. */}
        <button type="button" onClick={() => setLeaving(true)} aria-label="Close" className="absolute top-1.5 right-1.5 inline-flex size-6 items-center justify-center text-muted-foreground transition-colors hover:text-foreground">
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
    </div>,
    document.body,
  );
}
