import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SharedResult } from "@/components/SharedResult";
import { Skeleton } from "@/components/ui/skeleton";
import { isShareId } from "@/lib/share.ts";
import { getShare, ShareUnavailable } from "@/lib/shareStore.ts";

// Unlisted: the link is the access control, so keep it out of search results.
export const metadata: Metadata = {
  title: "Shared result",
  robots: { index: false, follow: false },
};

async function Result({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isShareId(id)) notFound();
  let data = null;
  try {
    data = await getShare(id);
  } catch (e) {
    if (e instanceof ShareUnavailable) {
      return <p className="border border-border p-4 text-sm">Sharing is not set up on this site yet.</p>;
    }
    throw e;
  }
  if (!data) notFound();
  return <SharedResult data={data} />;
}

export default function SharedPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div className="flex min-h-dvh w-full flex-1 flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/dca-logo.png" alt="" width={40} height={40} className="size-10 shrink-0 object-contain" />
            <span className="text-xl font-bold tracking-tight">DCA Checker</span>
          </Link>
          <Link href="/" className="ml-auto text-sm underline underline-offset-4">
            Check your own
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
        <p className="mb-6 text-sm text-muted-foreground">A saved result, shown exactly as it was when it was shared.</p>
        <Suspense fallback={<Skeleton className="h-64 w-full rounded-none" />}>
          <Result params={params} />
        </Suspense>
      </main>
      <footer className="border-t border-border py-5">
        <p className="mx-auto w-full max-w-6xl px-4 text-xs text-muted-foreground sm:px-6">Historical prices are indicative only. Not financial advice.</p>
      </footer>
    </div>
  );
}
