"use client";

import { Check, Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { MarkLoader } from "@/components/MarkLoader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { OPEN_SIGNIN_EVENT } from "@/lib/viewerClient.ts";

/** The sign-in box, mounted once for the whole site. It opens when anything calls openSignIn(). */
export function SignInDialog() {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);

  useEffect(() => {
    const onOpen = (e: Event) => {
      setReason((e as CustomEvent<{ reason?: string }>).detail?.reason ?? null);
      setState("idle");
      setError(null);
      setDevLink(null);
      setOpen(true);
    };
    window.addEventListener(OPEN_SIGNIN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_SIGNIN_EVENT, onOpen);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError(null);
    try {
      const res = await fetch("/api/auth/start", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
      const j = (await res.json().catch(() => null)) as { error?: string; devLink?: string } | null;
      if (!res.ok) throw new Error(j?.error ?? `Request failed (${res.status})`);
      setDevLink(j?.devLink ?? null);
      setState("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setState("idle");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent aria-describedby="signin-note">
        {state === "sent" ? (
          <div className="flex flex-col gap-3 pt-1">
            <DialogTitle className="flex items-center gap-2">
              <Check className="pop-in size-5 text-primary" aria-hidden /> Check your email
            </DialogTitle>
            <DialogDescription id="signin-note">We sent a sign-in link to {email.trim()}. It works once and expires in 15 minutes.</DialogDescription>
            {devLink && (
              <a href={devLink} className="w-fit text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
                Development: open the link here
              </a>
            )}
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5 pr-6">
              <DialogTitle className="flex items-center gap-2">
                <Mail className="size-5" aria-hidden /> Sign in
              </DialogTitle>
              <DialogDescription id="signin-note">{reason ?? "No password. We email you a link that signs you in, and you get more checks each day."}</DialogDescription>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="signin-email" className="text-sm text-muted-foreground">
                Email
              </label>
              <div className="flex gap-2">
                <Input id="signin-email" type="email" inputMode="email" autoComplete="email" autoFocus className="form-control-h min-w-0 flex-1 text-sm" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!error} />
                <Button type="submit" disabled={state === "sending"} className="form-control-h shrink-0 gap-2 rounded-none border-2 border-primary px-4 text-sm font-bold">
                  {state === "sending" && <MarkLoader className="size-4" />}
                  {state === "sending" ? "Sending" : "Send link"}
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
