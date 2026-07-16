"use client";

import { useEffect, useState, useRef } from "react";
import { useOfflineStore } from "@/store/offlineStore";
import { queueDB } from "@/lib/offline/queue";
import { photosDB as woPhotosDB } from "@/lib/offline/photos";
import { photosDB as offlinePhotosDB } from "@/lib/offline/db";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Wifi, WifiOff, Upload, Check } from "lucide-react";
import { cn } from "@/lib/utils";

async function getPendingCount() {
  const queue = await queueDB.getAll();
  const [woPhotos, offlinePhotos] = await Promise.all([
    woPhotosDB.getUnuploaded(),
    offlinePhotosDB.getUnsynced(),
  ]);
  return queue.length + woPhotos.length + offlinePhotos.length;
}

type SyncStatusBannerProps = {
  /** When true (default), banner sticks at top of viewport. Parent layout may pass false. */
  sticky?: boolean;
};

export function SyncStatusBanner({ sticky = true }: SyncStatusBannerProps) {
  const { isOnline, sync, isSyncing } = useOfflineStore();
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [showBanner, setShowBanner] = useState(false);

  const isMountedRef = useRef(true);

  useEffect(() => {
    const loadPendingCount = async () => {
      try {
        const count = await getPendingCount();
        if (isMountedRef.current) {
          setPendingCount(count);
        }
      } catch (error) {
        console.error("Failed to load pending count:", error);
      }
    };

    isMountedRef.current = true;
    loadPendingCount();

    const interval = setInterval(loadPendingCount, 10000);
    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    setShowBanner(!isOnline || pendingCount > 0);
  }, [isOnline, pendingCount]);

  const loadPendingCount = async () => {
    try {
      const count = await getPendingCount();
      if (isMountedRef.current) {
        setPendingCount(count);
      }
    } catch (error) {
      console.error("Failed to load pending count:", error);
    }
  };

  const handleSync = async () => {
    if (!isOnline || isSyncing) return;

    try {
      await sync();
      setLastSync(new Date());
      await loadPendingCount();
    } catch (error) {
      console.error("Sync failed:", error);
    }
  };

  if (!showBanner) return null;

  return (
    <div
      className={cn(
        "border-b transition-colors",
        sticky && "sticky top-0 z-50",
        isOnline
          ? "border-warning/20 bg-primary/10 dark:border-warning/30 dark:bg-warning/15"
          : "border-warning/20 bg-warning/10 dark:border-warning/30 dark:bg-warning/15"
      )}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {isOnline ? (
            <>
              <Wifi className="h-4 w-4 flex-shrink-0 text-primary" />
              <span className="text-sm font-medium text-warning">Online</span>
            </>
          ) : (
            <>
              <WifiOff className="h-4 w-4 flex-shrink-0 text-warning" />
              <span className="text-sm font-medium text-warning">Offline</span>
            </>
          )}

          {pendingCount > 0 && (
            <Badge
              variant="outline"
              className="ml-2 border-warning/40 bg-warning/15 text-xs text-warning"
            >
              <Upload className="mr-1 h-3 w-3" />
              {pendingCount} pending
            </Badge>
          )}
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          {lastSync && (
            <div className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
              <Check className="h-3 w-3" />
              <span>
                {new Date(lastSync).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          )}

          {isOnline && pendingCount > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleSync}
              disabled={isSyncing}
              className="h-7 border-warning/40 text-xs hover:bg-warning/15"
            >
              <RefreshCw className={cn("mr-1 h-3 w-3", isSyncing && "animate-spin")} />
              {isSyncing ? "Syncing..." : "Sync Now"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
