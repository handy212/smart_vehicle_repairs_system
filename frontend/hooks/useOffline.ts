"use client";

import { useEffect, useState, useCallback } from 'react';
import { getSyncStatus, syncAll } from '@/lib/offline/sync';

export interface OfflineState {
  isOnline: boolean;
  hasUnsyncedData: boolean;
  unsyncedCounts: {
    workOrders: number;
    inspections: number;
    timeLogs: number;
    photos: number;
  };
  queueStats: {
    total: number;
    pending: number;
    failed: number;
  };
  isSyncing: boolean;
  lastSyncTime: number | null;
}

export function useOffline() {
  const [state, setState] = useState<OfflineState>({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    hasUnsyncedData: false,
    unsyncedCounts: {
      workOrders: 0,
      inspections: 0,
      timeLogs: 0,
      photos: 0,
    },
    queueStats: {
      total: 0,
      pending: 0,
      failed: 0,
    },
    isSyncing: false,
    lastSyncTime: null,
  });

  const updateSyncStatus = useCallback(async () => {
    try {
      const status = await getSyncStatus();
      setState((prev) => ({
        ...prev,
        hasUnsyncedData: status.hasUnsyncedData,
        unsyncedCounts: status.unsyncedCounts,
        queueStats: status.queueStats,
      }));
    } catch (error) {
      console.error('[useOffline] Failed to get sync status:', error);
    }
  }, []);

  const sync = useCallback(async () => {
    if (state.isSyncing || !state.isOnline) {
      return;
    }

    setState((prev) => ({ ...prev, isSyncing: true }));

    try {
      const result = await syncAll();
      setState((prev) => ({
        ...prev,
        isSyncing: false,
        lastSyncTime: Date.now(),
      }));

      // Update status after sync
      await updateSyncStatus();

      return result;
    } catch (error) {
      console.error('[useOffline] Sync failed:', error);
      setState((prev) => ({ ...prev, isSyncing: false }));
      throw error;
    }
  }, [state.isSyncing, state.isOnline, updateSyncStatus]);

  useEffect(() => {
    // Initial status check
    updateSyncStatus();

    // Listen for online/offline events
    const handleOnline = () => {
      setState((prev) => ({ ...prev, isOnline: true }));
      // Auto-sync when coming back online
      sync();
    };

    const handleOffline = () => {
      setState((prev) => ({ ...prev, isOnline: false }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Periodic status updates
    const interval = setInterval(updateSyncStatus, 30000); // Every 30 seconds

    // Auto-sync when online (every 5 minutes)
    const syncInterval = setInterval(() => {
      if (state.isOnline && !state.isSyncing) {
        sync();
      }
    }, 300000); // Every 5 minutes

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
      clearInterval(syncInterval);
    };
  }, [updateSyncStatus, sync, state.isOnline, state.isSyncing]);

  return {
    ...state,
    sync,
    updateSyncStatus,
  };
}
