"use client";

import { useOfflineStore } from "@/store/offlineStore";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Wifi, WifiOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function OfflineIndicator() {
  const { isOnline, hasUnsyncedData, isSyncing, sync } = useOfflineStore();

  if (isOnline && !hasUnsyncedData) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      {!isOnline && (
        <div className="flex items-center gap-1 text-xs text-warning dark:text-orange-400">
          <WifiOff className="h-4 w-4" />
          <span className="hidden sm:inline">Offline</span>
        </div>
      )}
      {hasUnsyncedData && isOnline && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => sync()}
          disabled={isSyncing}
          className="h-7 px-2 text-xs"
        >
          <RefreshCw
            className={cn("h-3 w-3 mr-1", isSyncing && "animate-spin")}
          />
          <span className="hidden sm:inline">Sync</span>
        </Button>
      )}
    </div>
  );
}
