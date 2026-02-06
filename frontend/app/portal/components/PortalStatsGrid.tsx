"use client";

import {
    Car,
    Calendar,
    FileText,
    DollarSign
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Card, CardContent } from "@/components/ui/card";
import { useCurrency } from "@/lib/hooks/useCurrency";

interface PortalStats {
    total_vehicles: number;
    upcoming_appointments_count: number;
    pending_invoices_count: number;
    total_spent: number;
}

interface PortalStatsGridProps {
    stats: PortalStats;
}

export function PortalStatsGrid({ stats }: PortalStatsGridProps) {
    const { formatCurrency } = useCurrency();

    const items = [
        {
            label: "My Vehicles",
            value: stats.total_vehicles,
            icon: Car,
            color: "text-primary dark:text-primary",
            bg: "bg-primary/10 dark:bg-orange-900/20",
            href: "/portal/vehicles"
        },
        {
            label: "Upcoming Service",
            value: stats.upcoming_appointments_count,
            icon: Calendar,
            color: "text-success",
            bg: "bg-success/10 dark:bg-green-900/20",
            href: "/portal/appointments",
            alert: stats.upcoming_appointments_count > 0
        },
        {
            label: "Pending Invoices",
            value: stats.pending_invoices_count,
            icon: FileText,
            color: "text-yellow-600 dark:text-yellow-400",
            bg: "bg-warning/10 dark:bg-yellow-900/20",
            href: "/portal/invoices",
            alert: stats.pending_invoices_count > 0
        },
        {
            label: "Total Spent",
            value: formatCurrency(stats.total_spent || 0),
            icon: DollarSign,
            color: "text-purple-600 dark:text-purple-400",
            bg: "bg-purple-50 dark:bg-purple-900/20",
            href: "/portal/history" // or invoices
        }
    ];

    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {items.map((item, index) => (
                <Card key={index} className="border-none shadow-sm bg-white/50 bg-background/50 hover:bg-white dark:hover:bg-gray-900 transition-colors group">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{item.label}</p>
                            <div className="flex items-center gap-2">
                                <span className="text-2xl font-bold text-foreground">{item.value}</span>
                                {item.alert && (
                                    <span className="flex h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                                )}
                            </div>
                        </div>
                        <div className={cn("p-2 rounded-xl transition-all duration-300 group-hover:scale-110", item.bg)}>
                            <item.icon className={cn("w-5 h-5", item.color)} />
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
