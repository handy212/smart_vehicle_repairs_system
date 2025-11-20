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

  return (
    <th
      className={cn(
        "px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors select-none",
        className
      )}
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-2">
        <span>{children}</span>
        <span className="flex-shrink-0">
          {direction === "asc" ? (
            <ArrowUp className="w-4 h-4 text-gray-600 dark:text-gray-300" />
          ) : direction === "desc" ? (
            <ArrowDown className="w-4 h-4 text-gray-600 dark:text-gray-300" />
          ) : (
            <ArrowUpDown className="w-4 h-4 text-gray-400 dark:text-gray-500" />
          )}
        </span>
      </div>
    </th>
  );
}

