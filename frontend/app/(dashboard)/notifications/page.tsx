"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { notificationsApi, Notification } from "@/lib/api/notifications";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, Settings, CheckCircle, Circle, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { format } from "date-fns";
import { useToast } from "@/lib/hooks/useToast";

export default function NotificationsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const { data: notificationsData, isLoading } = useQuery({
    queryKey: ["notifications", filter],
    queryFn: () =>
      notificationsApi.list({
        status: filter === "unread" ? "unread" : undefined,
      }),
  });

  const { data: unreadCountData } = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => notificationsApi.unreadCount(),
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

  const clearReadMutation = useMutation({
    mutationFn: () => notificationsApi.clearRead(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications", "unread-count"] });
      toast({
        title: "Success",
        description: `${data.count} read notifications cleared`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to clear notifications",
        variant: "destructive",
      });
    },
  });

  const notifications = notificationsData?.results || [];
  const unreadCount = unreadCountData?.unread_count || 0;

  const getPriorityVariant = (priority: string) => {
    switch (priority) {
      case "urgent":
        return "danger";
      case "high":
        return "warning";
      case "normal":
        return "default";
      case "low":
        return "secondary";
      default:
        return "default";
    }
  };

  const getTypeLabel = (type: string) => {
    return type
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Notifications</h1>
          <p className="text-sm text-gray-500 mt-1">
            {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount !== 1 ? "s" : ""}` : "All caught up!"}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {unreadCount > 0 && (
            <Button
              variant="outline"
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
          {filter === "all" && notificationsData && notificationsData.count > 0 && (
            <Button
              variant="outline"
              onClick={() => {
                const readCount = notifications.filter(n => n.is_read || n.read_at).length;
                if (readCount > 0 && confirm(`Delete ${readCount} read notification${readCount !== 1 ? "s" : ""}?`)) {
                  clearReadMutation.mutate();
                }
              }}
              disabled={clearReadMutation.isPending}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Clear Read
            </Button>
          )}
          <Link href="/notifications/preferences">
            <Button variant="outline">
              <Settings className="w-4 h-4 mr-2" />
              Preferences
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setFilter("all")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                filter === "all"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              All ({notificationsData?.count || 0})
            </button>
            <button
              onClick={() => setFilter("unread")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                filter === "unread"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Unread ({unreadCount})
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Notifications List */}
      <Card>
        <CardHeader>
          <CardTitle>
            {filter === "unread" ? "Unread Notifications" : "All Notifications"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {notifications.length > 0 ? (
            <div className="space-y-4">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    notification.is_read || notification.read_at
                      ? "bg-white border-gray-200"
                      : "bg-blue-50 border-blue-200"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        {notification.is_read || notification.read_at ? (
                          <Circle className="w-4 h-4 text-gray-400" />
                        ) : (
                          <div className="w-2 h-2 rounded-full bg-blue-600"></div>
                        )}
                        <Badge variant={getPriorityVariant(notification.priority) as any}>
                          {getTypeLabel(notification.notification_type)}
                        </Badge>
                        <Badge variant="secondary">{notification.priority}</Badge>
                      </div>
                      <h3 className="font-semibold text-gray-900 mb-1">
                        {notification.title}
                      </h3>
                      <p className="text-sm text-gray-700 mb-2">{notification.message}</p>
                      <p className="text-xs text-gray-500">
                        {format(new Date(notification.created_at), "MMM dd, yyyy HH:mm")}
                      </p>
                    </div>
                    <div className="flex items-center space-x-2 ml-4">
                      {!notification.is_read && !notification.read_at && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => markAsReadMutation.mutate(notification.id)}
                          disabled={markAsReadMutation.isPending}
                        >
                          <CheckCircle className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Bell className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">
                {filter === "unread"
                  ? "No unread notifications"
                  : "No notifications found"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
