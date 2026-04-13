"use client";

import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { Card, CardContent } from "@/components/ui/card";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { PremiumIcons } from "@/components/ui/icons";

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
            icon: PremiumIcons.Car,
            iconClass: "text-primary",
            iconBg: "bg-primary/10",
            href: "/portal/vehicles"
        },
        {
            label: "Upcoming Service",
            value: stats.upcoming_appointments_count,
            icon: PremiumIcons.Calendar,
            iconClass: "text-success",
            iconBg: "bg-success/10",
            href: "/portal/appointments",
            alert: stats.upcoming_appointments_count > 0
        },
        {
            label: "Pending Invoices",
            value: stats.pending_invoices_count,
            icon: PremiumIcons.Receipt,
            iconClass: "text-warning",
            iconBg: "bg-warning/10",
            href: "/portal/invoices",
            alert: stats.pending_invoices_count > 0
        },
        {
            label: "Total Spent",
            value: formatCurrency(stats.total_spent || 0),
            icon: PremiumIcons.CreditCard,
            iconClass: "text-muted-foreground",
            iconBg: "bg-muted",
            href: "/portal/history"
        }
    ];

    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {items.map((item, index) => (
                <Link key={index} href={item.href}>
                    <Card className="hover:bg-muted/40 transition-colors cursor-pointer">
                        <CardContent className="p-4 flex items-center justify-between">
                            <div className="space-y-1">
                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.1em]">
                                    {item.label}
                                </p>
                                <div className="flex items-center gap-2">
                                    <span className="text-xl font-bold text-foreground">
                                        {item.value}
                                    </span>
                                    {item.alert && (
                                        <span className="inline-flex h-2 w-2 rounded-full bg-red-500" />
                                    )}
                                </div>
                            </div>
                            <div className={cn("p-2 rounded-lg", item.iconBg)}>
                                <item.icon className={cn("w-5 h-5", item.iconClass)} />
                            </div>
                        </CardContent>
                    </Card>
                </Link>
            ))}
        </div>
    );
}
