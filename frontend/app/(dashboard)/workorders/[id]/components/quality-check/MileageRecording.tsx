"use client";

import React from "react";
import { Gauge, Info } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { VehicleInspection } from "@/lib/api/inspections";
import type { QualityCheckWorkOrder } from "./QualityCheckForm";

interface MileageRecordingProps {
    initialInspection?: VehicleInspection | null;
    workOrder?: QualityCheckWorkOrder;
    odometerOut: number | "";
    setOdometerOut: (value: number | "") => void;
}

export function MileageRecording({
    initialInspection,
    workOrder,
    odometerOut,
    setOdometerOut,
}: MileageRecordingProps) {
    const intakeMileage = initialInspection?.odometer_reading || workOrder?.odometer_in || "";
    const intakeMileageValue = Number(intakeMileage || 0);

    return (
        <div className="rounded-md border border-border bg-background p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <Gauge className="h-3.5 w-3.5 text-primary" />
                    <Label htmlFor="odometer_out" className="text-xs font-semibold text-foreground">Odometer Out</Label>
                </div>
                <Badge variant="outline" className="h-4 px-1.5 text-[9px]">Required</Badge>
            </div>
            <div className="relative">
                <Input
                    id="odometer_out"
                    type="number"
                    placeholder="Enter current mileage..."
                    value={odometerOut}
                    onChange={(e) => setOdometerOut(e.target.value === "" ? "" : Number(e.target.value))}
                    className="h-9 bg-card pr-10 font-mono text-sm font-semibold"
                />
                <div className="absolute right-3 top-2.5 text-[10px] font-mono font-bold text-muted-foreground/50">KM</div>
            </div>
            {intakeMileageValue > 0 && (
                <p className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Info className="w-2.5 h-2.5" />
                    In: {intakeMileageValue.toLocaleString()} km
                </p>
            )}
        </div>
    );
}
