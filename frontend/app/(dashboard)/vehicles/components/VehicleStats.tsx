"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Car, Wrench, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface VehicleStatsProps {
  stats: {
    total_vehicles?: number;
    active_vehicles?: number;
    in_service_vehicles?: number;
    due_service_vehicles?: number;
    sold_vehicles?: number;
  } | undefined;
  isLoading: boolean;
}

export function VehicleStats({ stats, isLoading }: VehicleStatsProps) {
  const statItems = [
    {
      label: "Total Vehicles",
      value: stats?.total_vehicles || 0,
      trend: "+2%", // Demo data or fetch from API
      icon: Car,
      color: "text-blue-600",
      bgColor: "bg-blue-50 dark:bg-blue-900/20",
    },
    {
      label: "Active Fleet",
      value: stats?.active_vehicles || 0,
      trend: "stable",
      icon: CheckCircle2,
      color: "text-emerald-600",
      bgColor: "bg-emerald-50 dark:bg-emerald-900/20",
    },
    {
      label: "Service Due",
      value: stats?.due_service_vehicles || 0,
      badge: stats?.due_service_vehicles && stats.due_service_vehicles > 0 ? "Critical" : undefined,
      icon: AlertTriangle,
      color: "text-amber-600",
      bgColor: "bg-amber-50 dark:bg-amber-900/20",
    },
    {
      label: "In Service",
      value: stats?.in_service_vehicles || 0,
      trend: "up",
      icon: Wrench,
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
