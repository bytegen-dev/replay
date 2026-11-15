import { Skeleton } from "@/components/ui/skeleton";

function FieldSkeleton({ className }: { className?: string }) {
  return (
    <div className={className}>
      <Skeleton className="mb-1.5 h-4 w-24 rounded-none bg-foreground/10" />
      <Skeleton className="h-11 rounded-none bg-foreground/12 sm:h-10" />
    </div>
  );
}

export function ParametersFormSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-4" aria-hidden>
      <FieldSkeleton className="min-[480px]:col-span-2" />
      <FieldSkeleton />
      <FieldSkeleton />
      <FieldSkeleton />
      <FieldSkeleton />
      <FieldSkeleton className="min-[480px]:col-span-2" />
      <div className="flex flex-col gap-1.5 min-[480px]:col-span-2 lg:col-span-3">
        <Skeleton className="h-4 w-48 rounded-none bg-foreground/10" />
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-11 rounded-none bg-foreground/10 sm:h-9" />
          ))}
        </div>
      </div>
      <Skeleton className="h-11 rounded-none bg-foreground/15 sm:h-10 min-[480px]:col-span-2 lg:col-span-1" />
    </div>
  );
}

export function ResultsLoadingSkeleton() {
  return (
    <div className="flex flex-col gap-6 sm:gap-8" role="status" aria-live="polite" aria-label="Loading results">
      <div className="space-y-4 border border-border bg-card p-4 sm:p-6">
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-7 w-32 rounded-none bg-foreground/12" />
          <Skeleton className="h-7 w-20 rounded-none bg-foreground/10" />
          <Skeleton className="h-7 w-36 rounded-none bg-foreground/10" />
        </div>
        <Skeleton className="h-16 w-full max-w-2xl rounded-none bg-foreground/10" />
      </div>
      <div className="grid grid-cols-1 gap-px border border-border bg-border min-[400px]:grid-cols-2 sm:grid-cols-4 lg:grid-cols-7">
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} className="h-20 rounded-none bg-card" />
        ))}
      </div>
      <div className="flex flex-col gap-3 md:hidden">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-44 rounded-none bg-foreground/8" />
        ))}
      </div>
      <div className="hidden flex-col gap-2 md:flex">
        <Skeleton className="h-10 w-full rounded-none bg-foreground/10" />
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-10 rounded-none bg-foreground/8" />
        ))}
      </div>
    </div>
  );
}