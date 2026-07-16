"use client";

import { useOfflineStore } from "@/store/offlineStore";
import { WifiOff } from "lucide-react";

type OfflineIndicatorProps = {
  /**
   * Legacy Sync button in the header. Prefer SyncStatusBanner for Sync Now.
   * @default false
   */
  showSync?: boolean;
};

/**
 * Compact offline glyph for the app header.
 * Sync CTA lives on SyncStatusBanner to avoid duplicate controls.
 */
export function OfflineIndicator({ showSync: _showSync = false }: OfflineIndicatorProps) {
  const { isOnline } = useOfflineStore();

  if (isOnline) {
    return null;
  }

  return (
    <div
      className="flex items-center gap-1 px-1 text-xs text-warning"
      title="You are offline"
      aria-label="Offline"
    >
      <WifiOff className="h-4 w-4" />
      <span className="sr-only sm:not-sr-only sm:inline">Offline</span>
    </div>
  );
}
