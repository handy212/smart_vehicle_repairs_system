"use client";

import React from "react";
import { motion } from "framer-motion";
import { AdvancedWidget } from "./AdvancedWidget";
import { PremiumIcons } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface ShopPulseProps {
    workOrderStats?: {
        by_status?: Array<{ status: string; count: number }>;
        summary?: {
            average_completion_hours?: number | null;
        };
    };
}

export function ShopPulse({ workOrderStats }: ShopPulseProps) {
    const statusGroups = [
        {
            id: "intake",
            label: "Intake",
            keys: ["intake", "inspection"],
            color: "text-blue-500",
            bg: "bg-blue-500/10",
            icon: "Calendar"
        },
        {
            id: "diagnosis",
            label: "Diagnosis",
            keys: ["diagnosis", "awaiting_approval"],
            color: "text-amber-500",
            bg: "bg-amber-500/10",
            icon: "Stethoscope"
        },
        {
            id: "repair",
            label: "Repair",
            keys: ["assigned", "in_progress", "additional_work_found"],
            color: "text-primary",
            bg: "bg-primary/10",
            icon: "Wrench"
        },
        {
            id: "qc",
            label: "QC & Ready",
            keys: ["quality_check", "completed"],
            color: "text-emerald-500",
            bg: "bg-emerald-500/10",
            icon: "CheckCircle"
        },
    ];

    const getGroupCount = (keys: string[]) => {
        if (!workOrderStats?.by_status) return 0;
        return workOrderStats.by_status
            .filter((s) => keys.includes(s.status))
            .reduce((acc, curr) => acc + curr.count, 0);
    };

    const activeBayStatuses = ["in_progress", "diagnosis", "inspection", "quality_check"];
    const activeJobs = workOrderStats?.by_status
        ?.filter(s => activeBayStatuses.includes(s.status))
        .reduce((sum, item) => sum + item.count, 0) || 0;

    const totalBays = 12; // Capacity
    const occupancyRate = (activeJobs / totalBays) * 100;

    const avgCycleHours = workOrderStats?.summary?.average_completion_hours || 0;
    const avgCycleDays = avgCycleHours > 0 ? (avgCycleHours / 24).toFixed(1) : "N/A";

    return (
        <AdvancedWidget
            title="Real-time Shop Pulse"
            icon="Dashboard"
            className="h-full"
            headerAction={
                <Link
                    href="/workorders"
                    className="text-[10px] font-bold uppercase tracking-widest text-primary hover:opacity-80 flex items-center gap-1 transition-all"
                >
                    Live Board
                    <PremiumIcons.ChevronDown className="w-3 h-3 -rotate-90" />
                </Link>
            }
        >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 relative">
                {/* Visual Flow Connectors */}
                <div className="absolute top-[38px] left-[12.5%] right-[12.5%] h-0.5 bg-gradient-to-r from-blue-500/20 via-primary/20 to-emerald-500/20 -z-0 hidden md:block" />

                {statusGroups.map((group, idx) => {
                    const count = getGroupCount(group.keys);
                    const Icon = PremiumIcons[group.icon as keyof typeof PremiumIcons];

                    return (
                        <Link
                            key={group.id}
                            href={`/workorders?group=${group.id}`}
                            className="relative flex flex-col items-center group/stage z-10"
                        >
                            <motion.div
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                className={cn(
                                    "w-20 h-20 rounded-2xl flex flex-col items-center justify-center transition-all duration-300 border mb-3",
                                    count > 0
                                        ? cn("bg-card border-white/10 shadow-premium", group.bg)
                                        : "bg-muted/30 border-transparent opacity-50"
                                )}
                            >
                                <div className={cn("p-1.5 rounded-lg mb-1", count > 0 ? group.bg : "bg-muted/50")}>
                                    <Icon className={cn("w-4 h-4", count > 0 ? group.color : "text-muted-foreground")} />
                                </div>
                                <span className={cn(
                                    "text-2xl font-black tracking-tighter leading-none",
                                    count > 0 ? group.color : "text-muted-foreground"
                                )}>
                                    {count}
                                </span>
                            </motion.div>

                            <div className="text-center">
                                <p className="text-[10px] font-black uppercase tracking-widest text-foreground group-hover/stage:text-primary transition-colors">
                                    {group.label}
                                </p>
                                <div className="flex items-center justify-center gap-1 mt-0.5">
                                    {count > 0 && (
                                        <span className="relative flex h-1.5 w-1.5">
                                            <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", group.color.replace('text', 'bg'))}></span>
                                            <span className={cn("relative inline-flex rounded-full h-1.5 w-1.5", group.color.replace('text', 'bg'))}></span>
                                        </span>
                                    )}
                                    <p className="text-[9px] text-muted-foreground font-medium">
                                        {count} {count === 1 ? 'Job' : 'Jobs'}
                                    </p>
                                </div>
                            </div>
                        </Link>
                    );
                })}
            </div>

            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3 rounded-2xl bg-primary/5 border border-primary/10 flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-primary/10">
                        <PremiumIcons.Clock className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                        <p className="text-[10px] uppercase font-bold text-primary/60 tracking-wider">Avg. Cycle Time</p>
                        <p className="text-sm font-bold text-foreground">
                            {avgCycleDays} {avgCycleHours > 0 ? 'Days' : ''}
                        </p>
                    </div>
                </div>
                <div className="p-3 rounded-2xl bg-indigo-500/5 border border-indigo-500/10 flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-indigo-500/10">
                        <PremiumIcons.Users className="w-4 h-4 text-indigo-500" />
                    </div>
                    <div>
                        <p className="text-[10px] uppercase font-bold text-indigo-500/60 tracking-wider">Bays Occupied</p>
                        <p className="text-sm font-bold text-foreground">
                            {activeJobs} / {totalBays}
                            <span className={cn(
                                "text-[10px] font-medium ml-2",
                                occupancyRate >= 80 ? "text-amber-500" : "text-emerald-500"
                            )}>
                                {occupancyRate >= 80 ? "Heavy Load" : "Available"}
                            </span>
                        </p>
                    </div>
                </div>
            </div>
        </AdvancedWidget>
    );
}
