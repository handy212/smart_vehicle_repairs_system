"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  /** Optional in-page title (not a second sticky header) */
  title?: string;
  /** Optional subtitle under title */
  description?: string;
  /** Back link href — renders a compact back control above the title */
  backHref?: string;
  backLabel?: string;
  /** Right-side actions next to the title row */
  actions?: React.ReactNode;
};

export function MobilePageShell({
  children,
  className,
  withActionBar = false,
  compact = false,
  title,
  description,
  backHref,
  backLabel = "Back",
  actions,
}: MobilePageShellProps) {
  const showChrome = Boolean(title || backHref || actions);

  return (
    <div
      className={cn(
        "mx-auto w-full max-w-md",
        compact ? "px-3 py-3" : "px-4 py-4",
        withActionBar && "pb-32",
        className
      )}
    >
      {showChrome && (
        <div className="mb-4 space-y-1">
          {backHref && (
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2 h-8 w-fit px-2 text-muted-foreground hover:text-foreground"
              asChild
            >
              <Link href={backHref}>
                <ArrowLeft className="mr-1 h-4 w-4" />
                {backLabel}
              </Link>
            </Button>
          )}
          {(title || actions) && (
            <div className="flex items-start justify-between gap-3">
              {title ? (
                <div className="min-w-0">
                  <h1 className="text-xl font-bold tracking-tight text-foreground">{title}</h1>
                  {description ? (
                    <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
                  ) : null}
                </div>
              ) : (
                <div />
              )}
              {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
            </div>
          )}
        </div>
      )}
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
