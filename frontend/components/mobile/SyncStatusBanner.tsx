"use client";

import { useEffect, useState, useRef } from "react";
import { useOfflineStore } from "@/store/offlineStore";
import { queueDB } from "@/lib/offline/queue";
import { photosDB } from "@/lib/offline/photos";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Wifi, WifiOff, Upload, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function SyncStatusBanner() {
    const { isOnline, sync, isSyncing } = useOfflineStore();
    const [pendingCount, setPendingCount] = useState(0);
    const [lastSync, setLastSync] = useState<Date | null>(null);
    const [showBanner, setShowBanner] = useState(false);

    const isMountedRef = useRef(true);

    useEffect(() => {
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
            const queue = await queueDB.getAll();
            const photos = await photosDB.getUnuploaded();

            if (isMountedRef.current) {
                setPendingCount(queue.length + photos.length);
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
                    ? "bg-primary/10 border-orange-200 dark:bg-orange-950 dark:border-orange-800"
                    : "bg-orange-50 border-orange-200 dark:bg-orange-950 dark:border-orange-800"
            )}
        >
            <div className="px-4 py-2 flex items-center justify-between gap-3">
                {/* Left: Status */}
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    {isOnline ? (
                        <>
                            <Wifi className="h-4 w-4 text-primary flex-shrink-0" />
                            <span className="text-sm font-medium text-orange-900 dark:text-orange-200">
                                Online
                            </span>
                        </>
                    ) : (
                        <>
                            <WifiOff className="h-4 w-4 text-orange-600 dark:text-orange-400 flex-shrink-0" />
                            <span className="text-sm font-medium text-orange-900 dark:text-orange-200">
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
                                    ? "bg-orange-100 text-orange-700 border-orange-300"
                                    : "bg-orange-100 text-orange-700 border-orange-300"
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
                                    ? "border-orange-300 hover:bg-orange-100"
                                    : "border-orange-300 hover:bg-orange-100"
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
