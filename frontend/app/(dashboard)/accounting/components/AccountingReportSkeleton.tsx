import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/ui/skeleton";

interface AccountingReportSkeletonProps {
  rows?: number;
  /** Omit header placeholder for in-card / tab section loading. */
  compact?: boolean;
}

/** Skeleton for accounting report pages while data loads. */
export function AccountingReportSkeleton({
  rows = 6,
  compact = false,
}: AccountingReportSkeletonProps) {
  return (
    <div className={compact ? "py-4" : "flex flex-col gap-4 py-8"}>
      {!compact && <Skeleton className="h-8 w-56 max-w-full" />}
      <TableSkeleton rows={rows} />
    </div>
  );
}
