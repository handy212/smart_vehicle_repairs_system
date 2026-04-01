"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Users, UserCheck, CreditCard, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { useState, useEffect } from "react";

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
  const [isPerfex, setIsPerfex] = useState(false);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      setIsPerfex(document.documentElement.classList.contains('perfex'));
    }
  }, []);

  if (isPerfex) {
    const perfexItems = [
      { label: "Total Customers", value: stats?.total_customers || 0, color: "text-foreground" },
      { label: "Active Customers", value: stats?.active_customers || 0, color: "text-success" },
      { label: "Inactive Customers", value: stats?.inactive_customers || 0, color: "text-destructive" },
      { label: "Active Contacts", value: stats?.active_contacts || 0, color: "text-info" },
      { label: "Inactive Contacts", value: stats?.inactive_contacts || 0, color: "text-destructive" },
      { label: "Contacts Logged In Today", value: 0, color: "text-foreground" },
    ];

    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        {perfexItems.map((item, idx) => (
          <Card key={idx} className="precision-card border-none shadow-none bg-white rounded-md">
            <CardContent className="p-3 flex items-center justify-start gap-2">
              <span className="text-sm font-bold text-foreground">
                {isLoading ? "..." : item.value}
              </span>
              <span className={cn("text-[11px] font-medium opacity-80", item.color)}>
                {item.label}
              </span>
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
      color: "text-blue-600",
      bgColor: "bg-blue-50 dark:bg-blue-900/20",
    },
    {
      label: "Active Service",
      value: stats?.active_customers || 0,
      trend: "stable",
      icon: UserCheck,
      color: "text-emerald-600",
      bgColor: "bg-emerald-50 dark:bg-emerald-900/20",
    },
    {
      label: "Outstanding Balance",
      value: formatCurrency(totalBalance || 0),
      badge: "Alert",
      icon: CreditCard,
      color: "text-amber-600",
      bgColor: "bg-amber-50 dark:bg-amber-900/20",
    },
    {
      label: "New This Month",
      value: stats?.new_this_month || 0,
      trend: stats?.growth_percentage !== undefined 
        ? `${stats.growth_percentage >= 0 ? "+" : ""}${stats.growth_percentage}%`
        : "0%",
      icon: UserPlus,
      color: "text-purple-600",
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
                  item.trend.startsWith("+") || item.trend === "up" ? "text-emerald-500" : "text-amber-500"
                )}>
                  {item.trend === "up" ? "↗" : item.trend}
                </span>
              )}
              {item.badge && (
                <span className="px-1 py-0.5 rounded text-[8px] font-black uppercase tracking-widest bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400">
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
