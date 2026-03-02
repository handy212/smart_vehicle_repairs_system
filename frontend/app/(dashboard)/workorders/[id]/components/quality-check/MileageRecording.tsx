"use client";

import React from "react";
import { Gauge, Info } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface MileageRecordingProps {
    initialInspection: any;
    workOrder: any;
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

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                    <Gauge className="w-3.5 h-3.5 text-primary" />
                    <Label htmlFor="odometer_out" className="text-xs font-bold text-foreground">Current Odometer</Label>
                </div>
                <div className="flex items-center gap-2">
                    {intakeMileage && (
                        <Badge variant="outline" className="text-[9px] text-muted-foreground border-border/40 font-mono h-4 bg-muted/10 px-1.5">
                            IN: {intakeMileage.toLocaleString()} km
                        </Badge>
                    )}
                    <Badge className="h-4 text-[8px] bg-primary/10 text-primary border-primary/20 px-1.5 font-bold">REQUIRED</Badge>
                </div>
            </div>
            <div className="relative">
                <Input
                    id="odometer_out"
                    type="number"
                    placeholder="Enter current mileage..."
                    value={odometerOut}
                    onChange={(e) => setOdometerOut(e.target.value === "" ? "" : Number(e.target.value))}
                    className="font-mono font-bold h-9 border-border/40 focus:border-primary focus:ring-primary/20 bg-background text-foreground text-sm pl-3 pr-10"
                />
                <div className="absolute right-3 top-2.5 text-[10px] font-mono font-bold text-muted-foreground/50">KM</div>
            </div>
            {intakeMileage > 0 && (
                <p className="text-[9px] text-muted-foreground flex items-center gap-1 px-0.5">
                    <Info className="w-2.5 h-2.5" />
                    Must be ≥ {intakeMileage.toLocaleString()} km
                </p>
            )}
        </div>
    );
}
