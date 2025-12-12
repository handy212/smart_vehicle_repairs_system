"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { notificationsApi, Notification } from "@/lib/api/notifications";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Bell, 
  Settings, 
  CheckCircle, 
  Circle, 
  Trash2, 
  Calendar,
  Wrench,
  Receipt,
  CreditCard,
  FileText,
  Package,
  Car,
  ExternalLink,
  ArrowRight,
  Activity,
  User,
  Plus,
  Edit,
  X,
  Eye,
  Download,
  Upload,
  LogIn,
  LogOut
} from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { useToast } from "@/lib/hooks/useToast";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { auditLogsApi, AuditLog } from "@/lib/api/audit-logs";

export default function NotificationsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [activeTab, setActiveTab] = useState<"notifications" | "activity">("notifications");

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
    refetchInterval: 30000, // Refetch every 30 seconds for real-time updates
  });

  // Activity feed query
  const { data: activityData, isLoading: isLoadingActivity } = useQuery({
    queryKey: ["activity-feed"],
    queryFn: () => auditLogsApi.list({ page: 1 }),
    enabled: activeTab === "activity",
    refetchInterval: 60000, // Refetch every minute for activity feed
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
        default:
          return null;
      }
    }

    // Fallback based on notification type
    const notifType = notification.notification_type.toLowerCase();
    if (notifType.includes("appointment") && notification.data?.appointment_id) {
      return `/appointments/${notification.data.appointment_id}`;
    }
    if (notifType.includes("work_order") && notification.data?.work_order_id) {
      return `/workorders/${notification.data.work_order_id}`;
    }
    if (notifType.includes("invoice") && notification.data?.invoice_id) {
      return `/billing/${notification.data.invoice_id}`;
    }

    return null;
  };

  const handleNotificationClick = (notification: Notification) => {
    const url = getNotificationUrl(notification);
    if (url) {
      // Mark as read if unread
      if (!notification.is_read && !notification.read_at) {
        markAsReadMutation.mutate(notification.id);
      }
      router.push(url);
    }
  };

  const getActionIcon = (action: string) => {
    const iconClass = "w-4 h-4";
    switch (action.toLowerCase()) {
      case "create":
        return <Plus className={iconClass} />;
      case "update":
        return <Edit className={iconClass} />;
      case "delete":
        return <X className={iconClass} />;
      case "view":
        return <Eye className={iconClass} />;
      case "export":
        return <Download className={iconClass} />;
      case "import":
        return <Upload className={iconClass} />;
      case "login":
        return <LogIn className={iconClass} />;
      case "logout":
        return <LogOut className={iconClass} />;
      default:
        return <Activity className={iconClass} />;
    }
  };

  const getActionColor = (action: string) => {
    switch (action.toLowerCase()) {
      case "create":
        return "text-green-600 bg-green-50";
      case "update":
        return "text-blue-600 bg-blue-50";
      case "delete":
        return "text-red-600 bg-red-50";
      case "login":
        return "text-purple-600 bg-purple-50";
      case "logout":
        return "text-gray-600 bg-gray-50";
      default:
        return "text-gray-600 bg-gray-50";
    }
  };

  const getActivityUrl = (log: AuditLog): string | null => {
    if (!log.model_name || !log.object_id) return null;
    
    const model = log.model_name.toLowerCase();
    const id = log.object_id;

    switch (model) {
      case "customer":
        return `/customers/${id}`;
      case "vehicle":
        return `/vehicles/${id}`;
      case "appointment":
        return `/appointments/${id}`;
      case "workorder":
      case "work order":
        return `/workorders/${id}`;
      case "invoice":
        return `/billing/${id}`;
      case "estimate":
        return `/billing/estimates/${id}`;
      default:
        return null;
    }
  };

  const notifications = notificationsData?.results || [];
  const unreadCount = unreadCountData?.unread_count || 0;
  const activities = activityData?.results || [];

  if (isLoading && activeTab === "notifications") {
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
          <h1 className="text-3xl font-bold text-gray-900">Notifications & Activity</h1>
          <p className="text-sm text-gray-500 mt-1">
            {activeTab === "notifications" 
              ? (unreadCount > 0 ? `${unreadCount} unread notification${unreadCount !== 1 ? "s" : ""}` : "All caught up!")
              : "Recent system activity and events"
            }
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {unreadCount > 0 && (
            <Button
             variant="secondary"
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
             variant="secondary"
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
            <Buttonvariant="secondary">
              <Settings className="w-4 h-4 mr-2" />
              Preferences
            </Button>
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "notifications" | "activity")}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="notifications" className="flex items-center space-x-2">
            <Bell className="w-4 h-4" />
            <span>Notifications</span>
            {unreadCount > 0 && (
              <Badge variant="danger" className="ml-2">
                {unreadCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="activity" className="flex items-center space-x-2">
            <Activity className="w-4 h-4" />
            <span>Activity Feed</span>
          </TabsTrigger>
        </TabsList>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-6">
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
              {notifications.map((notification) => {
                const url = getNotificationUrl(notification);
                const isUnread = !notification.is_read && !notification.read_at;
                const isClickable = !!url;

                return (
                  <div
                    key={notification.id}
                    className={cn(
                      "p-4 rounded-lg border-2 transition-all",
                      isUnread
                        ? "bg-blue-50 border-blue-200"
                        : "bg-white border-gray-200",
                      isClickable && "hover:shadow-md cursor-pointer hover:border-blue-300"
                    )}
                    onClick={() => isClickable && handleNotificationClick(notification)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          {isUnread ? (
                            <div className="w-2 h-2 rounded-full bg-blue-600 flex-shrink-0"></div>
                          ) : (
                            <Circle className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          )}
                          <div className="flex items-center space-x-1 text-gray-500">
                            {getTypeIcon(notification.notification_type)}
                          </div>
                          <Badge variant={getPriorityVariant(notification.priority) as any}>
                            {getTypeLabel(notification.notification_type)}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            {notification.priority}
                          </Badge>
                        </div>
                        <h3 className="font-semibold text-gray-900 mb-1 flex items-center">
                          {notification.title}
                          {isClickable && (
                            <ExternalLink className="w-3 h-3 ml-2 text-gray-400" />
                          )}
                        </h3>
                        <p className="text-sm text-gray-700 mb-2">{notification.message}</p>
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-gray-500">
                            {format(new Date(notification.created_at), "MMM dd, yyyy HH:mm")}
                          </p>
                          {isClickable && (
                            <span className="text-xs text-blue-600 flex items-center">
                              View details
                              <ArrowRight className="w-3 h-3 ml-1" />
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2 ml-4">
                        {isUnread && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              markAsReadMutation.mutate(notification.id);
                            }}
                            disabled={markAsReadMutation.isPending}
                            className="flex-shrink-0"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
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
        </TabsContent>

        {/* Activity Feed Tab */}
        <TabsContent value="activity" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Activity className="w-5 h-5 mr-2" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingActivity ? (
                <div className="flex items-center justify-center h-64">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                </div>
              ) : activities.length > 0 ? (
                <div className="space-y-4">
                  {activities.map((activity) => {
                    const activityUrl = getActivityUrl(activity);
                    return (
                      <div
                        key={activity.id}
                        className={cn(
                          "p-4 rounded-lg border border-gray-200 bg-white transition-all",
                          activityUrl && "hover:shadow-md cursor-pointer hover:border-blue-300"
                        )}
                        onClick={() => activityUrl && router.push(activityUrl)}
                      >
                        <div className="flex items-start space-x-3">
                          <div className={cn(
                            "p-2 rounded-lg flex-shrink-0",
                            getActionColor(activity.action)
                          )}>
                            {getActionIcon(activity.action)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2 mb-1">
                              <p className="text-sm font-medium text-gray-900">
                                {activity.user_name || activity.user_email || "System"}
                              </p>
                              <span className="text-sm text-gray-500">
                                {activity.action}
                              </span>
                              {activity.model_name && (
                                <>
                                  <span className="text-sm text-gray-400">•</span>
                                  <span className="text-sm text-gray-500">
                                    {activity.model_name}
                                  </span>
                                </>
                              )}
                            </div>
                            {activity.object_repr && (
                              <p className="text-sm text-gray-700 mb-2">
                                {activity.object_repr}
                              </p>
                            )}
                            <div className="flex items-center justify-between">
                              <p className="text-xs text-gray-500">
                                {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                              </p>
                              {activityUrl && (
                                <span className="text-xs text-blue-600 flex items-center">
                                  View
                                  <ArrowRight className="w-3 h-3 ml-1" />
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Activity className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">No activity found</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
