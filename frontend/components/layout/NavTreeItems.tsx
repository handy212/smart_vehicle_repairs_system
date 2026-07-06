"use client";

import { cn } from "@/lib/utils/cn";

interface NavTreeItemsProps {
  children: React.ReactNode;
  className?: string;
}

/** Vertical guide + branch lines so child links read as a tree under the category */
export function NavTreeItems({ children, className }: NavTreeItemsProps) {
  return (
    <div
      className={cn(
        "relative ml-5 border-l-2 border-border/50 pl-4 pt-1.5 pb-2 space-y-1",
        className
      )}
    >
      {children}
    </div>
  );
}

interface NavTreeItemProps {
  children: React.ReactNode;
  className?: string;
}

export function NavTreeItem({ children, className }: NavTreeItemProps) {
  return (
    <div className={cn("relative", className)}>
      <span
        className="pointer-events-none absolute -left-4 top-1/2 h-px w-3.5 bg-border/50"
        aria-hidden
      />
      {children}
    </div>
  );
}
