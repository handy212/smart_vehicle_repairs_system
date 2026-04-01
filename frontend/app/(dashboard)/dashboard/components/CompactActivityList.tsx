"use client";

import { useState } from "react";
import Link from "next/link";
import { PremiumIcons } from "@/components/ui/icons";
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
    wo_number: string;
    customer?: string;
    vehicle?: string;
    status: string;
}

interface CompactActivityListProps {
    appointments?: Appointment[];
    workOrders?: WorkOrder[];
}

export function CompactActivityList({ appointments, workOrders }: CompactActivityListProps) {
    const [activeTab, setActiveTab] = useState<'appointments' | 'work_orders'>('appointments');
    const appointmentCount = appointments?.length || 0;
    const workOrderCount = workOrders?.length || 0;

    return (
        <div className="precision-card h-full flex flex-col">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-primary shadow-sm">
                        <PremiumIcons.Activity className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-foreground uppercase tracking-widest">Activity</h3>
                        <p className="text-[11px] font-medium text-gray-400">Workshop pulse</p>
                    </div>
                </div>
            </div>

            {/* Tab Switcher */}
            <div className="flex items-center p-1 bg-muted rounded-xl mb-6">
                <button
                    onClick={() => setActiveTab('appointments')}
                    className={cn(
                        "flex-1 py-2 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all",
                        activeTab === 'appointments' ? "bg-background text-primary shadow-sm" : "text-gray-400 hover:text-gray-600 dark:hover:text-white"
                    )}
                >
                    Agenda ({appointmentCount})
                </button>
                <button
                    onClick={() => setActiveTab('work_orders')}
                    className={cn(
                        "flex-1 py-2 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all",
                        activeTab === 'work_orders' ? "bg-background text-primary shadow-sm" : "text-gray-400 hover:text-gray-600 dark:hover:text-white"
                    )}
                >
                    Recent Jobs ({workOrderCount})
                </button>
            </div>

            <div className="flex-1 space-y-3 overflow-hidden">
                {activeTab === 'appointments' ? (
                    appointments && appointments.length > 0 ? (
                        appointments.slice(0, 4).map((apt) => (
                            <Link key={apt.id} href={`/appointments/${apt.id}`} className="block group">
                                <div className="flex items-center justify-between p-3 rounded-xl hover:bg-muted transition-all">
                                    <div className="min-w-0">
                                        <p className="text-[11px] font-bold text-foreground truncate uppercase tracking-tight group-hover:text-primary transition-colors">
                                            {apt.customer_name || "Guest"}
                                        </p>
                                        <p className="text-[9px] font-medium text-gray-400 opacity-70 truncate">{apt.vehicle_display || "No Vehicle"}</p>
                                    </div>
                                    <div className="text-right flex flex-col items-end">
                                        <span className="text-[10px] font-bold text-primary font-mono">{apt.appointment_time}</span>
                                        <div className={cn(
                                            "w-1 h-1 rounded-full mt-1",
                                            apt.status === "confirmed" ? "bg-emerald-500" : "bg-amber-500"
                                        )} />
                                    </div>
                                </div>
                            </Link>
                        ))
                    ) : (
                        <div className="flex flex-col items-center justify-center py-10 opacity-30 text-center">
                            <p className="text-[10px] font-black uppercase tracking-widest">No appointments</p>
                        </div>
                    )
                ) : (
                    workOrders && workOrders.length > 0 ? (
                        workOrders.slice(0, 4).map((wo) => (
                            <Link key={wo.id} href={`/workorders/${wo.id}`} className="block group">
                                <div className="flex items-center justify-between p-3 rounded-xl hover:bg-muted transition-all">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-1.5 mb-0.5">
                                            <span className="text-[10px] font-black text-primary font-mono opacity-50">#{wo.wo_number.slice(-4)}</span>
                                            <p className="text-[11px] font-bold text-foreground truncate uppercase tracking-tight group-hover:text-primary transition-colors">
                                                {wo.customer || "N/A"}
                                            </p>
                                        </div>
                                        <p className="text-[9px] font-medium text-gray-400 opacity-70 truncate">{wo.vehicle || "No Info"}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{wo.status.replace(/_/g, " ")}</span>
                                        <div className={cn(
                                            "w-1.5 h-1.5 rounded-full",
                                            wo.status === "in_progress" ? "bg-emerald-500 animate-pulse" : "bg-gray-300"
                                        )} />
                                    </div>
                                </div>
                            </Link>
                        ))
                    ) : (
                        <div className="flex flex-col items-center justify-center py-10 opacity-30 text-center">
                            <p className="text-[10px] font-black uppercase tracking-widest">No recent jobs</p>
                        </div>
                    )
                )}
            </div>
        </div>
    );
}
