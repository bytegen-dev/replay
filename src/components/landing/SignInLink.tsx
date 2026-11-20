"use client";

import { openSignIn } from "@/lib/viewerClient.ts";

/** A text link that opens the sign-in box. */
export function SignInLink() {
  return (
    <button type="button" onClick={() => openSignIn()} className="w-fit text-sm underline underline-offset-4 transition-colors hover:text-primary">
      Sign in with your email
    </button>
  );
}
