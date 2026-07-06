import { Skeleton } from "@/components/ui/skeleton";

/** Full-page shell placeholder — prefer over centered spinners in app layouts. */
export function AppShellSkeleton() {
  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-[420px] w-full rounded-lg" />
    </div>
  );
}
