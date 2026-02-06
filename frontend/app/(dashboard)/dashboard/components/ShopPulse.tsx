"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { ChevronRight, Wrench } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface ShopPulseProps {
    workOrderStats?: {
        by_status?: Array<{ status: string; count: number }>;
    };
}

export function ShopPulse({ workOrderStats }: ShopPulseProps) {
    // Updated to match actual WorkOrder.STATUS_CHOICES from backend:
    // draft, inspection, intake, assigned, diagnosis, awaiting_approval, approved,
    // in_progress, additional_work_found, paused, quality_check, completed, invoiced, closed
    const statusFlow = [
        { key: "assigned", label: "Assigned" },       // Waiting for technician to start
        { key: "in_progress", label: "In Progress" }, // Actively being worked on
        { key: "quality_check", label: "Quality Check" }, // Ready for final check before completion
    ];

    const getStatusCount = (statusKey: string) => {
        if (!workOrderStats?.by_status) return 0;
        const found = workOrderStats.by_status.find((s) => s.status === statusKey);
        return found?.count || 0;
    };

    return (
        <Card className="border-t shadow-sm overflow-hidden bg-card">
            <CardHeader className="py-3 px-4 border-b bg-muted/30 dark:bg-gray-800/30">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="p-1 rounded bg-primary/10 text-primary">
                            <Wrench className="w-3.5 h-3.5" />
                        </div>
                        <CardTitle className="text-sm font-semibold text-foreground uppercase tracking-wider">
                            Shop Pulse
                        </CardTitle>
                    </div>
                    <Link
                        href="/workorders"
                        className="text-[10px] font-bold uppercase tracking-widest text-primary hover:text-orange-800 dark:hover:text-orange-300 flex items-center gap-1 transition-colors"
                    >
                        View Full Board
                        <ChevronRight className="w-3 h-3" />
                    </Link>
                </div>
            </CardHeader>
            <CardContent className="p-6">
                <div className="grid grid-cols-3 gap-8 relative">
                    {/* Progress Connectors */}
                    <div className="absolute top-[35%] left-[20%] right-[20%] h-px bg-border -z-0 hidden md:block" />

                    {statusFlow.map((status) => {
                        const count = getStatusCount(status.key);
                        return (
                            <Link
                                key={status.key}
                                href={`/workorders?status=${status.key}`}
                                className="relative flex flex-col items-center gap-3 group z-10"
                            >
                                <div className={cn(
                                    "flex items-center justify-center w-14 h-14 rounded-full border-2 transition-all duration-300",
                                    count > 0
                                        ? "bg-card dark:bg-gray-950 border-primary shadow-lg shadow-primary/10 scale-110"
                                        : "bg-muted border-border group-hover:border-border"
                                )}>
                                    <span className={cn(
                                        "text-2xl font-bold tracking-tight",
                                        count > 0 ? "text-primary" : "text-muted-foreground"
                                    )}>
                                        {count}
                                    </span>
                                </div>
                                <div className="text-center">
                                    <p className="text-[11px] font-bold text-foreground uppercase tracking-tighter">
                                        {status.label}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground mt-0.5">
                                        {count === 1 ? 'task' : 'tasks'} active
                                    </p>
                                </div>
                            </Link>
                        );
                    })}
                </div>

                <div className="mt-8 pt-4 border-t border-border flex items-center justify-center gap-4 text-[10px] font-medium text-muted-foreground uppercase tracking-widest">
                    <span className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                        Live Flow Monitoring
                    </span>
                </div>
            </CardContent>
        </Card>
    );
}
