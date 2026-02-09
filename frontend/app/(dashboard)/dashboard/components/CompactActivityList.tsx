"use client";

import { useState } from "react";
import Link from "next/link";
import { PremiumIcons } from "@/components/ui/icons";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Appointment {
    id: number;
    customer_name?: string;
    vehicle_display?: string;
    vehicle_info?: string;
    appointment_time?: string;
    status: string;
}

interface WorkOrder {
    id: number;
    wo_number: string;      // From dashboard API recent_activity
    customer?: string;      // From dashboard API recent_activity
    vehicle?: string;       // From dashboard API recent_activity
    status: string;
}

interface CompactActivityListProps {
    appointments?: Appointment[];
    workOrders?: WorkOrder[];
}

export function CompactActivityList({ appointments, workOrders }: CompactActivityListProps) {
    const [activeTab, setActiveTab] = useState<'appointments' | 'work_orders'>('appointments');

    return (
        <div className="space-y-4">
            {/* Tab Switcher */}
            <div className="flex items-center p-1 bg-white/5 rounded-xl border border-white/5">
                <button
                    onClick={() => setActiveTab('appointments')}
                    className={cn(
                        "flex-1 flex items-center justify-center gap-2 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all",
                        activeTab === 'appointments' ? "bg-primary/20 text-primary shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                    )}
                >
                    <PremiumIcons.Calendar className="w-3 h-3" />
                    Agenda
                </button>
                <button
                    onClick={() => setActiveTab('work_orders')}
                    className={cn(
                        "flex-1 flex items-center justify-center gap-2 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all",
                        activeTab === 'work_orders' ? "bg-purple-500/20 text-purple-400 shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                    )}
                >
                    <PremiumIcons.Wrench className="w-3 h-3" />
                    Recent Jobs
                </button>
            </div>

            {/* Content Area */}
            <div className="min-h-[200px]">
                {activeTab === 'appointments' && (
                    <div className="space-y-2">
                        {appointments && appointments.length > 0 ? (
                            appointments.slice(0, 5).map((apt) => (
                                <Link
                                    key={apt.id}
                                    href={`/appointments/${apt.id}`}
                                    className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-transparent hover:border-primary/20 transition-all group"
                                >
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[11px] font-bold text-foreground truncate group-hover:text-primary transition-colors">
                                            {apt.customer_name || "Guest Customer"}
                                        </p>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <div className="flex items-center gap-1 text-[9px] text-muted-foreground uppercase tracking-tight font-bold">
                                                <PremiumIcons.Clock className="w-2.5 h-2.5" />
                                                {apt.appointment_time || "TBD"}
                                            </div>
                                            <span className="text-[9px] text-muted-foreground truncate max-w-[120px] opacity-60">
                                                • {apt.vehicle_display || apt.vehicle_info || "No Vehicle"}
                                            </span>
                                        </div>
                                    </div>
                                    <Badge
                                        variant="outline"
                                        className={cn(
                                            "bg-transparent border-0 font-black uppercase text-[8px] tracking-widest",
                                            apt.status === "confirmed" ? "text-emerald-500" : apt.status === "pending" ? "text-amber-500" : "text-muted-foreground"
                                        )}
                                    >
                                        {apt.status}
                                    </Badge>
                                </Link>
                            ))
                        ) : (
                            <div className="flex flex-col items-center justify-center py-8 text-center opacity-40">
                                <PremiumIcons.Calendar className="w-8 h-8 mb-2" />
                                <p className="text-[10px] uppercase tracking-widest">No appointments today</p>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'work_orders' && (
                    <div className="space-y-2">
                        {workOrders && workOrders.length > 0 ? (
                            workOrders.slice(0, 5).map((wo) => (
                                <Link
                                    key={wo.id}
                                    href={`/workorders/${wo.id}`}
                                    className="flex items-center justify-between p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-transparent hover:border-purple-500/20 transition-all group"
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono text-[9px] font-black text-purple-400">
                                                #{wo.wo_number}
                                            </span>
                                            <p className="text-[11px] font-bold text-foreground truncate group-hover:text-purple-400 transition-colors">
                                                {wo.customer || "N/A"}
                                            </p>
                                        </div>
                                        <p className="text-[9px] text-muted-foreground mt-0.5 truncate uppercase tracking-tight font-medium opacity-60">
                                            {wo.vehicle || "No Vehicle Info"}
                                        </p>
                                    </div>
                                    <div className="flex items-center">
                                        <div className={cn(
                                            "w-1.5 h-1.5 rounded-full mr-2",
                                            wo.status === "in_progress" ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"
                                        )} />
                                        <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">
                                            {wo.status.replace(/_/g, " ")}
                                        </span>
                                    </div>
                                </Link>
                            ))
                        ) : (
                            <div className="flex flex-col items-center justify-center py-8 text-center opacity-40">
                                <PremiumIcons.Wrench className="w-8 h-8 mb-2" />
                                <p className="text-[10px] uppercase tracking-widest">No recent activity</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
