"use client";

import { cn } from "@/lib/utils/cn";
import type { LucideIcon } from "lucide-react";
import {
    User,
    Users,
    FileText,
    CreditCard,
    Receipt,
    FileBarChart,
    Calendar,
    Car,
    Wrench,
    FolderOpen,
    Bell,
    Mail,
} from "lucide-react";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { BILLING_AREA_PERMISSIONS } from "@/lib/utils/permissions";

interface SidebarItem {
    id: string;
    label: string;
    icon: LucideIcon;
    count?: number;
    /** When set, item is shown only if the user has any of these permissions. */
    permissions?: string[];
}

interface CustomerSidebarProps {
    activeView: string;
    onViewChange: (view: string) => void;
    className?: string;
    counts?: Record<string, number>;
}

export function CustomerSidebar({ activeView, onViewChange, className, counts = {} }: CustomerSidebarProps) {
    const { hasAnyPermission } = usePermissions();

    const items: SidebarItem[] = [
        { id: "profile", label: "Profile", icon: User },
        { id: "contacts", label: "Contacts", icon: Users, count: counts.contacts },
        { id: "notes", label: "Notes", icon: FileText, count: counts.notes },
        {
            id: "statement",
            label: "Statement",
            icon: FileBarChart,
            permissions: [...BILLING_AREA_PERMISSIONS],
        },
        {
            id: "invoices",
            label: "Invoices",
            icon: Receipt,
            count: counts.invoices,
            permissions: [...BILLING_AREA_PERMISSIONS],
        },
        {
            id: "estimates",
            label: "Estimates",
            icon: FileText,
            count: counts.estimates,
            permissions: [...BILLING_AREA_PERMISSIONS],
        },
        {
            id: "payments",
            label: "Payments",
            icon: CreditCard,
            count: counts.payments,
            permissions: [...BILLING_AREA_PERMISSIONS],
        },
        {
            id: "credit-notes",
            label: "Credit Notes",
            icon: FileText,
            count: counts.credit_notes,
            permissions: [...BILLING_AREA_PERMISSIONS],
        },
        {
            id: "contracts",
            label: "Contracts",
            icon: FileText,
            permissions: [...BILLING_AREA_PERMISSIONS],
        },
        {
            id: "subscriptions",
            label: "Subscriptions",
            icon: Mail,
            count: counts.subscriptions,
            permissions: ["view_subscriptions", "manage_subscriptions", "view_billing"],
        },
        {
            id: "appointments",
            label: "Appointments",
            icon: Calendar,
            count: counts.appointments,
            permissions: ["view_appointments", "view_own_appointments"],
        },
        {
            id: "vehicles",
            label: "Vehicles",
            icon: Car,
            count: counts.vehicles,
            permissions: ["view_vehicles", "view_own_vehicles"],
        },
        {
            id: "workorders",
            label: "Work Orders",
            icon: Wrench,
            count: counts.work_orders,
            permissions: ["view_workorders", "view_own_workorders"],
        },
        { id: "reminders", label: "Reminders", icon: Bell, count: counts.reminders },
        { id: "files", label: "Files", icon: FolderOpen },
    ];

    const visibleItems = items.filter(
        (item) => !item.permissions || hasAnyPermission(item.permissions)
    );

    return (
        <div className={cn("bg-muted/50 bg-muted/10 border-r border-border h-full py-4", className)}>
            <div className="px-3 mb-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2">Menu</h3>
            </div>
            <div className="space-y-1 px-3">
                {visibleItems.map((item) => {
                    const isActive = activeView === item.id;
                    return (
                        <button
                            key={item.id}
                            onClick={() => onViewChange(item.id)}
                            className={cn(
                                "w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors",
                                isActive
                                    ? "bg-card text-primary shadow-sm border border-border"
                                    : "text-muted-foreground hover:bg-muted hover:bg-muted hover:text-foreground"
                            )}
                        >
                            <item.icon className={cn("w-4 h-4", isActive ? "text-primary" : "text-muted-foreground")} />
                            <span className="flex-1 text-left">{item.label}</span>
                            {typeof item.count === "number" && item.count > 0 && (
                                <span className="text-xs text-muted-foreground tabular-nums">{item.count}</span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
