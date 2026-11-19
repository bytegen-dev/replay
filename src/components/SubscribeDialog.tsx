"use client";

import { Check, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** The Subscribe button in the header and the box it opens: one field, one promise. */
export function SubscribeDialog() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError(null);
    try {
      const res = await fetch("/api/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `Request failed (${res.status})`);
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setState("idle");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setTimeout(() => (setState("idle"), setError(null)), 200);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="cut-btn h-10 rounded-none border-primary text-primary px-4 text-sm font-bold sm:h-11 sm:px-6 sm:text-base">
          Subscribe
        </Button>
      </DialogTrigger>
      <DialogContent>
        {state === "done" ? (
          <div className="flex flex-col gap-2 pt-2">
            <DialogTitle className="flex items-center gap-2">
              <Check className="pop-in size-5 text-primary" aria-hidden /> You&rsquo;re on the list
            </DialogTitle>
            <DialogDescription>We&rsquo;ll email {email.trim()} when Replay gets something new.</DialogDescription>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5 pr-6">
              <DialogTitle>Get notified of updates</DialogTitle>
              <DialogDescription>One email when Replay gets new features or data sources. Nothing else.</DialogDescription>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="subscribe-email" className="text-sm text-muted-foreground">
                Email
              </Label>
              <Input id="subscribe-email" type="email" inputMode="email" autoComplete="email" className="form-control-h text-sm" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!error} />
              {error && (
                <p role="alert" className="text-sm font-bold">
                  {error}
                </p>
              )}
            </div>
            <Button type="submit" disabled={state === "sending"} className="h-11 w-full gap-2 rounded-none border-2 border-primary font-bold">
              {state === "sending" && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {state === "sending" ? "Subscribing" : "Subscribe"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
