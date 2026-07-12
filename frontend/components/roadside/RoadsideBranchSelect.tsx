"use client";

import { useQuery } from "@tanstack/react-query";
import { branchesApi, type Branch } from "@/lib/api/branches";
import { formatBranchLocation } from "@/lib/constants/ghana-regions";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils/cn";
import { Building2, Loader2 } from "lucide-react";

type RoadsideBranchSelectProps = {
  value?: number;
  onChange: (branchId: number) => void;
  error?: string;
  disabled?: boolean;
  description?: string;
  /** Compact row for side-by-side layout with location fields */
  variant?: "default" | "inline";
  className?: string;
  id?: string;
};

function formatBranchLabel(branch: Branch): string {
  const location = formatBranchLocation(branch);
  if (location) {
    return `${branch.name} (${location})`;
  }
  return branch.name;
}

export function RoadsideBranchSelect({
  value,
  onChange,
  error,
  disabled,
  description,
  variant = "default",
  className,
  id = "roadside-branch",
}: RoadsideBranchSelectProps) {
  const { data: branches = [], isLoading, isError } = useQuery({
    queryKey: ["branches", "roadside-active"],
    queryFn: () => branchesApi.list({ is_active: true }),
    staleTime: 5 * 60 * 1000,
  });

  const selectEl = (
    <div className="relative">
      {isLoading && (
        <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground pointer-events-none" />
      )}
      <select
        id={id}
        value={value ?? ""}
        disabled={disabled || isLoading}
        onChange={(e) => {
          const parsed = parseInt(e.target.value, 10);
          if (!Number.isNaN(parsed)) {
            onChange(parsed);
          }
        }}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          error ? "border-destructive" : ""
        )}
      >
        <option value="">
          {isLoading ? "Loading branches…" : "Select branch"}
        </option>
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {formatBranchLabel(branch)}
            {branch.is_headquarters ? " · HQ" : ""}
          </option>
        ))}
      </select>
    </div>
  );

  const emptyMessage =
    !isLoading && (isError || branches.length === 0) ? (
      <p className="text-xs text-destructive">
        {isError
          ? "Could not load branches. Refresh the page or contact support."
          : "No active branches are available. Contact support."}
      </p>
    ) : null;

  if (variant === "inline") {
    return (
      <div className={cn("space-y-1.5", className)}>
        <Label htmlFor={id} className="text-sm font-medium flex items-center gap-1.5">
          <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          Service branch *
        </Label>
        {selectEl}
        {emptyMessage}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id} className="flex items-center gap-1.5">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        Service branch *
      </Label>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      {selectEl}
      {emptyMessage}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
