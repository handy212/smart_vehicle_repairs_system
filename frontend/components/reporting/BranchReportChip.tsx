"use client";

import { useBranchStore } from "@/store/branchStore";

export function BranchReportChip() {
  const { activeBranchId, activeBranch } = useBranchStore();
  if (!activeBranchId) {
    return (
      <span className="text-xs rounded-full bg-muted px-3 py-1 text-muted-foreground">
        All branches (consolidated)
      </span>
    );
  }
  const name = activeBranch?.name ?? `Branch #${activeBranchId}`;
  return (
    <span className="text-xs rounded-full bg-primary/10 text-primary px-3 py-1">
      Viewing: {name}
    </span>
  );
}
