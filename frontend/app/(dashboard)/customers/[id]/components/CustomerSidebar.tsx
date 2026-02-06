"use client";

import { cn } from "@/lib/utils/cn";
import {
    User,
    Users,
    FileText,
    CreditCard,
    Receipt,
    FileBarChart,
    Car,
    Wrench,
    Clock,
    FolderOpen,
    Bell,
    Settings,
    Mail,
    ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface SidebarItem {
    id: string;
    label: string;
    icon: any;
    count?: number;
}

interface CustomerSidebarProps {
    activeView: string;
    onViewChange: (view: string) => void;
    className?: string;
    counts?: Record<string, number>;
}

export function CustomerSidebar({ activeView, onViewChange, className, counts = {} }: CustomerSidebarProps) {
    const items: SidebarItem[] = [
        { id: "profile", label: "Profile", icon: User },
        { id: "contacts", label: "Contacts", icon: Users, count: counts.contacts },
        { id: "notes", label: "Notes", icon: FileText, count: counts.notes },
        { id: "statement", label: "Statement", icon: FileBarChart },
        { id: "invoices", label: "Invoices", icon: Receipt, count: counts.invoices },
        { id: "estimates", label: "Estimates", icon: FileText, count: counts.estimates },
        { id: "payments", label: "Payments", icon: CreditCard, count: counts.payments },
        { id: "credit-notes", label: "Credit Notes", icon: FileText, count: counts.credit_notes },
        { id: "contracts", label: "Contracts", icon: FileText },
        { id: "subscriptions", label: "Subscriptions", icon: Mail, count: counts.subscriptions },
        { id: "vehicles", label: "Vehicles", icon: Car, count: counts.vehicles },
        { id: "workorders", label: "Work Orders", icon: Wrench, count: counts.work_orders },
        { id: "reminders", label: "Reminders", icon: Bell, count: counts.reminders },
        { id: "files", label: "Files", icon: FolderOpen },
    ];

    return (
        <div className={cn("bg-muted/50 bg-muted/10 border-r border-border h-full py-4", className)}>
            <div className="px-3 mb-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2">Menu</h3>
            </div>
            <div className="space-y-1 px-3">
                {items.map((item) => {
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
                            {item.count !== undefined && item.count > 0 && (
                                <span className={cn(
                                    "text-xs px-2 py-0.5 rounded-full",
                                    isActive
                                        ? "bg-orange-100 dark:bg-orange-900/30 text-primary dark:text-orange-300"
                                        : "bg-border text-muted-foreground"
                                )}>
                                    {item.count}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
