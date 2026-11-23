"use client";

import { useEffect } from "react";

/**
 * A short message at the bottom of the screen with one button, that goes away by itself (a few seconds, or when the next one replaces it).
 * Made here rather than taken from a package: it is one message and one action.
 */
export function Toast({ message, action, onAction, onClose, seconds = 5 }: { message: string; action?: string; onAction?: () => void; onClose: () => void; seconds?: number }) {
  useEffect(() => {
    const id = setTimeout(onClose, seconds * 1000);
    return () => clearTimeout(id);
  }, [message, seconds, onClose]);
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-[95] flex justify-center px-4">
      <div className="enter-up pointer-events-auto flex max-w-md items-center gap-4 border border-border bg-card px-4 py-3 text-sm shadow-lg" style={{ "--base": "0ms" } as React.CSSProperties}>
        <span className="min-w-0 truncate">{message}</span>
        {action && onAction && (
          <button type="button" onClick={onAction} className="shrink-0 font-bold text-primary underline-offset-4 hover:underline">
            {action}
          </button>
        )}
      </div>
    </div>
  );
}
