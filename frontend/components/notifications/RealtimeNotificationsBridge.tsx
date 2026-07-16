"use client";

import { useRealtimeNotifications } from "@/lib/hooks/useRealtimeNotifications";
import { useAuthStore } from "@/store/authStore";
import { create } from "zustand";

/** Shared flag so the bell can slow-poll when the live socket is up. */
export const useNotificationLiveStore = create<{
  connected: boolean;
  setConnected: (v: boolean) => void;
}>((set) => ({
  connected: false,
  setConnected: (connected) => set({ connected }),
}));

/**
 * Mount once under Providers so dashboard, portal, mobile, and technician
 * all receive realtime in-app notification toasts.
 */
export function RealtimeNotificationsBridge() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const setConnected = useNotificationLiveStore((s) => s.setConnected);

  useRealtimeNotifications({
    enabled: hasHydrated && isAuthenticated,
    onConnectedChange: setConnected,
  });

  return null;
}
