/**
 * Zustand Store for Offline State Management
 */

import { create } from 'zustand';
import { getSyncStatus, syncAll, SyncResult } from '@/lib/offline/sync';

interface OfflineState {
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
  syncError: string | null;

  // Actions
  setOnline: (isOnline: boolean) => void;
  updateSyncStatus: () => Promise<void>;
  sync: () => Promise<SyncResult | null>;
  reset: () => void;
}

export const useOfflineStore = create<OfflineState>((set, get) => ({
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
  syncError: null,

  setOnline: (isOnline) => {
    set({ isOnline });
    if (isOnline) {
      // Auto-sync when coming back online
      get().sync();
    }
  },

  updateSyncStatus: async () => {
    try {
      const status = await getSyncStatus();
      set({
        hasUnsyncedData: status.hasUnsyncedData,
        unsyncedCounts: status.unsyncedCounts,
        queueStats: status.queueStats,
      });
    } catch (error: any) {
      console.error('[OfflineStore] Failed to update sync status:', error);
    }
  },

  sync: async () => {
    const state = get();
    if (state.isSyncing || !state.isOnline) {
      return null;
    }

    set({ isSyncing: true, syncError: null });

    try {
      const result = await syncAll();
      set({
        isSyncing: false,
        lastSyncTime: Date.now(),
        syncError: result.success ? null : result.errors.join(', '),
      });

      // Update status after sync
      await get().updateSyncStatus();

      return result;
    } catch (error: any) {
      const errorMessage = error?.message || 'Sync failed';
      set({
        isSyncing: false,
        syncError: errorMessage,
      });
      return null;
    }
  },

  reset: () => {
    set({
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
      syncError: null,
    });
  },
}));

// Initialize online/offline listeners
// Initialize online/offline listeners
if (typeof window !== 'undefined' && !(window as any).__offline_listeners_initialized__) {
  (window as any).__offline_listeners_initialized__ = true;

  window.addEventListener('online', () => {
    useOfflineStore.getState().setOnline(true);
  });

  window.addEventListener('offline', () => {
    useOfflineStore.getState().setOnline(false);
  });

  // Initial status check
  useOfflineStore.getState().updateSyncStatus();

  // Periodic status updates
  setInterval(() => {
    useOfflineStore.getState().updateSyncStatus();
  }, 30000); // Every 30 seconds

  // Auto-sync when online (every 5 minutes)
  setInterval(() => {
    const state = useOfflineStore.getState();
    if (state.isOnline && !state.isSyncing) {
      state.sync();
    }
  }, 300000); // Every 5 minutes
}
