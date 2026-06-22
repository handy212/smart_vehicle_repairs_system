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
  className?: string;
  showLabel?: boolean;
  onRetry?: () => void;
  isRetrying?: boolean;
  retryLabel?: string;
  compact?: boolean;
}

export function QboSyncBadge({
  status,
  error,
  connected = true,
  className,
  showLabel = true,
  onRetry,
  isRetrying = false,
  retryLabel = "Retry QBO sync",
  compact = false,
}: QboSyncBadgeProps) {
  if (!connected || !status) return null;

  const showRetry =
    Boolean(onRetry) && (status === "failed" || status === "pending" || status === "un-synced");

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className={cn("flex flex-wrap items-center gap-2", compact && "gap-1.5")}>
        <Badge variant={badgeVariantForStatus(status)} className="capitalize">
          {showLabel ? `QBO: ${status.replace(/_/g, " ")}` : status.replace(/_/g, " ")}
        </Badge>
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
      {status === "failed" && error ? (
        <p className={cn("text-destructive", compact ? "text-[11px] line-clamp-2" : "text-xs")}>
          QuickBooks sync failed: {error}
        </p>
      ) : null}
    </div>
  );
}
