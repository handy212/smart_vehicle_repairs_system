import * as React from "react";
import { cn } from "@/lib/utils/cn";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "success" | "warning" | "danger" | "info" | "secondary" | "outline";
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "default", ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors",
          {
            "bg-primary/10 text-primary border border-primary/15": variant === "default",
            "bg-success/15 text-success border border-success/20": variant === "success",
            "bg-warning/15 text-warning border border-warning/20": variant === "warning",
            "bg-destructive/10 text-destructive border border-destructive/20": variant === "danger",
            "bg-info/10 text-info border border-info/20": variant === "info",
            "bg-muted text-foreground": variant === "secondary",
            "border border-border text-foreground": variant === "outline",
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
