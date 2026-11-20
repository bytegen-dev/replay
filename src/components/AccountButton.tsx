"use client";

import { LogOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AUTH_CHANGED_EVENT, openSignIn, useViewer } from "@/lib/viewerClient.ts";

/** In the header: "Sign in" for a visitor, and the email with a sign-out for someone signed in. Nothing for a trusted code holder who has no account. */
export function AccountButton({ className = "" }: { className?: string }) {
  const viewer = useViewer();
  const [menu, setMenu] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setMenu(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  if (!viewer || !viewer.canSignIn) return null;
  if (viewer.kind === "user" && viewer.email) {
    return (
      <div ref={box} className={`relative ${className}`}>
        <button type="button" aria-expanded={menu} onClick={() => setMenu((m) => !m)} className="max-w-40 truncate text-sm text-muted-foreground transition-colors hover:text-foreground">
          {viewer.email}
        </button>
        {menu && (
          <div className="absolute right-0 z-50 mt-2 w-48 border border-border bg-card p-2 text-sm shadow-lg">
            <button
              type="button"
              onClick={async () => {
                await fetch("/api/auth/signout", { method: "POST" });
                setMenu(false);
                window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
              }}
              className="flex w-full items-center gap-2 px-2 py-2 text-left transition-colors hover:bg-secondary"
            >
              <LogOut className="size-4" aria-hidden /> Sign out
            </button>
          </div>
        )}
      </div>
    );
  }
  if (viewer.kind === "trusted") return null;
  return (
    <button type="button" onClick={() => openSignIn()} className={`text-sm text-muted-foreground transition-colors hover:text-foreground ${className}`}>
      Sign in
    </button>
  );
}
