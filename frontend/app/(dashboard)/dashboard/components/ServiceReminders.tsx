"use client";

import React from "react";
import { LazyMotion, domAnimation, m } from "framer-motion";
import { AdvancedWidget } from "./AdvancedWidget";
import { PremiumIcons } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface DueVehicle {
    id: number;
    vehicle_info: string;
    license_plate: string;
    last_service_date: string | null;
    mileage: number | null;
}

interface ServiceRemindersProps {
    vehicles: DueVehicle[];
    isLoading: boolean;
}

export function ServiceReminders({ vehicles, isLoading }: ServiceRemindersProps) {
    const reminders = vehicles.slice(0, 4);

    return (
        <AdvancedWidget
            title="Service Intelligence"
            icon="Bell"
            headerAction={
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest">{vehicles.length} Due</span>
                </div>
            }
        >
            {isLoading ? (
                <div className="space-y-4 py-2">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-16 bg-white/5 animate-pulse rounded-2xl" />
                    ))}
                </div>
            ) : reminders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center bg-white/5 rounded-3xl border border-dashed border-white/10">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-3">
                        <PremiumIcons.CheckCircle className="w-6 h-6 text-emerald-500" />
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-foreground">Maintenance Synchronized</p>
                    <p className="text-[9px] text-muted-foreground mt-1">No pending service alerts detected.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {reminders.map((vehicle, idx) => (
                        <m.div
                            key={vehicle.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.1 }}
                            className="group/vehicle p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-blue-500/20 transition-all cursor-pointer overflow-hidden relative"
                        >
                            <div className="relative z-10 flex items-start justify-between">
                                <div className="min-w-0">
                                    <p className="text-[11px] font-black uppercase tracking-tight text-foreground group-hover/vehicle:text-blue-400 transition-colors">
                                        {vehicle.vehicle_info}
                                    </p>
                                    <div className="flex items-center gap-3 mt-1.5">
                                        <span className="text-[9px] font-black text-muted-foreground bg-white/5 px-2 py-0.5 rounded-md border border-white/5 tracking-wider">
                                            {vehicle.license_plate}
                                        </span>
                                        {vehicle.mileage && (
                                            <span className="text-[9px] font-bold text-muted-foreground/60 flex items-center gap-1">
                                                <PremiumIcons.Car className="w-3 h-3" />
                                                {vehicle.mileage.toLocaleString()} km
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <button className="p-2 rounded-xl bg-blue-500/10 text-blue-500 hover:bg-blue-500 hover:text-white transition-all">
                                    <PremiumIcons.MessageSquare className="w-3.5 h-3.5" />
                                </button>
                            </div>

                            {vehicle.last_service_date && (
                                <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
                                    <div className="flex items-center gap-1.5 text-[9px] font-bold text-muted-foreground/60 uppercase">
                                        <PremiumIcons.Calendar className="w-3 h-3 opacity-50" />
                                        Last Service: {new Date(vehicle.last_service_date).toLocaleDateString()}
                                    </div>
                                    <div className="text-[8px] font-black text-blue-500 bg-blue-500/10 px-1.5 py-0.5 rounded-md uppercase tracking-tighter">
                                        Overdue
                                    </div>
                                </div>
                            )}
                        </m.div>
                    ))}

                    <Link
                        href="/services-due"
                        className="flex items-center justify-center w-full py-2.5 mt-2 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all group"
                    >
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground group-hover:text-foreground">Dispatch Reminders</span>
                    </Link>
                </div>
            )}
        </AdvancedWidget>
    );
}
