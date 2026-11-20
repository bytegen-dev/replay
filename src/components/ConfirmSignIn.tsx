"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AUTH_CHANGED_EVENT } from "@/lib/viewerClient.ts";

/** The page a sign-in link opens. One button finishes the sign-in, so an email scanner that only opens the link can't use it up. */
export function ConfirmSignIn() {
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = useState<"idle" | "working" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");

  async function go() {
    setState("working");
    setError(null);
    try {
      const res = await fetch("/api/auth/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
      const j = (await res.json().catch(() => null)) as { error?: string; email?: string } | null;
      if (!res.ok) throw new Error(j?.error ?? "That didn't work.");
      setEmail(j?.email ?? "");
      setState("done");
      window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
      setState("idle");
    }
  }

  if (state === "done") {
    return (
      <div className="mx-auto flex w-full max-w-sm flex-col gap-3 border border-border bg-card p-5 sm:p-6">
        <h1 className="flex items-center gap-2 text-lg font-bold tracking-tight">
          <Check className="size-5 text-primary" aria-hidden /> You&rsquo;re signed in
        </h1>
        <p className="text-sm text-muted-foreground">{email ? `Signed in as ${email}.` : "Signed in."}</p>
        <Link href="/" className="h-10 content-center border-2 border-primary text-center text-sm font-bold">
          Back to Replay
        </Link>
      </div>
    );
  }
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4 border border-border bg-card p-5 sm:p-6">
      <h1 className="text-lg font-bold tracking-tight">Sign in to Replay</h1>
      <p className="text-sm text-muted-foreground">One click finishes signing in on this browser.</p>
      {error && (
        <p role="alert" className="text-sm font-bold text-destructive">
          {error}
        </p>
      )}
      <Button type="button" onClick={go} disabled={state === "working" || !token} className="form-control-h rounded-none border-2 border-primary font-bold">
        {state === "working" ? "Signing in" : "Sign in"}
      </Button>
    </div>
  );
}
