"use client";

import Link from "next/link";
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

export function SmartDiagnosisFeed({ logs, isLoading }: SmartDiagnosisFeedProps) {
    const displayLogs = logs.slice(0, 5);

    return (
        <div className="precision-card h-full flex flex-col">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-primary shadow-sm">
                        <PremiumIcons.Stethoscope className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-foreground uppercase tracking-widest">Diagnosis</h3>
                        <p className="text-[11px] font-medium text-gray-400">Scanner activity</p>
                    </div>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-success/10 dark:bg-emerald-900/20">
                    <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success/100"></span>
                    </span>
                    <span className="text-[9px] font-bold text-success dark:text-emerald-400 uppercase tracking-widest">Live</span>
                </div>
            </div>

            <div className="flex-1 space-y-4">
                {isLoading ? (
                    [1, 2, 3].map((i) => (
                        <div key={i} className="h-12 bg-muted animate-pulse rounded-lg" />
                    ))
                ) : logs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 opacity-30 text-center">
                        <PremiumIcons.Stethoscope className="w-8 h-8 mb-2" />
                        <p className="text-[10px] font-black uppercase tracking-widest">No active scans</p>
                    </div>
                ) : (
                    displayLogs.map((log) => (
                        <Link key={log.id} href={`/workorders/${log.id}`} className="block">
                            <div className="relative border-l-2 border-muted pb-4 pl-6 last:border-0 last:pb-0 group">
                                <div 
                                    className={cn(
                                        "absolute left-[-5px] top-1 w-2.5 h-2.5 rounded-full border-2 border-background shadow-sm z-10 transition-colors",
                                        log.priority === 'critical' ? "bg-rose-500" :
                                        log.priority === 'warning' ? "bg-warning/100" : "bg-info/100"
                                    )} 
                                />
                                <div className="flex items-start justify-between gap-4 rounded-xl p-2 transition-colors group-hover:bg-muted/70">
                                    <div className="min-w-0">
                                        <p className="text-[11px] font-bold text-foreground truncate uppercase tracking-tight group-hover:text-primary transition-colors leading-tight">
                                            {log.description}
                                        </p>
                                        <div className="mt-1 flex items-center gap-2">
                                            <span className="text-[9px] font-bold text-gray-400 font-mono tracking-wider">{log.work_order_number}</span>
                                        </div>
                                    </div>
                                    <span className="text-[9px] font-bold text-gray-300 whitespace-nowrap uppercase tracking-widest">
                                        {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                            </div>
                        </Link>
                    ))
                )}
            </div>
        </div>
    );
}
