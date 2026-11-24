"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { MarkLoader } from "@/components/MarkLoader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * "Drop your email and we'll tell you when it's ready": one box and a button that save the address to the update list (`/api/subscribe`, which checks the
 * address, limits how often one visitor can try, and answers the same whether or not the address was already there). The server's own words are shown when it
 * says no, since they say what to do ("Enter a valid email address…", "Try again in a few minutes").
 */
export function NotifyForm({ className }: { className?: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "sending" || !email.trim()) return;
    setStatus("sending");
    setMessage("");
    try {
      const res = await fetch("/api/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: email.trim() }) });
      if (res.ok) {
        setStatus("done");
        return;
      }
      const j = (await res.json().catch(() => null)) as { error?: unknown } | null;
      setStatus("error");
      setMessage(typeof j?.error === "string" ? j.error : "Couldn't save your address. Try again shortly.");
    } catch {
      setStatus("error");
      setMessage("Couldn't reach the server. Check your connection and try again.");
    }
  }

  if (status === "done") {
    return (
      <p role="status" className={`flex max-w-xl items-start gap-2.5 border border-primary/50 bg-primary/10 px-4 py-3 text-sm leading-relaxed ${className ?? ""}`}>
        <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <span>Thanks. We&rsquo;ll email you as soon as it&rsquo;s ready.</span>
      </p>
    );
  }

  return (
    <form onSubmit={submit} noValidate className={`flex max-w-xl flex-col gap-3 ${className ?? ""}`}>
      <Label htmlFor="notify-email" className="sr-only">
        Email address
      </Label>
      <div className="flex">
        {/* The box and the button meet with no gap, as in the wallet form: the box has its bottom-left corner cut, the button its top-right. */}
        <div className="cut-bl h-11 min-w-0 flex-1 sm:h-12">
          <Input
            id="notify-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="off"
            spellCheck={false}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (status === "error") setStatus("idle");
            }}
            placeholder="you@example.com"
            aria-invalid={status === "error"}
            aria-describedby={status === "error" ? "notify-error" : undefined}
            className="h-full w-full rounded-none border-0 bg-transparent px-3 text-sm shadow-none focus-visible:ring-0 aria-invalid:ring-0 dark:aria-invalid:ring-0"
          />
        </div>
        <Button type="submit" disabled={status === "sending" || !email.trim()} className="cut-tr cut-primary h-11 shrink-0 gap-2 rounded-none border-0 px-5 text-sm font-bold text-primary-foreground sm:h-12 sm:px-7 sm:text-base">
          {status === "sending" && <MarkLoader className="size-4" />}
          {status === "sending" ? "Saving" : "Notify me"}
        </Button>
      </div>
      {status === "error" && (
        <p id="notify-error" role="alert" className="text-sm font-bold">
          {message}
        </p>
      )}
    </form>
  );
}
