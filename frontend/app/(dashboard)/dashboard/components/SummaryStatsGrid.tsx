"use client";

import { Card, CardContent } from "@/components/ui/card";
import { DollarSign, Wrench, AlertTriangle } from "lucide-react";
import { StatCard } from "./StatCard";

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
            color: "#10b981",
            link: "/billing",
        },
        {
            label: "Active Jobs",
            value: stats.active_work_orders,
            icon: Wrench,
            color: "#0230a1",
            link: "/workorders",
        },
        {
            label: "Alerts",
            value: (stats.overdue_invoices || 0) + (stats.low_stock_items || 0),
            icon: AlertTriangle,
            color: "#ef4444",
            link: "/inventory",
        },
    ];

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {statItems.map((stat) => (
                <StatCard 
                    key={stat.label}
                    title={stat.label}
                    value={stat.value}
                    icon={stat.icon}
                    color={stat.color}
                    link={stat.link}
                />
            ))}
        </div>
    );
}
