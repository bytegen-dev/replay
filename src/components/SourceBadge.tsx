import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { sourceUrl } from "@/lib/sourceLinks.ts";
import type { SourceLink } from "@/lib/types.ts";
import { cn } from "@/lib/utils";

/** The price source for a row. It opens that source in a new tab; a price typed by hand has nothing to open. */
export function SourceBadge({ source, sources, className }: { source: string; sources: SourceLink[]; className?: string }) {
  const href = sourceUrl(source, sources);
  if (!href) {
    return (
      <Badge variant="outline" className={cn("rounded-none", className)}>
        {source}
      </Badge>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" aria-label={`${source} (opens in a new tab)`} className={cn("inline-flex", className)}>
      <Badge variant="outline" className="gap-1 rounded-none transition-colors hover:border-primary hover:text-primary">
        {source}
        <ExternalLink className="size-3" aria-hidden />
      </Badge>
    </a>
  );
}
