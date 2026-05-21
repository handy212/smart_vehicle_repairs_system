import { Skeleton } from "@/components/ui/skeleton";

export default function WorkOrderDetailSkeleton() {
  return (
    <div className="space-y-4">
      <div className="sticky top-0 -mx-4 border-b border-border bg-background px-4 py-3 sm:-mx-6 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Skeleton className="h-8 w-8 shrink-0" />
            <div className="min-w-0 space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-64 max-w-full" />
            </div>
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-8" />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-2 w-full rounded-full" />
      </div>

      <div className="flex gap-2 overflow-hidden">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <Skeleton key={i} className="h-9 w-20 shrink-0" />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_18rem]">
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg lg:w-72" />
      </div>
    </div>
  );
}
