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
import { PremiumIcons } from "@/components/ui/icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils/cn";
import { useNotificationSound } from "@/lib/hooks/useNotificationSound";

import { authApi } from "@/lib/api/auth";

export function NotificationDropdown() {
    const router = useRouter();
    const queryClient = useQueryClient();

    const hasAccessToken =
        typeof window !== "undefined" && !!localStorage.getItem("access_token");

    // Fetch user to determine role
    const { data: user } = useQuery({
        queryKey: ["user"],
        queryFn: () => authApi.getCurrentUser(),
        staleTime: 1000 * 60 * 5, // 5 minutes
        enabled: hasAccessToken,
    });

    // Fetch recent notifications (take first 10 from results)
    const { data: notificationsData } = useQuery({
        queryKey: ["notifications", "recent"],
        queryFn: () => notificationsApi.list({}),
        enabled: hasAccessToken,
        refetchInterval: 30_000, // 30s — balances responsiveness and server load
        refetchIntervalInBackground: false, // Don't poll when tab is backgrounded
    });

    const { data: unreadCountData } = useQuery({
        queryKey: ["notifications", "unread-count"],
        queryFn: () => notificationsApi.unreadCount(),
        enabled: hasAccessToken,
        refetchInterval: 30_000,
        refetchIntervalInBackground: false,
    });

    const { data: preferences } = useQuery({
        queryKey: ["notification-preferences"],
        queryFn: () => notificationsApi.getPreferences(),
        enabled: hasAccessToken,
        staleTime: 1000 * 60 * 5,
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

    // Enable notification sounds
    useNotificationSound({
        enabled: hasAccessToken && (preferences?.sound_enabled ?? true),
        unreadCount,
    });

    const getTypeIcon = (type: string) => {
        const iconClass = "w-4 h-4";
        switch (type.toLowerCase()) {
            case "appointment":
                return <PremiumIcons.Calendar className={iconClass} />;
            case "work_order":
                return <PremiumIcons.Wrench className={iconClass} />;
            case "invoice":
                return <PremiumIcons.Receipt className={iconClass} />;
            case "payment":
                return <PremiumIcons.CreditCard className={iconClass} />;
            case "inspection":
                return <PremiumIcons.FileText className={iconClass} />;
            case "inventory":
                return <PremiumIcons.Package className={iconClass} />;
            case "vehicle":
                return <PremiumIcons.Car className={iconClass} />;
            default:
                return <PremiumIcons.Bell className={iconClass} />;
        }
    };

    const getNotificationUrl = (notification: Notification): string | null => {
        // Use related_object_type if available, otherwise fallback to notification_type
        const typeRaw = notification.related_object_type || notification.notification_type;
        if (!typeRaw || !notification.related_object_id) return null;

        const type = typeRaw.toLowerCase();
        const id = notification.related_object_id;
        const isCustomer = user?.role === 'customer';

        if (isCustomer) {
            // Customer Portal Routes
            switch (type) {
                case "appointment":
                    return `/portal/appointments/${id}`;
                case "workorder":
                case "work_order":
                    return `/portal/work-orders/${id}`;
                case "invoice":
                    return `/portal/invoices/${id}`;
                case "estimate":
                    return `/portal/estimates/${id}`;
                case "customer":
                    return `/portal/profile`;
                case "vehicle":
                    return `/portal/vehicles/${id}`;
                case "inspection":
                    return `/portal/inspections/${id}`;
                case "payment":
                    return `/portal/payments/${id}`;
                case "subscription":
                    return `/portal/subscriptions/${id}`;
                case "roadside":
                case "roadside_request":
                case "roadsideassistancerequest":
                    return `/portal/roadside/${id}`;
                default:
                    return null;
            }
        } else {
            // Staff/Admin Routes
            switch (type) {
                case "appointment":
                    return `/appointments/${id}`;
                case "workorder":
                case "work_order":
                    return `/workorders/${id}`;
                case "invoice":
                    return `/billing/invoices/${id}`;
                case "estimate":
                    return `/billing/estimates/${id}`;
                case "customer":
                    return `/customers/${id}`;
                case "vehicle":
                    return `/vehicles/${id}`;
                case "inspection":
                    return `/inspections/${id}`;
                case "payment":
                    return `/billing/payments/${id}`;
                case "transfer":
                case "inventory_transfer":
                    return `/inventory/transfers/${id}`;
                case "purchase_order":
                case "purchase-order":
                    return `/inventory/purchase-orders/${id}`;
                case "part":
                case "inventory":
                    return `/inventory/${id}`;
                case "subscription":
                    return `/billing/subscriptions/${id}`;
                case "roadside":
                case "roadside_request":
                case "roadsideassistancerequest":
                    return `/roadside/${id}`;
                default:
                    return null;
            }
        }
    };

    const handleRead = (notification: Notification) => {
        if (!notification.is_read && !notification.read_at) {
            markAsReadMutation.mutate(notification.id);
        }
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                        "relative h-8 w-8 rounded-lg p-0 transition-all",
                        "text-muted-foreground hover:text-foreground hover:bg-muted",
                        "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
                        unreadCount > 0 && "text-primary"
                    )}
                    aria-label="Notifications"
                >
                    <PremiumIcons.Bell className="w-5 h-5" />
                    {unreadCount > 0 && (
                        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white ring-2 ring-background">
                            {unreadCount > 99 ? "99+" : unreadCount}
                        </span>
                    )}
                </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-[calc(100vw-1rem)] max-w-96 max-h-[calc(100vh-5rem)] overflow-hidden">
                <DropdownMenuLabel className="flex flex-wrap items-center justify-between gap-2 py-3 px-4">
                    <span className="text-sm font-semibold text-foreground">
                        Notifications
                        {unreadCount > 0 && (
                            <Badge variant="default" className="ml-2 text-[10px] px-1.5 py-0 bg-primary">
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
                            className="h-7 text-xs text-primary hover:bg-primary/10"
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
                            const hasLink = !!url;

                            return (
                                <DropdownMenuItem
                                    key={notification.id}
                                    className={cn(
                                        "cursor-pointer px-3 py-3 outline-none focus:bg-muted",
                                        isUnread && "bg-primary/5"
                                    )}
                                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                                    onClick={(e) => {
                                        // Handle read status
                                        handleRead(notification);

                                        // Navigate if URL exists
                                        if (url) {
                                            router.push(url);
                                        }
                                    }}
                                >
                                    <div className="flex items-start gap-3 w-full text-left">
                                        {/* Unread indicator */}
                                        {isUnread && (
                                            <div className="mt-1.5 w-2 h-2 flex-shrink-0 rounded-full bg-primary" />
                                        )}
                                        {!isUnread && <div className="w-2 flex-shrink-0" />}

                                        {/* Icon */}
                                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0 text-muted-foreground text-foreground">
                                            {getTypeIcon(notification.notification_type)}
                                        </div>

                                        {/* Content */}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-foreground line-clamp-1">
                                                {notification.title}
                                            </p>
                                            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                                                {notification.message}
                                            </p>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                                            </p>
                                        </div>

                                        {/* Mark as read button (only if has link, otherwise the whole item click marks as read) */}
                                        {isUnread && hasLink && (
                                            <div
                                                role="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    e.preventDefault();
                                                    markAsReadMutation.mutate(notification.id);
                                                }}
                                                className="h-7 w-7 flex-shrink-0 cursor-pointer rounded-full flex items-center justify-center hover:bg-primary/10"
                                                title="Mark as read"
                                            >
                                                <PremiumIcons.CheckCircle className="w-4 h-4 text-primary" />
                                            </div>
                                        )}
                                    </div>
                                </DropdownMenuItem>
                            );
                        })
                    ) : (
                        <div className="px-4 py-8 text-center">
                            <PremiumIcons.Bell className="w-12 h-12 text-gray-300 text-muted-foreground mx-auto mb-3" />
                            <p className="text-sm text-muted-foreground font-medium">No notifications</p>
                            <p className="text-xs text-muted-foreground mt-1">You&apos;re all caught up!</p>
                        </div>
                    )}
                </div>

                <DropdownMenuSeparator />

                <DropdownMenuItem asChild>
                    <Link
                        href="/notifications"
                        className="w-full cursor-pointer py-2.5 text-center text-sm font-medium text-primary hover:bg-primary/10"
                    >
                        View all notifications →
                    </Link>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
