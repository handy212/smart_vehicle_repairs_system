"use client";

import { Car, Wrench, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { WORKSHOP_PANEL_CLASS } from "@/lib/constants/table-typography";

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
  const items = [
    {
      label: "Total Vehicles",
      value: stats?.total_vehicles || 0,
      icon: Car,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      label: "Active Fleet",
      value: stats?.active_vehicles || 0,
      icon: CheckCircle2,
      color: "text-success",
      bgColor: "bg-success/10",
    },
    {
      label: "Service Due",
      value: stats?.due_service_vehicles || 0,
      badge: stats?.due_service_vehicles && stats.due_service_vehicles > 0 ? "Critical" : undefined,
      icon: AlertTriangle,
      color: "text-warning",
      bgColor: "bg-warning/10",
    },
    {
      label: "In Service",
      value: stats?.in_service_vehicles || 0,
      icon: Wrench,
      color: "text-info",
      bgColor: "bg-info/10",
    },
  ];

  return (
    <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
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
          <div>
            <p className="text-2xl font-bold leading-none tracking-tight text-foreground tabular-nums">
              {isLoading ? "—" : item.value}
            </p>
            {item.badge && (
              <span className="mt-1.5 inline-flex rounded-md bg-warning/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warning">
                {item.badge}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
