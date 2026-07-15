"use client";

import { Users, UserCheck, CreditCard, UserPlus, UserX } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { WORKSHOP_PANEL_CLASS } from "@/lib/constants/table-typography";

interface CustomerStatsProps {
  stats: {
    total_customers: number;
    active_customers: number;
    inactive_customers: number;
    active_contacts: number;
    inactive_contacts: number;
    new_this_month: number;
    growth_percentage: number;
  } | undefined;
  isLoading: boolean;
  totalBalance?: number;
}

export function CustomerStats({ stats, isLoading, totalBalance }: CustomerStatsProps) {
  const { formatCurrency } = useCurrency();

  const items = [
    { label: "Total Customers", value: stats?.total_customers || 0, icon: Users, color: "text-primary", bgColor: "bg-primary/10" },
    { label: "Active Customers", value: stats?.active_customers || 0, icon: UserCheck, color: "text-success", bgColor: "bg-success/10" },
    { label: "Inactive Customers", value: stats?.inactive_customers || 0, icon: UserX, color: "text-destructive", bgColor: "bg-destructive/10" },
    { label: "Outstanding Balance", value: formatCurrency(totalBalance || 0), icon: CreditCard, color: "text-warning", bgColor: "bg-warning/10" },
    { label: "New This Month", value: stats?.new_this_month || 0, icon: UserPlus, color: "text-info", bgColor: "bg-info/10" },
    { label: "Active Contacts", value: stats?.active_contacts || 0, icon: Users, color: "text-primary", bgColor: "bg-muted" },
  ];

  return (
    <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      {items.map((item) => (
        <div
          key={item.label}
          className={cn(WORKSHOP_PANEL_CLASS, "flex flex-col justify-between gap-3 p-4")}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {item.label}
            </p>
            <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", item.bgColor)}>
              <item.icon className={cn("h-4 w-4", item.color)} />
            </div>
          </div>
          <p className="text-2xl font-bold leading-none tracking-tight text-foreground tabular-nums">
            {isLoading ? "—" : item.value}
          </p>
        </div>
      ))}
    </div>
  );
}
