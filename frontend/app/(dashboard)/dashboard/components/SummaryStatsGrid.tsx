"use client";

import { Card, CardContent } from "@/components/ui/card";
import { DollarSign, Wrench, Calendar, Car, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useCurrency } from "@/lib/hooks/useCurrency";

interface SummaryStatsGridProps {
    stats: {
        today_revenue: number;
        month_revenue: number;
        active_work_orders: number;
        today_appointments: number;
        total_vehicles: number;
        overdue_invoices: number;
        low_stock_items: number;
        active_roadside?: number;
        mrr?: number;
    };
}

export function SummaryStatsGrid({ stats }: SummaryStatsGridProps) {
    const { formatCurrency } = useCurrency();

    const statItems = [
        {
            label: "Today Revenue",
            value: formatCurrency(stats.today_revenue || 0),
            icon: DollarSign,
            iconColor: "text-emerald-500",
            link: "/billing",
        },
        {
            label: "Active Jobs",
            value: stats.active_work_orders,
            icon: Wrench,
            iconColor: "text-blue-500",
            link: "/workorders",
        },
        {
            label: "Roadside",
            value: stats.active_roadside || 0,
            icon: Car,
            iconColor: "text-rose-500",
            link: "/roadside",
        },
        {
            label: "Today's Appts",
            value: stats.today_appointments,
            icon: Calendar,
            iconColor: "text-amber-500",
            link: "/appointments",
        },
        {
            label: "Month MRR",
            value: formatCurrency(stats.mrr || 0),
            icon: DollarSign,
            iconColor: "text-indigo-500",
            link: "/subscriptions",
        },
    ];

    // Add alert stat
    statItems.push({
        label: "Alerts",
        value: (stats.overdue_invoices || 0) + (stats.low_stock_items || 0),
        icon: AlertTriangle,
        iconColor: stats.overdue_invoices + stats.low_stock_items > 0 ? "text-red-500" : "text-muted-foreground",
        link: "/inventory",
    });

    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            {statItems.map((stat) => {
                const Icon = stat.icon;
                return (
                    <Link key={stat.label} href={stat.link} className="block group">
                        <Card className="shadow-none border border-border bg-card hover:border-orange-200 dark:hover:border-orange-900/50 hover:shadow-md hover:shadow-primary/5 transition-all duration-300 cursor-pointer h-full">
                            <CardContent className="p-3 flex flex-col gap-0.5">
                                <div className="flex items-center justify-between mb-0.5">
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                        {stat.label}
                                    </span>
                                    <div className={`p-1.5 rounded-lg bg-muted group-hover:bg-primary/10 dark:group-hover:bg-orange-900/20 transition-colors`}>
                                        <Icon className={`w-3.5 h-3.5 ${stat.iconColor} group-hover:scale-110 transition-transform`} />
                                    </div>
                                </div>
                                <div className="text-xl font-bold text-foreground group-hover:text-primary dark:group-hover:text-orange-400 transition-colors">
                                    {stat.value}
                                </div>
                            </CardContent>
                        </Card>
                    </Link>
                );
            })}
        </div>
    );
}
