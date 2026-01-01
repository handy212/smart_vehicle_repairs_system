"use client";

import { Card, CardContent } from "@/components/ui/card";
import { DollarSign, Wrench, Calendar, Car, AlertTriangle } from "lucide-react";
import Link from "next/link";

interface SummaryStatsGridProps {
    stats: {
        today_revenue: number;
        month_revenue: number;
        active_work_orders: number;
        today_appointments: number;
        total_vehicles: number;
        overdue_invoices: number;
        low_stock_items: number;
    };
}

export function SummaryStatsGrid({ stats }: SummaryStatsGridProps) {
    const statItems = [
        {
            label: "Today Revenue",
            value: `$${parseFloat(String(stats.today_revenue || 0)).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            })}`,
            icon: DollarSign,
            iconColor: "text-emerald-500",
            link: "/billing",
        },
        {
            label: "Month Revenue",
            value: `$${parseFloat(String(stats.month_revenue || 0)).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            })}`,
            icon: DollarSign,
            iconColor: "text-blue-500",
            link: "/billing",
        },
        {
            label: "Active Jobs",
            value: stats.active_work_orders,
            icon: Wrench,
            iconColor: "text-purple-500",
            link: "/workorders",
        },
        {
            label: "Today's Appts",
            value: stats.today_appointments,
            icon: Calendar,
            iconColor: "text-yellow-500",
            link: "/appointments",
        },
        {
            label: "Vehicles on Site",
            value: stats.total_vehicles,
            icon: Car,
            iconColor: "text-gray-400",
            link: "/vehicles",
        },
    ];

    // Add alert stat if there are issues
    if (stats.overdue_invoices > 0 || stats.low_stock_items > 0) {
        statItems.push({
            label: "Alerts",
            value: stats.overdue_invoices + stats.low_stock_items,
            icon: AlertTriangle,
            iconColor: "text-red-500",
            link: "/billing",
        });
    }

    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {statItems.map((stat) => {
                const Icon = stat.icon;
                return (
                    <Link key={stat.label} href={stat.link} className="block group">
                        <Card className="shadow-none border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-blue-200 dark:hover:border-blue-900/50 hover:shadow-md hover:shadow-blue-500/5 transition-all duration-300 cursor-pointer h-full">
                            <CardContent className="p-4 flex flex-col gap-1">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                                        {stat.label}
                                    </span>
                                    <div className={`p-1.5 rounded-lg bg-gray-50 dark:bg-gray-800 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 transition-colors`}>
                                        <Icon className={`w-3.5 h-3.5 ${stat.iconColor} group-hover:scale-110 transition-transform`} />
                                    </div>
                                </div>
                                <div className="text-xl font-bold text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
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
