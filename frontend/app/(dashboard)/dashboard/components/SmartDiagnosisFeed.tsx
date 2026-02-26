"use client";

import React from "react";
import { PremiumIcons } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

interface DiagnosisLog {
    id: number;
    work_order_number: string;
    description: string;
    priority: 'critical' | 'warning' | 'info';
    timestamp: string;
}

interface SmartDiagnosisFeedProps {
    logs: DiagnosisLog[];
    isLoading: boolean;
}

import { AdvancedWidget } from "./AdvancedWidget";

export function SmartDiagnosisFeed({ logs, isLoading }: SmartDiagnosisFeedProps) {
    return (
        <AdvancedWidget
            title="Smart Scanner Activity"
            icon="Stethoscope"
            headerAction={
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                    <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                    </span>
                    <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Live Feed</span>
                </div>
            }
        >
            {isLoading ? (
                <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-12 bg-white/5 animate-pulse rounded-xl" />
                    ))}
                </div>
            ) : logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center bg-white/5 rounded-2xl border border-dashed border-white/10">
                    <PremiumIcons.Stethoscope className="w-8 h-8 text-muted-foreground/30 mb-2" />
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">No recent scans recorded</p>
                </div>
            ) : (
                <div className="space-y-1">
                    {/* eslint-disable-next-line @typescript-eslint/no-unused-vars */}
                    {logs.map((log, idx) => (
                        <div
                            key={log.id}
                            className="relative pl-4 py-2 group/item hover:bg-white/5 rounded-r-xl transition-colors border-l-2 border-white/10 hover:border-primary"
                        >
                            <div className={cn(
                                "absolute left-[-5px] top-3 w-2 h-2 rounded-full border-2 border-card shadow-sm z-10",
                                log.priority === 'critical' ? "bg-rose-500 shadow-rose-500/50" :
                                    log.priority === 'warning' ? "bg-amber-500 shadow-amber-500/50" : "bg-blue-500 shadow-blue-500/50"
                            )} />
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-[11px] font-semibold text-foreground truncate group-hover/item:text-primary transition-colors leading-tight">
                                        {log.description}
                                    </p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-[9px] font-bold text-muted-foreground/50 font-mono tracking-wider">{log.work_order_number}</span>
                                    </div>
                                </div>
                                <span className="text-[9px] font-bold text-muted-foreground/40 whitespace-nowrap bg-white/5 px-1.5 py-0.5 rounded uppercase tracking-wider">
                                    {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </AdvancedWidget>
    );
}
