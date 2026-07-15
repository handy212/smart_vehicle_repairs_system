"use client";

/**
 * Realtime in-app notifications via WebSocket (/ws/notifications/).
 * NotificationDropdown still polls as a safety net for the bell badge/list.
 */

import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getAccessToken } from "@/lib/utils/token";
import { getBackendOrigin } from "@/lib/api/base-url";
import { fetchWsTicket } from "@/lib/auth/ws-ticket";
import type { Notification } from "@/lib/api/notifications";
import { toast } from "@/lib/toast";

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;
const SEEN_KEY = "workshop_notif_ws_seen";

type IncomingPayload = {
  type: string;
  notification?: Notification;
  unread_count?: number;
};

function loadSeen(): Set<number> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(SEEN_KEY);
    if (!raw) return new Set();
    const ids = JSON.parse(raw) as number[];
    return new Set(Array.isArray(ids) ? ids.slice(-300) : []);
  } catch {
    return new Set();
  }
}

function saveSeen(ids: Set<number>) {
  try {
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...ids].slice(-300)));
  } catch {
    /* ignore */
  }
}

function toastKind(n: Notification): "info" | "warning" | "error" {
  const priority = (n.priority || "").toLowerCase();
  if (priority === "urgent" || priority === "high") return "warning";
  const t = (n.notification_type || "").toLowerCase();
  if (t.includes("fail") || t.includes("reject") || t.includes("error")) return "error";
  return "info";
}

function buildWsUrl() {
  let host = typeof window !== "undefined" ? window.location.host : "";
  try {
    const origin = getBackendOrigin();
    if (origin) {
      host = new URL(origin).host;
    }
  } catch {
    /* keep window host */
  }
  const protocol =
    typeof window !== "undefined" && window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${host}/ws/notifications/`;
}

interface Options {
  enabled?: boolean;
  onConnectedChange?: (connected: boolean) => void;
}

export function useRealtimeNotifications({
  enabled = true,
  onConnectedChange,
}: Options = {}) {
  const queryClient = useQueryClient();
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectDelayRef = useRef(RECONNECT_BASE_MS);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const seenRef = useRef<Set<number>>(loadSeen());
  const connectRef = useRef<() => void>(() => {});
  const onConnectedChangeRef = useRef(onConnectedChange);
  onConnectedChangeRef.current = onConnectedChange;

  const handleNotification = useCallback(
    (notification: Notification, unreadCount?: number) => {
      if (!notification?.id) return;
      if (seenRef.current.has(notification.id)) return;
      seenRef.current.add(notification.id);
      saveSeen(seenRef.current);

      const kind = toastKind(notification);
      const show =
        kind === "error" ? toast.error : kind === "warning" ? toast.warning : toast.info;
      show(notification.title || "New notification", {
        description: notification.message || undefined,
      });

      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications", "unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["notifications", "recent"] });

      if (typeof unreadCount === "number") {
        queryClient.setQueryData(["notifications", "unread-count"], {
          unread_count: unreadCount,
        });
      }
    },
    [queryClient]
  );

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    const delay = reconnectDelayRef.current;
    reconnectDelayRef.current = Math.min(delay * 2, RECONNECT_MAX_MS);
    reconnectTimerRef.current = setTimeout(() => {
      connectRef.current();
    }, delay);
  }, []);

  const connect = useCallback(() => {
    if (!enabled || !mountedRef.current) return;
    if (
      socketRef.current &&
      (socketRef.current.readyState === WebSocket.OPEN ||
        socketRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    void (async () => {
      if (!enabled || !mountedRef.current) return;

      // Prefer E2E/session token, else BFF-issued ticket from HttpOnly cookie.
      let token = getAccessToken();
      if (!token) {
        token = await fetchWsTicket();
      }
      if (!token || !mountedRef.current) {
        // No auth yet — retry with backoff (session may still be hydrating)
        scheduleReconnect();
        return;
      }

      const base = buildWsUrl();
      const url = `${base}?token=${encodeURIComponent(token)}`;

      let socket: WebSocket;
      try {
        socket = new WebSocket(url);
      } catch (err) {
        console.warn("[Notifications] WebSocket construct failed", err);
        scheduleReconnect();
        return;
      }

      socketRef.current = socket;

      socket.onopen = () => {
        if (!mountedRef.current) return;
        reconnectDelayRef.current = RECONNECT_BASE_MS;
        onConnectedChangeRef.current?.(true);
      };

      socket.onmessage = (event) => {
        let data: IncomingPayload;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }
        if (data.type === "notification.new" && data.notification) {
          handleNotification(data.notification, data.unread_count);
        }
      };

      socket.onclose = (event) => {
        onConnectedChangeRef.current?.(false);
        socketRef.current = null;
        // 4001 = anonymous/auth rejected — refresh ticket on next attempt
        if (mountedRef.current && enabled) {
          scheduleReconnect();
        }
        if (event.code === 4001 || event.code === 4401) {
          console.warn("[Notifications] WebSocket auth rejected; will retry with fresh ticket");
        }
      };
    })();
  }, [enabled, handleNotification, scheduleReconnect]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    mountedRef.current = true;
    if (enabled) {
      connect();
    }
    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (socketRef.current) {
        socketRef.current.onclose = null;
        socketRef.current.close();
        socketRef.current = null;
      }
      onConnectedChangeRef.current?.(false);
    };
  }, [enabled, connect]);
}
