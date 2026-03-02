"use client";

import React from "react";
import { Info, Gauge, CheckCircle2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { VehicleDamageMarker } from "@/components/inspections/VehicleDamageMarker";

interface InspectionComparisonProps {
    initialInspection: any;
}

export function InspectionComparison({ initialInspection }: InspectionComparisonProps) {
    if (!initialInspection) return null;

    return (
        <Card className="border-border/40 bg-muted/10 shadow-none overflow-hidden border-l-4 border-l-primary/30">
            <CardHeader className="py-2.5 px-4 bg-muted/20 border-b border-border/30">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="bg-primary/10 p-1 rounded">
                            <Info className="w-3.5 h-3.5 text-primary" />
                        </div>
                        <CardTitle className="text-xs font-bold uppercase tracking-wider text-primary/80">
                            Reference: Initial Inspection {initialInspection.inspection_number}
                        </CardTitle>
                    </div>
                    <Badge variant="outline" className="text-[10px] h-5 bg-background font-mono text-muted-foreground">
                        {new Date(initialInspection.created_at).toLocaleDateString()}
                    </Badge>
                </div>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-background/40 p-3 rounded-lg border border-border/30 space-y-1 shadow-sm">
                        <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">
                            Intake Mileage
                        </p>
                        <p className="text-sm font-mono font-bold flex items-center gap-1.5 text-foreground">
                            <Gauge className="w-3.5 h-3.5 text-muted-foreground/70" />
                            {initialInspection.odometer_reading ? initialInspection.odometer_reading.toLocaleString() : "N/A"} <span className="text-[10px] text-muted-foreground">KM</span>
                        </p>
                    </div>
                    <div className="bg-background/40 p-3 rounded-lg border border-border/30 space-y-1 shadow-sm">
                        <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">
                            Overall Condition
                        </p>
                        <p className="text-sm font-bold flex items-center gap-1.5 text-foreground">
                            <CheckCircle2 className="w-3.5 h-3.5 text-primary/70" />
                            {initialInspection.overall_result_display || initialInspection.overall_result || "N/A"}
                        </p>
                    </div>
                </div>

                {initialInspection.vehicle_damage && initialInspection.vehicle_damage.length > 0 && (
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <div className="h-px flex-1 bg-border/40" />
                            <p className="text-[9px] text-muted-foreground uppercase font-bold tracking-widest px-2">
                                Intake Damage State
                            </p>
                            <div className="h-px flex-1 bg-border/40" />
                        </div>
                        <div className="border border-border/30 rounded-xl overflow-hidden bg-background/50 ring-1 ring-border/5 p-1">
                            <VehicleDamageMarker
                                damage={initialInspection.vehicle_damage}
                                onChange={() => { }}
                                disabled={true}
                            />
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
