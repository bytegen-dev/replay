"use client";

import Link from "next/link";
import { openGameFromLink } from "@/lib/viewerClient.ts";

/** A link to the game that opens it in a box over the page (a modified click still goes to /game). */
export function GameLink({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <Link href="/game" onClick={openGameFromLink} className={className}>
      {children}
    </Link>
  );
}
