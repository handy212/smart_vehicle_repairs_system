import { TableSkeleton } from "@/components/ui/skeleton";

export default function AccountingLoading() {
  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="space-y-2">
        <div className="h-8 w-48 rounded-md bg-muted animate-pulse" />
        <div className="h-4 w-64 rounded-md bg-muted animate-pulse" />
      </div>
      <TableSkeleton rows={8} />
    </div>
  );
}
