"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { Database } from "lucide-react";

export type QboSyncStatus = string | null | undefined;

function badgeVariantForStatus(status: QboSyncStatus): "success" | "danger" | "secondary" {
  if (status === "synced") return "success";
  if (status === "failed") return "danger";
  return "secondary";
}

export interface QboSyncBadgeProps {
  status?: QboSyncStatus;
  error?: string | null;
  connected?: boolean;
  /** When linked but API session is down — show reconnect guidance instead of retry. */
  connectionIssue?: string | null;
  className?: string;
  showLabel?: boolean;
  onRetry?: () => void;
  onClearMapping?: () => void;
  isRetrying?: boolean;
  isClearing?: boolean;
  retryLabel?: string;
  clearLabel?: string;
  compact?: boolean;
}

export function QboSyncBadge({
  status,
  error,
  connected = true,
  connectionIssue = null,
  className,
  showLabel = true,
  onRetry,
  onClearMapping,
  isRetrying = false,
  isClearing = false,
  retryLabel = "Retry QBO sync",
  clearLabel = "Clear link",
  compact = false,
}: QboSyncBadgeProps) {
  if (!connected) return null;

  if (connectionIssue) {
    return (
      <div className={cn("flex flex-col gap-1", className)}>
        <Badge variant="secondary" className="capitalize">
          {showLabel ? "QBO: session expired" : "session expired"}
        </Badge>
        <p className={cn("text-amber-700 dark:text-amber-400", compact ? "text-[11px] line-clamp-3" : "text-xs")}>
          {connectionIssue}
        </p>
      </div>
    );
  }

  const normalizedStatus = status ?? "un-synced";

  const showRetry =
    Boolean(onRetry) &&
    (normalizedStatus === "failed" ||
      normalizedStatus === "pending" ||
      normalizedStatus === "un-synced");

  const showClear =
    Boolean(onClearMapping) &&
    (normalizedStatus === "failed" || normalizedStatus === "synced");

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className={cn("flex flex-wrap items-center gap-2", compact && "gap-1.5")}>
        <Badge variant={badgeVariantForStatus(normalizedStatus)} className="capitalize">
          {showLabel ? `QBO: ${normalizedStatus.replace(/_/g, " ")}` : normalizedStatus.replace(/_/g, " ")}
        </Badge>
        {showClear ? (
          <Button
            type="button"
            variant="ghost"
            size={compact ? "sm" : "sm"}
            onClick={onClearMapping}
            disabled={isClearing || isRetrying}
            className={compact ? "h-7 text-xs" : undefined}
          >
            {isClearing ? "Clearing…" : clearLabel}
          </Button>
        ) : null}
        {showRetry ? (
          <Button
            type="button"
            variant="outline"
            size={compact ? "sm" : "sm"}
            onClick={onRetry}
            disabled={isRetrying}
            className={compact ? "h-7 text-xs" : undefined}
          >
            <Database className={cn("mr-2 h-4 w-4", isRetrying && "animate-spin", compact && "mr-1 h-3 w-3")} />
            {isRetrying ? "Syncing…" : retryLabel}
          </Button>
        ) : null}
      </div>
      {normalizedStatus === "failed" && error ? (
        <p className={cn("text-destructive", compact ? "text-[11px] line-clamp-2" : "text-xs")}>
          QuickBooks sync failed: {error}
        </p>
      ) : null}
      {normalizedStatus === "pending" ? (
        <p className={cn("text-muted-foreground", compact ? "text-[11px] line-clamp-2" : "text-xs")}>
          {error ? `Sync stalled: ${error}` : "Queued for QuickBooks sync…"}
        </p>
      ) : null}
    </div>
  );
}
