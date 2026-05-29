"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BellRing } from "lucide-react";
import { notificationsApi } from "@/lib/api/notifications";
import { cn } from "@/lib/utils";

export function MobileNotificationBell() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const { unread_count } = await notificationsApi.unreadCount();
        if (mounted) setUnread(unread_count);
      } catch {
        if (mounted) setUnread(0);
      }
    };
    load();
    const interval = setInterval(load, 60000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <Link
      href="/mobile/notifications"
      className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      aria-label={unread > 0 ? `${unread} unread notifications` : "Notifications"}
    >
      <BellRing className="h-5 w-5" />
      {unread > 0 && (
        <span
          className={cn(
            "absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground"
          )}
        >
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}
