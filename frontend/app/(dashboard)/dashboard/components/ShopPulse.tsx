"use client";

import React from "react";
import { PremiumIcons } from "@/components/ui/icons";
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
            color: "#3b82f6", // Blue
            icon: "Car"
        },
        {
            id: "diagnosis",
            label: "Diagnosis",
            keys: ["diagnosis", "awaiting_approval"],
            color: "#94a3b8", // Gray/Slate
            icon: "Stethoscope"
        },
        {
            id: "repair",
            label: "Repair",
            keys: ["assigned", "in_progress", "additional_work_found"],
            color: "#64748b", // Harder Gray
            icon: "Wrench"
        },
        {
            id: "qc",
            label: "QC",
            keys: ["quality_check"],
            color: "#22c55e", // Green
            icon: "ClipboardList"
        },
        {
            id: "ready",
            label: "Ready",
            keys: ["completed"],
            color: "#16a34a", // Deep Green
            icon: "CheckCircle"
        },
    ];

    const getGroupCount = (keys: string[]) => {
        if (!workOrderStats?.by_status) return 0;
        return workOrderStats.by_status
            .filter((s) => keys.includes(s.status))
            .reduce((acc, curr) => acc + curr.count, 0);
    };

    return (
        <div className="precision-card p-8 relative overflow-hidden">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-8 px-4">Real-Time Shop Pulse</h3>
            
            <div className="flex items-center justify-between gap-2 max-w-5xl mx-auto relative px-4">
                {statusGroups.map((group, idx) => {
                    const count = getGroupCount(group.keys);
                    const Icon = PremiumIcons[group.icon as keyof typeof PremiumIcons];

                    return (
                        <React.Fragment key={group.id}>
                            <div className="flex flex-col items-center gap-3 relative z-10">
                                <Link 
                                    href={`/workorders?group=${group.id}`}
                                    className="flex flex-col items-center group"
                                >
                                    <div 
                                        className="w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 group-hover:scale-110"
                                        style={{ backgroundColor: group.color, boxShadow: `0 0 20px ${group.color}33` }}
                                    >
                                        <Icon className="w-6 h-6 text-white" />
                                    </div>
                                    
                                    <div className="mt-3 text-center">
                                        <p className="text-[11px] font-bold text-foreground uppercase tracking-wider mb-0.5">{group.label}</p>
                                        <p className="text-[10px] text-gray-400 font-medium">({count} Job{count !== 1 ? 's' : ''})</p>
                                    </div>

                                    <div className="mt-2 px-3 py-1 rounded-full bg-muted text-[9px] font-black uppercase tracking-widest text-foreground group-hover:bg-primary group-hover:text-white transition-all flex items-center gap-1">
                                        {count} Job{count !== 1 ? 's' : ''}
                                        <PremiumIcons.ChevronRight className="w-2.5 h-2.5" />
                                    </div>
                                </Link>
                            </div>

                            {idx < statusGroups.length - 1 && (
                                <div className="flex-1 flex justify-center items-center py-4">
                                    <PremiumIcons.ChevronRight className="w-6 h-6 text-blue-500/20" />
                                </div>
                            )}
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );
}
