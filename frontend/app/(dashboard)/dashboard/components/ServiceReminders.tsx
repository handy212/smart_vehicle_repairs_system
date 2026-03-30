"use client";

import React from "react";
import { PremiumIcons } from "@/components/ui/icons";

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

    if (isLoading) {
        return <div className="grid grid-cols-2 gap-3 pb-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />)}
        </div>;
    }

    return (
        <div className="precision-card p-6 h-full flex flex-col">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-6">Service Intelligence</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
                {reminders.map((vehicle) => {
                    // Calculate a dynamic status based on data presence
                    const isMissingMileage = !vehicle.mileage;
                    const isMissingDate = !vehicle.last_service_date;
                    const statusType = isMissingMileage || isMissingDate ? 'warning' : 'danger';
                    
                    const Icon = statusType === 'danger' 
                        ? PremiumIcons.AlertCircle 
                        : PremiumIcons.AlertTriangle;
                    
                    const iconColor = statusType === 'danger' 
                        ? 'text-red-500' 
                        : 'text-amber-500';

                    return (
                        <div key={vehicle.id} className="p-4 rounded-xl bg-muted flex flex-col justify-between border border-transparent hover:border-gray-200 dark:hover:border-gray-700 transition-all group">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <h4 className="text-[11px] font-bold text-foreground truncate uppercase tracking-tight">
                                        {vehicle.vehicle_info}
                                    </h4>
                                    <p className="text-[9px] font-bold text-gray-400 mt-0.5">({vehicle.license_plate})</p>
                                </div>
                                <Icon className={`w-4 h-4 flex-shrink-0 ${iconColor}`} />
                            </div>

                             <div className="mt-4 flex items-center justify-between">
                                <span className="text-[10px] font-bold text-foreground">{vehicle.mileage?.toLocaleString() || 'Unknown'} km</span>
                                <div className="bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded text-[9px] font-bold text-foreground uppercase">
                                    Service Due
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
