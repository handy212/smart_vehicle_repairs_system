"use client";

import React from "react";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface SortConfig {
  field: string;
  direction: "asc" | "desc" | null;
}

interface SortableHeaderProps {
  children: React.ReactNode;
  field: string;
  sortConfig: SortConfig | null;
  onSort: (field: string) => void;
  className?: string;
}

export function SortableHeader({
  children,
  field,
  sortConfig,
  onSort,
  className,
}: SortableHeaderProps) {
  const isActive = sortConfig?.field === field;
  const direction = isActive ? sortConfig.direction : null;

  const ariaSort =
    direction === "asc"
      ? "ascending"
      : direction === "desc"
        ? "descending"
        : "none";

  const sortLabel =
    direction === "asc"
      ? `${children}, sorted ascending`
      : direction === "desc"
        ? `${children}, sorted descending`
        : `${children}, sortable`;

  return (
    <th
      scope="col"
      aria-sort={ariaSort as "ascending" | "descending" | "none"}
      className={cn(
        "px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider select-none",
        className
      )}
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        className="flex w-full items-center gap-2 text-left hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded-sm"
        aria-label={sortLabel}
      >
        <span>{children}</span>
        <span className="flex-shrink-0" aria-hidden>
          {direction === "asc" ? (
            <ArrowUp className="w-4 h-4 text-foreground" />
          ) : direction === "desc" ? (
            <ArrowDown className="w-4 h-4 text-foreground" />
          ) : (
            <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
          )}
        </span>
      </button>
    </th>
  );
}
