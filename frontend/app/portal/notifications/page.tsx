"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { notificationsApi, Notification } from "@/lib/api/notifications";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Bell,
  CheckCircle,
  Circle,
  Calendar,
  Wrench,
  Receipt,
  CreditCard,
  FileText,
  Car,
  ArrowRight,
  Package,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/lib/hooks/useToast";
import { cn } from "@/lib/utils/cn";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthStore } from "@/store/authStore";
import { ensureApiSession } from "@/lib/auth/session";
import { authApi } from "@/lib/api/auth";

export default function NotificationsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const { isSuccess: sessionReady } = useQuery({
    queryKey: ["user"],
    queryFn: async () => {
      await ensureApiSession();
      return authApi.getCurrentUser();
    },
    enabled: isAuthenticated,
    retry: false,
  });

  const canFetch = isAuthenticated && sessionReady;

  const { data: notificationsData, isLoading } = useQuery({
    queryKey: ["portal", "notifications", filter, typeFilter],
    queryFn: () =>
      notificationsApi.list({
        is_read: filter === "unread" ? false : undefined,
        notification_type: typeFilter !== "all" ? typeFilter : undefined,
      }),
    enabled: canFetch,
  });

  const { data: unreadCountData } = useQuery({
    queryKey: ["portal", "notifications", "unread-count"],
    queryFn: () => notificationsApi.unreadCount(),
    enabled: canFetch,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const notifications = (notificationsData?.results || notificationsData || []) as Notification[];
  const unreadCount = unreadCountData?.unread_count || 0;

  const markAsReadMutation = useMutation({
    mutationFn: (id: number) => notificationsApi.markAsRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal", "notifications"] });
      queryClient.invalidateQueries({ queryKey: ["portal", "notifications", "unread-count"] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: () => notificationsApi.markAllAsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal", "notifications"] });
      queryClient.invalidateQueries({ queryKey: ["portal", "notifications", "unread-count"] });
      toast({
        title: "Success",
        description: "All notifications marked as read",
      });
    },
  });

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "appointment":
        return Calendar;
      case "work_order":
        return Wrench;
      case "invoice":
        return Receipt;
      case "payment":
        return CreditCard;
      case "vehicle":
        return Car;
      case "inspection":
        return FileText;
      case "inventory":
        return Package;
      default:
        return Bell;
    }
  };

  const getNotificationLink = (notification: Notification): string | null => {
    const data = notification.data || {};
    const getNumericData = (key: string) => {
      const value = data[key];
      if (typeof value === "number") return value;
      if (typeof value === "string" && value.trim()) return Number(value);
      return undefined;
    };

    const relatedType = notification.related_object_type?.toLowerCase();
    const relatedId = notification.related_object_id;
    if (relatedType && relatedId) {
      switch (relatedType) {
        case "appointment":
          return `/portal/appointments/${relatedId}`;
        case "work_order":
        case "workorder":
          return `/portal/work-orders/${relatedId}`;
        case "invoice":
          return `/portal/invoices/${relatedId}`;
        case "estimate":
          return `/portal/estimates/${relatedId}`;
        case "vehicle":
          return `/portal/vehicles/${relatedId}`;
        case "inspection":
          return `/portal/inspections/${relatedId}`;
        case "payment":
          return `/portal/payments`;
        case "roadside":
        case "roadside_request":
        case "roadsideassistancerequest":
          return `/portal/roadside/${relatedId}`;
        default:
          break;
      }
    }

    const appointmentId = getNumericData("appointment_id");
    const invoiceId = getNumericData("invoice_id");
    const estimateId = getNumericData("estimate_id");
    const vehicleId = getNumericData("vehicle_id");
    const inspectionId = getNumericData("inspection_id");
    if (appointmentId) return `/portal/appointments/${appointmentId}`;
    if (invoiceId) return `/portal/invoices/${invoiceId}`;
    if (estimateId) return `/portal/estimates/${estimateId}`;
    if (vehicleId) return `/portal/vehicles/${vehicleId}`;
    if (inspectionId) return `/portal/inspections/${inspectionId}`;
    if (getNumericData("payment_id")) return `/portal/payments`;
    return null;
  };

  const getPriorityColor = (priority: string): "danger" | "warning" | "info" | "secondary" => {
    switch (priority) {
      case "urgent":
        return "danger";
      case "high":
        return "warning";
      case "normal":
        return "info";
      case "low":
        return "secondary";
      default:
        return "secondary";
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-6 w-48 mb-4" />
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Notifications</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Stay updated with your account activity
          </p>
        </div>
        {unreadCount > 0 && (
          <div className="flex items-center space-x-4">
            <Badge variant="warning">{unreadCount} unread</Badge>
            <Button
              variant="secondary"
              onClick={() => markAllAsReadMutation.mutate()}
              disabled={markAllAsReadMutation.isPending}
            >
              Mark All as Read
            </Button>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Notifications
            </CardTitle>
            <Bell className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {notifications.length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Unread
            </CardTitle>
            <Circle className="h-5 w-5 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {unreadCount}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Read
            </CardTitle>
            <CheckCircle className="h-5 w-5 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {notifications.length - unreadCount}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center space-x-4">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as "all" | "unread")}
              className="flex h-10 w-48 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="all">All Notifications</option>
              <option value="unread">Unread Only</option>
            </select>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="flex h-10 w-48 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="all">All Types</option>
              <option value="appointment">Appointments</option>
              <option value="invoice">Invoices</option>
              <option value="payment">Payments</option>
              <option value="vehicle">Vehicles</option>
              <option value="work_order">Work Orders</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Notifications List */}
      {notifications.length > 0 ? (
        <div className="space-y-4">
          {notifications.map((notification) => {
            const Icon = getNotificationIcon(notification.notification_type);
            const link = getNotificationLink(notification);
            const isRead = notification.is_read;

            return (
              <Card
                key={notification.id}
                className={cn(
                  "transition-all hover:shadow-md",
                  !isRead && "border-l-4 border-l-primary bg-primary/5 dark:bg-warning/10"
                )}
              >
                <CardContent className="p-6">
                  <div className="flex items-start space-x-4">
                    <div
                      className={cn(
                        "p-3 rounded-lg",
                        !isRead
                          ? "bg-warning/15"
                          : "bg-border"
                      )}
                    >
                      <Icon
                        className={cn(
                          "w-5 h-5",
                          !isRead
                            ? "text-primary"
                            : "text-muted-foreground"
                        )}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-1">
                            <h3
                              className={cn(
                                "font-semibold text-foreground",
                                !isRead && "font-bold"
                              )}
                            >
                              {notification.title}
                            </h3>
                            {!isRead && (
                              <Circle className="w-2 h-2 fill-primary text-primary" />
                            )}
                            {notification.priority && notification.priority !== "normal" && (

                              <Badge variant={getPriorityColor(notification.priority)}>
                                {notification.priority}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">
                            {notification.message}
                          </p>
                          <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                            <span>
                              {formatDistanceToNow(new Date(notification.created_at), {
                                addSuffix: true,
                              })}
                            </span>
                            <span className="capitalize">{notification.notification_type}</span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2 ml-4">
                          {!isRead && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => markAsReadMutation.mutate(notification.id)}
                              disabled={markAsReadMutation.isPending}
                            >
                              <CheckCircle className="w-4 h-4" />
                            </Button>
                          )}
                          {link && (
                            <Link href={link}>
                              <Button variant="secondary" size="sm">
                                View <ArrowRight className="w-4 h-4 ml-1" />
                              </Button>
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Bell className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground mb-2">No notifications found</p>
            <p className="text-sm text-muted-foreground">
              {filter === "unread"
                ? "You're all caught up! No unread notifications."
                : "You don't have any notifications yet."}
            </p>
          </CardContent>
        </Card>
      )
      }
    </div >
  );
}
