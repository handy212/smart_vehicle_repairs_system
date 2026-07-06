"use client";

import { QboSyncBadge } from "@/components/integrations/QboSyncBadge";
import { cn } from "@/lib/utils/cn";

export interface QboListCellProps {
  status?: string | null;
  error?: string | null;
  connected?: boolean;
  connectionIssue?: string | null;
  onRetry?: () => void;
  isRetrying?: boolean;
  className?: string;
}

/** Compact QBO sync status for AP list tables. */
export function QboListCell({
  status,
  error,
  connected = false,
  connectionIssue = null,
  onRetry,
  isRetrying = false,
  className,
}: QboListCellProps) {
  if (!connected) {
    return <span className={cn("text-xs text-muted-foreground", className)}>—</span>;
  }

  return (
    <div className={cn("min-w-[88px]", className)} onClick={(event) => event.stopPropagation()}>
      <QboSyncBadge
        status={status ?? "un-synced"}
        error={error}
        connected={connected}
        connectionIssue={connectionIssue}
        compact
        showLabel={false}
        onRetry={onRetry}
        isRetrying={isRetrying}
        retryLabel="Push"
      />
    </div>
  );
}
