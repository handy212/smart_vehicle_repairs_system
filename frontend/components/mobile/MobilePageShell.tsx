"use client";

import { cn } from "@/lib/utils";

/** Bottom nav is h-16; action bars sit above it. */
export const MOBILE_NAV_HEIGHT = "4rem";

type MobilePageShellProps = {
  children: React.ReactNode;
  className?: string;
  /** Extra bottom padding when a sticky action bar is shown above the nav */
  withActionBar?: boolean;
  /** Tighter top padding under the app header */
  compact?: boolean;
};

export function MobilePageShell({
  children,
  className,
  withActionBar = false,
  compact = false,
}: MobilePageShellProps) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-md",
        compact ? "px-3 py-3" : "px-4 py-4",
        /* Extra space above sticky trip action bar (nav padding is on layout <main>) */
        withActionBar && "pb-32",
        className
      )}
    >
      {children}
    </div>
  );
}

type MobileStickyActionBarProps = {
  children: React.ReactNode;
  className?: string;
};

/** Pins content above the bottom tab bar (not behind it). */
export function MobileStickyActionBar({ children, className }: MobileStickyActionBarProps) {
  return (
    <div
      className={cn(
        "fixed left-0 right-0 z-30 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/90",
        "bottom-[calc(4rem+env(safe-area-inset-bottom,0px))]",
        className
      )}
    >
      <div className="mx-auto max-w-md px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
        {children}
      </div>
    </div>
  );
}
