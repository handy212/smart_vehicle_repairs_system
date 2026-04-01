"use client";

import { AlertTriangle, DollarSign, Package, Truck, Wrench } from "lucide-react";
import { StatCard } from "./StatCard";

import { useCurrency } from "@/lib/hooks/useCurrency";

interface SummaryStatsGridProps {
    stats: {
        today_revenue: number;
        month_revenue: number;
        active_work_orders: number;
        today_appointments: number;
        total_vehicles: number;
        week_revenue: number;
        overdue_invoices: number;
        overdue_amount: number;
        low_stock_items: number;
        active_roadside?: number;
        roadside_completed_today?: number;
        pending_estimates?: number;
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
            description: `Week to date ${formatCurrency(stats.week_revenue || 0)}`,
            linkLabel: "Billing",
        },
        {
            label: "Active Jobs",
            value: stats.active_work_orders,
            icon: Wrench,
            color: "#0230a1",
            link: "/workorders",
            description: `${stats.today_appointments || 0} appointments booked for today`,
            linkLabel: "Work orders",
        },
        {
            label: "Overdue Invoices",
            value: stats.overdue_invoices || 0,
            icon: AlertTriangle,
            color: "#ef4444",
            link: "/billing/invoices",
            description: `${formatCurrency(stats.overdue_amount || 0)} still outstanding`,
            linkLabel: "Invoices",
        },
        {
            label: "Low Stock",
            value: stats.low_stock_items || 0,
            icon: Package,
            color: "#f59e0b",
            link: "/inventory",
            description: `${stats.pending_estimates || 0} estimates are still waiting for follow-up`,
            linkLabel: "Inventory",
        },
        {
            label: "Roadside Live",
            value: stats.active_roadside || 0,
            icon: Truck,
            color: "#0f766e",
            link: "/roadside",
            description: `${stats.roadside_completed_today || 0} requests completed today`,
            linkLabel: "Dispatch",
        },
    ];

    return (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 2xl:grid-cols-5">
            {statItems.map((stat) => (
                <StatCard 
                    key={stat.label}
                    title={stat.label}
                    value={stat.value}
                    icon={stat.icon}
                    color={stat.color}
                    link={stat.link}
                    description={stat.description}
                    linkLabel={stat.linkLabel}
                />
            ))}
        </div>
    );
}
