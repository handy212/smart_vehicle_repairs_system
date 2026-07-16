"use client";

import Link from "next/link";
import { AlertCircle, UserCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DuplicateCustomerMatch } from "@/lib/utils/duplicate-customer";

interface DuplicateCustomerBannerProps {
  match: DuplicateCustomerMatch;
  onUseExisting: () => void;
  onDismiss?: () => void;
  compact?: boolean;
  viewHref?: string;
}

export function DuplicateCustomerBanner({
  match,
  onUseExisting,
  onDismiss,
  compact = false,
  viewHref,
}: DuplicateCustomerBannerProps) {
  return (
    <div
      role="alert"
      className="flex flex-col sm:flex-row sm:items-start gap-3 p-4 rounded-lg bg-warning/10 border border-warning/25"
    >
      <AlertCircle className="h-5 w-5 text-warning shrink-0 mt-0.5" aria-hidden="true" />
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-sm font-medium text-foreground">Customer already exists</p>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{match.displayName}</span>
          {match.email ? ` (${match.email})` : ""} is already in the system.
        </p>
        {!compact && (
          <p className="text-xs text-muted-foreground">
            Use the existing record to avoid duplicates.
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <Button type="button" size="sm" onClick={onUseExisting}>
          <UserCheck className="h-4 w-4 mr-1.5" aria-hidden="true" />
          Use existing
        </Button>
        {viewHref && (
          <Button type="button" size="sm" variant="outline" asChild>
            <Link href={viewHref}>View profile</Link>
          </Button>
        )}
        {onDismiss && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            aria-label="Dismiss"
            onClick={onDismiss}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
