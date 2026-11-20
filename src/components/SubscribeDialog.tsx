"use client";

import { Check } from "lucide-react";
import { MarkLoader } from "@/components/MarkLoader";
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
              <div className="flex">
                {/* The email box and the button meet with no gap: the box has its bottom-left corner cut, the button its top-right. */}
                <div className="cut-bl h-10 min-w-0 flex-1">
                  <Input id="subscribe-email" type="email" inputMode="email" autoComplete="email" className="h-full w-full rounded-none border-0 bg-transparent px-3 text-sm shadow-none focus-visible:ring-0" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!error} />
                </div>
                <Button type="submit" disabled={state === "sending"} className="cut-tr cut-primary h-10 shrink-0 gap-2 rounded-none border-0 px-4 text-sm font-bold text-primary-foreground">
                  {state === "sending" && <MarkLoader className="size-4" />}
                  {state === "sending" ? "Subscribing" : "Subscribe"}
                </Button>
              </div>
              {error && (
                <p role="alert" className="text-sm font-bold">
                  {error}
                </p>
              )}
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
