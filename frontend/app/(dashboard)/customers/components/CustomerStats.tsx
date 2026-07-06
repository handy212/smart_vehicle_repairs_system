"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Users, UserCheck, CreditCard, UserPlus, UserX } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { useTheme } from "@/lib/hooks/useTheme";

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
  const { theme: activeTheme } = useTheme();
  const isPerfex = activeTheme.startsWith("perfex");

  if (isPerfex) {
    const perfexItems = [
      { label: "Total Customers", value: stats?.total_customers || 0, icon: Users, color: "text-primary", bgColor: "bg-info/10" },
      { label: "Active Customers", value: stats?.active_customers || 0, icon: UserCheck, color: "text-success", bgColor: "bg-success/10" },
      { label: "Inactive Customers", value: stats?.inactive_customers || 0, icon: UserX, color: "text-destructive", bgColor: "bg-destructive/10" },
      { label: "Outstanding Balance", value: formatCurrency(totalBalance || 0), icon: CreditCard, color: "text-warning", bgColor: "bg-warning/10" },
      { label: "New This Month", value: stats?.new_this_month || 0, icon: UserPlus, color: "text-primary", bgColor: "bg-purple-50" },
      { label: "Active Contacts", value: stats?.active_contacts || 0, icon: Users, color: "text-sky-600", bgColor: "bg-sky-50" },
    ];

    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        {perfexItems.map((item, idx) => (
          <Card key={idx} className="border border-border bg-card rounded-md shadow-[0px_1px_15px_1px_rgba(90,90,90,0.08)]">
            <CardContent className="p-3 flex items-center gap-3">
              <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md", item.bgColor)}>
                <item.icon className={cn("h-4 w-4", item.color)} />
              </div>
              <div className="min-w-0">
                <p className="text-lg font-bold leading-none text-foreground">{isLoading ? "—" : item.value}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground truncate">{item.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const statItems = [
    {
      label: "Total Customers",
      value: stats?.total_customers || 0,
      trend: "+3%",
      icon: Users,
      color: "text-primary",
      bgColor: "bg-info/10 dark:bg-blue-900/20",
    },
    {
      label: "Active Service",
      value: stats?.active_customers || 0,
      trend: "stable",
      icon: UserCheck,
      color: "text-success",
      bgColor: "bg-success/10 dark:bg-emerald-900/20",
    },
    {
      label: "Outstanding Balance",
      value: formatCurrency(totalBalance || 0),
      badge: "Alert",
      icon: CreditCard,
      color: "text-warning",
      bgColor: "bg-warning/10 dark:bg-amber-900/20",
    },
    {
      label: "New This Month",
      value: stats?.new_this_month || 0,
      trend: stats?.growth_percentage !== undefined 
        ? `${stats.growth_percentage >= 0 ? "+" : ""}${stats.growth_percentage}%`
        : "0%",
      icon: UserPlus,
      color: "text-primary",
      bgColor: "bg-purple-50 dark:bg-purple-900/20",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {statItems.map((item, idx) => (
        <Card key={idx} className="precision-card overflow-hidden">
          <CardContent className="p-4">
            <div className="flex justify-between items-start mb-2">
              <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                {item.label}
              </span>
              <div className={cn("p-1.5 rounded-lg", item.bgColor)}>
                <item.icon className={cn("w-3.5 h-3.5", item.color)} />
              </div>
            </div>
            
            <div className="flex items-baseline gap-2">
              <h3 className="text-xl font-bold tracking-tighter text-foreground">
                {isLoading ? "..." : item.value}
              </h3>
              {item.trend && item.trend !== "stable" && (
                <span className={cn(
                  "text-[9px] font-bold",
                  item.trend.startsWith("+") || item.trend === "up" ? "text-success" : "text-warning"
                )}>
                  {item.trend === "up" ? "↗" : item.trend}
                </span>
              )}
              {item.badge && (
                <span className="px-1 py-0.5 rounded text-[8px] font-black uppercase tracking-widest bg-amber-100 dark:bg-amber-900/40 text-warning dark:text-amber-400">
                  {item.badge}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
