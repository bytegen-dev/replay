import type { Metadata } from "next";
import { Suspense } from "react";
import { ConfirmSignIn } from "@/components/ConfirmSignIn";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = { title: { absolute: "Sign in" }, robots: { index: false, follow: false } };

export default function ConfirmPage() {
  return (
    <div className="flex min-h-dvh w-full flex-1 flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
        <Suspense fallback={null}>
          <ConfirmSignIn />
        </Suspense>
      </main>
    </div>
  );
}
