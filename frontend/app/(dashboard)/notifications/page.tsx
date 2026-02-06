"use client";

import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { notificationsApi, Notification } from "@/lib/api/notifications";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Bell,
  Settings,
  CheckCircle,
  Search,
  X as XIcon,
  Calendar,
  Wrench,
  Receipt,
  CreditCard,
  FileText,
  Package,
  Car,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/lib/hooks/useToast";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { useDebounce } from "@/lib/hooks/useDebounce";

type FilterType = "all" | "unread";

export default function NotificationsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const router = useRouter();

  const [filter, setFilter] = useState<FilterType>("all");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  const hasAccessToken =
    typeof window !== "undefined" && !!localStorage.getItem("access_token");

  const { data: notificationsData, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["notifications", filter, debouncedSearch],
    queryFn: ({ pageParam = 1 }) =>
      notificationsApi.list({
        page: pageParam,
        is_read: filter === "unread" ? false : undefined,
      }),
    getNextPageParam: (lastPage, pages) => {
      return lastPage.next ? pages.length + 1 : undefined;
    },
    enabled: hasAccessToken,
    initialPageParam: 1,
  });

  const { data: unreadCountData } = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => notificationsApi.unreadCount(),
    enabled: hasAccessToken,
    refetchInterval: 30000,
  });

  const markAsReadMutation = useMutation({
    mutationFn: (id: number) => notificationsApi.markAsRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications", "unread-count"] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: () => notificationsApi.markAllAsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications", "unread-count"] });
      toast({
        title: "Success",
        description: "All notifications marked as read",
      });
    },
  });

  const notifications = notificationsData?.pages.flatMap((page) => page.results) || [];
  const filteredNotifications = debouncedSearch
    ? notifications.filter(
      (n) =>
        n.title.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        n.message.toLowerCase().includes(debouncedSearch.toLowerCase())
    )
    : notifications;

  const unreadCount = unreadCountData?.unread_count || 0;

  const getTypeIcon = (type: string) => {
    const iconClass = "w-4 h-4";
    switch (type.toLowerCase()) {
      case "appointment":
        return <Calendar className={iconClass} />;
      case "work_order":
        return <Wrench className={iconClass} />;
      case "invoice":
        return <Receipt className={iconClass} />;
      case "payment":
        return <CreditCard className={iconClass} />;
      case "inspection":
        return <FileText className={iconClass} />;
      case "inventory":
        return <Package className={iconClass} />;
      case "vehicle":
        return <Car className={iconClass} />;
      default:
        return <Bell className={iconClass} />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent":
        return "border-l-red-500";
      case "high":
        return "border-l-orange-500";
      case "normal":
        return "border-l-primary";
      case "low":
        return "border-l-gray-400";
      default:
        return "border-l-gray-300";
    }
  };

  const getNotificationUrl = (notification: Notification): string | null => {
    if (notification.related_object_id && notification.related_object_type) {
      const type = notification.related_object_type.toLowerCase();
      const id = notification.related_object_id;

      switch (type) {
        case "appointment":
          return `/appointments/${id}`;
        case "workorder":
        case "work_order":
          return `/workorders/${id}`;
        case "invoice":
          return `/billing/${id}`;
        case "estimate":
          return `/billing/estimates/${id}`;
        case "customer":
          return `/customers/${id}`;
        case "vehicle":
          return `/vehicles/${id}`;
        case "inspection":
          return `/inspections/${id}`;
        case "transfer":
        case "inventory_transfer":
          return `/inventory/transfers/${id}`;
        case "purchase_order":
        case "purchase-order":
          return `/inventory/purchase-orders/${id}`;
        case "part":
        case "inventory":
          return `/inventory/${id}`;
        default:
          return null;
      }
    }
    return null;
  };

  const handleNotificationClick = (notification: Notification) => {
    const url = getNotificationUrl(notification);
    if (url) {
      if (!notification.is_read && !notification.read_at) {
        markAsReadMutation.mutate(notification.id);
      }
      router.push(url);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">
            Notifications
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount !== 1 ? "s" : ""}` : "All caught up!"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-9"
              onClick={() => {
                if (confirm("Mark all notifications as read?")) {
                  markAllAsReadMutation.mutate();
                }
              }}
              disabled={markAllAsReadMutation.isPending}
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Mark All Read
            </Button>
          )}
          <Link href="/notifications/preferences">
            <Button size="sm" variant="outline" className="h-9">
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </Button>
          </Link>
        </div>
      </div>

      {/* Search & Filters */}
      <Card className="border-none shadow-sm bg-muted/50">
        <div className="p-3 space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search notifications..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 w-full bg-card"
            />
            {search && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSearch("")}
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
              >
                <XIcon className="w-4 h-4" />
              </Button>
            )}
          </div>

          {/* Filter Chips */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={filter === "all" ? "default" : "outline"}
              onClick={() => setFilter("all")}
              className="h-8"
            >
              All
            </Button>
            <Button
              size="sm"
              variant={filter === "unread" ? "default" : "outline"}
              onClick={() => setFilter("unread")}
              className="h-8"
            >
              Unread
              {unreadCount > 0 && (
                <Badge className="ml-2 text-[10px] px-1.5 py-0 bg-red-600">
                  {unreadCount}
                </Badge>
              )}
            </Button>
          </div>
        </div>
      </Card>

      {/* Notifications List */}
      {filteredNotifications.length > 0 ? (
        <div className="space-y-2">
          {filteredNotifications.map((notification) => {
            const isUnread = !notification.is_read && !notification.read_at;
            const url = getNotificationUrl(notification);
            const isClickable = !!url;

            return (
              <div
                key={notification.id}
                className={cn(
                  "group relative pl-4 pr-3 py-3 rounded-lg border-l-4 transition-all",
                  getPriorityColor(notification.priority),
                  isUnread
                    ? "bg-primary/5 dark:bg-orange-950/20 border-r border-t border-b border-orange-200/50 dark:border-orange-800/50"
                    : "bg-card/50 border-r border-t border-b border-border",
                  isClickable && "cursor-pointer hover:shadow-sm hover:scale-[1.01] dark:hover:bg-gray-800"
                )}
                onClick={() => isClickable && handleNotificationClick(notification)}
              >
                {/* Unread Dot */}
                {isUnread && (
                  <div className="absolute left-1.5 top-5 w-2 h-2 rounded-full bg-primary dark:bg-orange-400" />
                )}

                <div className="flex items-start gap-3">
                  {/* Avatar/Icon */}
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-muted-foreground">
                    {getTypeIcon(notification.notification_type)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-foreground mb-0.5">
                      {notification.title}
                    </h3>
                    <p className="text-sm text-card-foreground mb-2">
                      {notification.message}
                    </p>

                    {/* Metadata */}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        {getTypeIcon(notification.notification_type)}
                        {notification.notification_type.replace("_", " ")}
                      </span>
                      <span>•</span>
                      <span className="capitalize">{notification.priority}</span>
                      <span>•</span>
                      <span>{formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {isUnread && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          markAsReadMutation.mutate(notification.id);
                        }}
                        className="h-7 w-7 p-0 hover:bg-orange-100 dark:hover:bg-orange-900/20"
                        title="Mark as read"
                      >
                        <CheckCircle className="w-4 h-4 text-primary dark:text-primary" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Load More */}
          {hasNextPage && (
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="h-10"
              >
                {isFetchingNextPage ? "Loading..." : "Load More"}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <Card className="border-dashed border-2 bg-muted/50">
          <div className="py-16 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
              <Bell className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-card-foreground mb-1">
              {debouncedSearch ? "No notifications found" : filter === "unread" ? "No unread notifications" : "No notifications yet"}
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              {debouncedSearch
                ? "Try adjusting your search"
                : "You're all caught up! New notifications will appear here."}
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
