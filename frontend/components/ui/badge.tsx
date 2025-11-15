import * as React from "react";
import { cn } from "@/lib/utils/cn";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "success" | "warning" | "danger" | "info" | "secondary";
}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant = "default", ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors",
          {
            "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300": variant === "default",
            "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300": variant === "success",
            "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300": variant === "warning",
            "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300": variant === "danger",
            "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-800 dark:text-cyan-300": variant === "info",
            "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-300": variant === "secondary",
          },
          className
        )}
        {...props}
      />
    );
  }
);
Badge.displayName = "Badge";

export { Badge };

