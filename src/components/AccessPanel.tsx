"use client";

import { Check, KeyRound } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

/** Asks the panel (mounted once, in the layout) to open. */
export const OPEN_ACCESS_EVENT = "replay:open-access";

/** Renders nothing; opens the panel when the page it sits on is shown. Used by /access-code. */
export function OpenAccessPanel() {
  useEffect(() => {
    const id = setTimeout(() => window.dispatchEvent(new Event(OPEN_ACCESS_EVENT)), 0);
    return () => clearTimeout(id);
  }, []);
  return null;
}

type Status = "loading" | "unavailable" | "locked" | "unlocked";

/**
 * Cmd+K (Ctrl+K elsewhere) opens a small panel that asks for a four-digit code. The right code lets this browser use the
 * site's own stock price key, checked on the server; nothing about the code or the key is kept in the page.
 */
export function AccessPanel() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("loading");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const openRef = useRef(false);
  /** Opening starts clean; the server is asked what this browser already has once it is open. */
  const toggle = useCallback((next: boolean) => {
    openRef.current = next;
    if (next) {
      setCode("");
      setError(null);
      setStatus("loading");
    }
    setOpen(next);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggle(!openRef.current);
      }
    };
    const onOpen = () => toggle(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_ACCESS_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_ACCESS_EVENT, onOpen);
    };
  }, [toggle]);

  useEffect(() => {
    if (!open) return;
    let stop = false;
    fetch("/api/access", { cache: "no-store" })
      .then((r) => r.json())
      .then((b: { configured?: boolean; granted?: boolean }) => {
        if (!stop) setStatus(!b.configured ? "unavailable" : b.granted ? "unlocked" : "locked");
      })
      .catch(() => {
        if (!stop) setStatus("locked");
      });
    return () => {
      stop = true;
    };
  }, [open]);

  const submit = useCallback(async (value: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/access", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: value }) });
      if (res.ok) {
        setStatus("unlocked");
      } else {
        const b = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(b?.error ?? "Something went wrong. Try again.");
        setCode("");
        input.current?.focus();
      }
    } catch {
      setError("Couldn't reach the site. Try again.");
    } finally {
      setBusy(false);
    }
  }, []);

  async function remove() {
    setBusy(true);
    await fetch("/api/access", { method: "DELETE" }).catch(() => undefined);
    setBusy(false);
    setStatus("locked");
    setCode("");
  }

  return (
    <Dialog open={open} onOpenChange={toggle}>
      <DialogContent aria-describedby="access-note" onOpenAutoFocus={(e) => { e.preventDefault(); input.current?.focus(); }}>
        <DialogTitle className="flex items-center gap-2">
          <KeyRound className="size-5" aria-hidden />
          Access code
        </DialogTitle>
        {status === "unlocked" ? (
          <>
            <DialogDescription id="access-note" className="flex items-start gap-2 text-foreground">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              This browser can use the site&apos;s stock price key when Yahoo Finance is rate limiting.
            </DialogDescription>
            <button type="button" onClick={remove} disabled={busy} className="h-10 w-fit border border-border px-4 text-sm transition-colors hover:border-primary disabled:opacity-50">
              Remove access
            </button>
          </>
        ) : status === "unavailable" ? (
          <DialogDescription id="access-note">Access codes aren&apos;t set up on this site.</DialogDescription>
        ) : (
          <>
            <DialogDescription id="access-note">Enter the four-digit code to let this browser use the site&apos;s stock price key.</DialogDescription>
            <input
              ref={input}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={code}
              disabled={busy}
              aria-label="Four-digit code"
              aria-invalid={!!error}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                setCode(v);
                setError(null);
                if (v.length === 4) void submit(v);
              }}
              className="form-control-h w-full border border-input bg-transparent px-3 text-center text-2xl tracking-[0.6em] text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="····"
            />
            {error && (
              <p role="alert" className="text-sm font-bold text-destructive">
                {error}
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
