"use client";

import Link from "next/link";
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
            <div className="mb-6 flex items-center justify-between gap-3">
                <div>
                    <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">Service Intelligence</h3>
                    <p className="mt-2 text-sm font-semibold text-foreground">
                        Vehicles likely due for a callback or maintenance touchpoint.
                    </p>
                </div>
                <div className="rounded-full bg-muted px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                    {vehicles.length} Due
                </div>
            </div>
            
            {reminders.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/40 px-6 py-10 text-center">
                    <PremiumIcons.CheckCircle className="mb-3 h-10 w-10 text-success" />
                    <p className="text-sm font-semibold text-foreground">No service reminders need attention right now.</p>
                    <p className="mt-2 max-w-sm text-xs leading-5 text-muted-foreground">
                        When vehicles become overdue based on mileage or service history, they will appear here for quick follow-up.
                    </p>
                </div>
            ) : (
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
                        ? 'text-destructive' 
                        : 'text-warning';

                    return (
                        <Link
                            key={vehicle.id}
                            href={`/vehicles/${vehicle.id}`}
                            className="rounded-xl border border-transparent bg-muted p-4 transition-all group hover:border-gray-200 dark:hover:border-gray-700"
                        >
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
                        </Link>
                    );
                })}
                </div>
            )}
        </div>
    );
}
