"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { notificationsApi, Notification } from "@/lib/api/notifications";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Bell, CheckCircle, Calendar, Wrench, Receipt, CreditCard, FileText, Package, Car } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils/cn";

export function NotificationDropdown() {
    const router = useRouter();
    const queryClient = useQueryClient();

    const hasAccessToken =
        typeof window !== "undefined" && !!localStorage.getItem("access_token");

    // Fetch recent notifications (take first 10 from results)
    const { data: notificationsData } = useQuery({
        queryKey: ["notifications", "recent"],
        queryFn: () => notificationsApi.list({}),
        enabled: hasAccessToken,
        refetchInterval: 30000, // Refetch every 30s
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
        },
    });

    const notifications = (notificationsData?.results || []).slice(0, 10);
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

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                        "relative p-2.5 rounded-lg transition-all h-auto",
                        "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800",
                        "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
                        unreadCount > 0 && "text-blue-600 dark:text-blue-400"
                    )}
                >
                    <Bell className="w-5 h-5" />
                    {unreadCount > 0 && (
                        <span className="absolute top-1 right-1 flex items-center justify-center min-w-[20px] h-[20px] px-1.5 text-xs font-semibold text-white bg-red-500 dark:bg-red-600 rounded-full ring-2 ring-white dark:ring-gray-900">
                            {unreadCount > 99 ? "99+" : unreadCount}
                        </span>
                    )}
                </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-96 max-h-[600px] overflow-hidden">
                <DropdownMenuLabel className="flex items-center justify-between py-3 px-4">
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        Notifications
                        {unreadCount > 0 && (
                            <Badge variant="default" className="ml-2 text-[10px] px-1.5 py-0 bg-blue-600">
                                {unreadCount}
                            </Badge>
                        )}
                    </span>
                    {unreadCount > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                                e.preventDefault();
                                markAllAsReadMutation.mutate();
                            }}
                            className="h-7 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                        >
                            Mark all read
                        </Button>
                    )}
                </DropdownMenuLabel>

                <DropdownMenuSeparator />

                <div className="max-h-[400px] overflow-y-auto">
                    {notifications.length > 0 ? (
                        notifications.map((notification) => {
                            const isUnread = !notification.is_read && !notification.read_at;
                            const url = getNotificationUrl(notification);

                            return (
                                <DropdownMenuItem
                                    key={notification.id}
                                    onClick={() => url && handleNotificationClick(notification)}
                                    className={cn(
                                        "px-3 py-3 cursor-pointer focus:bg-gray-50 dark:focus:bg-gray-800",
                                        isUnread && "bg-blue-50/50 dark:bg-blue-950/20"
                                    )}
                                >
                                    <div className="flex items-start gap-3 w-full">
                                        {/* Unread indicator */}
                                        {isUnread && (
                                            <div className="w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-400 mt-1.5 flex-shrink-0" />
                                        )}
                                        {!isUnread && <div className="w-2 flex-shrink-0" />}

                                        {/* Icon */}
                                        <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 text-gray-600 dark:text-gray-300">
                                            {getTypeIcon(notification.notification_type)}
                                        </div>

                                        {/* Content */}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-1">
                                                {notification.title}
                                            </p>
                                            <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mt-0.5">
                                                {notification.message}
                                            </p>
                                            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                                                {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                                            </p>
                                        </div>

                                        {/* Mark as read button */}
                                        {isUnread && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    markAsReadMutation.mutate(notification.id);
                                                }}
                                                className="h-7 w-7 p-0 hover:bg-blue-100 dark:hover:bg-blue-900/20 flex-shrink-0"
                                                title="Mark as read"
                                            >
                                                <CheckCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                            </Button>
                                        )}
                                    </div>
                                </DropdownMenuItem>
                            );
                        })
                    ) : (
                        <div className="px-4 py-8 text-center">
                            <Bell className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                            <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">No notifications</p>
                            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">You're all caught up!</p>
                        </div>
                    )}
                </div>

                <DropdownMenuSeparator />

                <DropdownMenuItem asChild>
                    <Link
                        href="/notifications"
                        className="w-full text-center py-2.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/20 cursor-pointer"
                    >
                        View all notifications →
                    </Link>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
