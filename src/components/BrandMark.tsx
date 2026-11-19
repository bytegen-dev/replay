import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * The Replay mark. Its outline is white on the dark theme and near-black on the light one; both are drawn and the
 * stylesheet shows the right one (.brand-on-dark / .brand-on-light), so there is no flash when the theme changes.
 * The image is decorative (the name is written beside it), hence the empty alt text.
 */
export function BrandMark({ size, className, priority }: { size: number; className?: string; priority?: boolean }) {
  return (
    <>
      <Image src="/replay-mark.svg" alt="" width={size} height={size} unoptimized priority={priority} className={cn("brand-on-dark", className)} />
      <Image src="/replay-mark-dark.svg" alt="" width={size} height={size} unoptimized priority={priority} className={cn("brand-on-light", className)} />
    </>
  );
}
