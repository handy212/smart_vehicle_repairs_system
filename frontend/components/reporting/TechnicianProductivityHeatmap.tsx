"use client";

import React from "react";
import { cn } from "@/lib/utils/cn";
import { useCurrency } from "@/lib/hooks/useCurrency";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

interface TechMetric {
    technician: {
        id: number;
        name: string;
    };
    metrics: {
        total_work_orders: number;
        completed: number;
        revenue: number;
        average_completion_hours?: number;
    };
}

interface TechnicianProductivityHeatmapProps {
    data: TechMetric[];
}

export function TechnicianProductivityHeatmap({ data }: TechnicianProductivityHeatmapProps) {
    const { formatCurrency } = useCurrency();

    // Define metrics we want to visualize in the "heatmap" grid
    const metrics = [
        { key: "completed", label: "Volume", color: "bg-primary" },
        { key: "revenue", label: "Revenue", color: "bg-success/100" },
        { key: "average_completion_hours", label: "Efficiency", color: "bg-purple-500", invert: true },
        { key: "success_rate", label: "Completion %", color: "bg-warning/100" },
    ];

    // Calculate max values for normalization
    const maxValues = data.reduce(
        (acc, item) => {
            const successRate = (item.metrics.completed / (item.metrics.total_work_orders || 1)) * 100;
            return {
                completed: Math.max(acc.completed, item.metrics.completed),
                revenue: Math.max(acc.revenue, item.metrics.revenue),
                average_completion_hours: Math.max(acc.average_completion_hours, item.metrics.average_completion_hours || 0),
                success_rate: Math.max(acc.success_rate, successRate),
            };
        },
        { completed: 0, revenue: 0, average_completion_hours: 0, success_rate: 0 }
    );

    return (
        <div className="overflow-x-auto">
            <TooltipProvider>
                <div className="min-w-[600px] w-full">
                    <div className="grid grid-cols-[150px_repeat(4,1fr)] gap-2 mb-4">
                        <div className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Technician</div>
                        {metrics.map((m) => (
                            <div key={m.key} className="text-sm font-bold text-muted-foreground uppercase tracking-wider text-center">
                                {m.label}
                            </div>
                        ))}
                    </div>

                    <div className="space-y-2">
                        {data.map((tech) => {
                            const successRate = (tech.metrics.completed / (tech.metrics.total_work_orders || 1)) * 100;
                            const values: Record<string, number> = {
                                completed: tech.metrics.completed,
                                revenue: tech.metrics.revenue,
                                average_completion_hours: tech.metrics.average_completion_hours || 0,
                                success_rate: successRate,
                            };

                            return (
                                <div key={tech.technician.id} className="grid grid-cols-[150px_repeat(4,1fr)] gap-2 items-center group">
                                    <div className="text-sm font-semibold truncate group-hover:text-primary transition-colors">
                                        {tech.technician.name}
                                    </div>
                                    {metrics.map((m) => {
                                        const val = values[m.key];
                                        const max = maxValues[m.key as keyof typeof maxValues];
                                        let intensity = max > 0 ? val / max : 0;

                                        if (m.invert) {
                                            intensity = 1 - intensity;
                                        }

                                        return (
                                            <Tooltip key={m.key}>
                                                <TooltipTrigger asChild>
                                                    <div className="relative h-10 w-full bg-muted rounded-lg overflow-hidden border border-border">
                                                        <div
                                                            className={cn("absolute inset-0 transition-all duration-500", m.color)}
                                                            style={{ opacity: 0.1 + intensity * 0.8 }}
                                                        />
                                                        <div className="absolute inset-0 flex items-center justify-center text-xs font-bold">
                                                            {m.key === "revenue" ? formatCurrency(val) :
                                                                m.key === "success_rate" ? `${val.toFixed(0)}%` :
                                                                    m.key === "average_completion_hours" ? `${val?.toFixed(1) || "N/A"}h` :
                                                                        val}
                                                        </div>
                                                    </div>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p className="text-xs">
                                                        {tech.technician.name}'s {m.label}: {m.key === "revenue" ? formatCurrency(val) : val}
                                                    </p>
                                                </TooltipContent>
                                            </Tooltip>
                                        );
                                    })}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </TooltipProvider>
        </div>
    );
}
