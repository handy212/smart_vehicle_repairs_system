"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Bell } from "lucide-react";
import { notificationsApi, Notification } from "@/lib/api/notifications";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MobileErrorState } from "@/components/mobile/MobileErrorState";
import { MobilePageShell } from "@/components/mobile/MobilePageShell";
import { usePullToRefresh } from "@/components/mobile/usePullToRefresh";
import { cn } from "@/lib/utils";

function getNotificationHref(notification: Notification): string | null {
  const data = notification.data;
  if (typeof data?.url === "string" && data.url.startsWith("/mobile/")) {
    return data.url;
  }
  if (notification.notification_type === "inventory" && data?.work_order_id) {
    return `/mobile/workorders/${data.work_order_id}`;
  }
  if (notification.related_object_type === "roadside" && notification.related_object_id) {
    return `/mobile/roadside/${notification.related_object_id}`;
  }
  if (!data) return null;
  if (data.request_id) return `/mobile/roadside/${data.request_id}`;
  if (data.work_order_id) return `/mobile/workorders/${data.work_order_id}`;
  if (data.appointment_id) return `/mobile/schedule`;
  return null;
}

export default function MobileNotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await notificationsApi.listMine({ ordering: "-created_at", page: 1 });
      setNotifications(res.results || []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  usePullToRefresh(load);

  const handleMarkRead = async (notification: Notification) => {
    if (notification.is_read) return;
    try {
      await notificationsApi.markAsRead(notification.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n))
      );
    } catch {
      // ignore
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationsApi.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch {
      // ignore
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center p-4">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <MobileErrorState title="Could not load notifications" onRetry={load} />
      </div>
    );
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <MobilePageShell
      title="Notifications"
      backHref="/mobile/more"
      backLabel="More"
      className="space-y-4"
      actions={
        unreadCount > 0 ? (
          <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
            Mark all read
          </Button>
        ) : undefined
      }
    >
      {notifications.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <Bell className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No notifications yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {notifications.map((notification) => {
            const href = getNotificationHref(notification);
            const content = (
              <Card
                className={cn(
                  "transition-colors",
                  !notification.is_read && "border-primary/40 bg-primary/5"
                )}
                onClick={() => handleMarkRead(notification)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-sm text-foreground">{notification.title}</p>
                    {!notification.is_read && (
                      <Badge variant="default" className="shrink-0 text-xs">
                        New
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{notification.message}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {format(new Date(notification.created_at), "MMM d, h:mm a")}
                  </p>
                </CardContent>
              </Card>
            );
            return href ? (
              <Link key={notification.id} href={href}>
                {content}
              </Link>
            ) : (
              <div key={notification.id}>{content}</div>
            );
          })}
        </div>
      )}
    </MobilePageShell>
  );
}
