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

export function SyncStatusBanner() {
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

        // Update count every 10 seconds
        const interval = setInterval(loadPendingCount, 10000);
        return () => {
            isMountedRef.current = false;
            clearInterval(interval);
        };
    }, []);

    useEffect(() => {
        // Show banner if offline OR if there are pending changes
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
                "sticky top-0 z-50 border-b transition-colors",
                isOnline
                    ? "bg-primary/10 border-warning/20 dark:bg-warning/15 dark:border-warning/30"
                    : "bg-warning/10 border-warning/20 dark:bg-warning/15 dark:border-warning/30"
            )}
        >
            <div className="px-4 py-2 flex items-center justify-between gap-3">
                {/* Left: Status */}
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    {isOnline ? (
                        <>
                            <Wifi className="h-4 w-4 text-primary flex-shrink-0" />
                            <span className="text-sm font-medium text-warning dark:text-warning">
                                Online
                            </span>
                        </>
                    ) : (
                        <>
                            <WifiOff className="h-4 w-4 text-warning dark:text-warning flex-shrink-0" />
                            <span className="text-sm font-medium text-warning dark:text-warning">
                                Offline
                            </span>
                        </>
                    )}

                    {/* Pending Count */}
                    {pendingCount > 0 && (
                        <Badge
                            variant="outline"
                            className={cn(
                                "ml-2 text-xs",
                                isOnline
                                    ? "bg-warning/15 text-warning border-warning/40"
                                    : "bg-warning/15 text-warning border-warning/40"
                            )}
                        >
                            <Upload className="h-3 w-3 mr-1" />
                            {pendingCount} pending
                        </Badge>
                    )}
                </div>

                {/* Right: Sync Button & Last Sync */}
                <div className="flex items-center gap-2 flex-shrink-0">
                    {lastSync && (
                        <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground">
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
                            className={cn(
                                "h-7 text-xs",
                                isOnline
                                    ? "border-warning/40 hover:bg-warning/15"
                                    : "border-warning/40 hover:bg-warning/15"
                            )}
                        >
                            <RefreshCw
                                className={cn("h-3 w-3 mr-1", isSyncing && "animate-spin")}
                            />
                            {isSyncing ? "Syncing..." : "Sync Now"}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
