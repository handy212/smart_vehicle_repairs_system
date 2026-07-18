import * as React from "react";
import { cn } from "@/lib/utils/cn";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "success" | "warning" | "danger" | "destructive" | "info" | "secondary" | "outline";
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "default", ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold transition-colors",
          {
            // Soft tokens (not bg-*/15) keep status text readable when opacity
            // modifiers fall back to the solid brand color.
            "bg-[var(--primary-soft)] text-primary border border-[var(--primary-soft-border)]":
              variant === "default",
            "bg-[var(--success-soft)] text-success border border-[var(--success-soft-border)]":
              variant === "success",
            "bg-[var(--warning-soft)] text-warning border border-[var(--warning-soft-border)]":
              variant === "warning",
            "bg-[var(--destructive-soft)] text-destructive border border-[var(--destructive-soft-border)]":
              variant === "danger" || variant === "destructive",
            "bg-[var(--info-soft)] text-info border border-[var(--info-soft-border)]":
              variant === "info",
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
