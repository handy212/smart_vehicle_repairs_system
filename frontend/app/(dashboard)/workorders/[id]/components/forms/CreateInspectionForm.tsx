"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { inspectionsApi } from "@/lib/api/inspections";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { AlertCircle, Gauge, RotateCcw } from "lucide-react";
import { VehicleInspection } from "@/lib/api/inspections";

interface CreateInspectionWorkOrder {
    id?: number;
    vehicle?: number | {
        id: number;
        current_mileage?: number;
    };
}

type InitialInspectionPayload = Pick<VehicleInspection, "vehicle" | "template" | "inspection_date"> &
    Partial<Pick<
        VehicleInspection,
        "work_order" | "odometer_reading" | "odometer_unavailable" | "odometer_unavailable_reason"
    >>;

interface CreateInspectionFormProps {
    workOrder?: CreateInspectionWorkOrder;
    onSubmit: (data: InitialInspectionPayload) => void;
    onCancel: () => void;
    isSubmitting: boolean;
    fieldErrors?: Record<string, string>;
}

export function CreateInspectionForm({
    workOrder,
    onSubmit,
    onCancel,
    isSubmitting,
    fieldErrors,
}: CreateInspectionFormProps) {
    const [templateId, setTemplateId] = useState<number | "">("");
    const [inspectionDate] = useState(new Date().toISOString().slice(0, 16));
    const [odometerReading, setOdometerReading] = useState("");
    const [skipOdometer, setSkipOdometer] = useState(false);

    const { data: templatesData } = useQuery({
        queryKey: ["inspection-templates", "active"],
        queryFn: () => inspectionsApi.templates.active(),
    });

    const templates = templatesData || [];
    const selectedTemplate = templates.find((template) => template.id === templateId);
    const requiresOdometer = selectedTemplate?.requires_odometer !== false;
    const vehicleId = workOrder?.vehicle
        ? (typeof workOrder.vehicle === "object" ? workOrder.vehicle.id : workOrder.vehicle)
        : null;

    const handleSubmit = (e?: React.FormEvent) => {
        if (e) e.preventDefault();

        if (!templateId || !vehicleId) return;

        const data: InitialInspectionPayload = {
            vehicle: vehicleId,
            template: templateId,
            work_order: workOrder?.id,
            inspection_date: inspectionDate,
        };

        if (skipOdometer) {
            data.odometer_unavailable = true;
            data.odometer_unavailable_reason = "Odometer reading skipped from work order initial inspection: vehicle condition prevents reading.";
        } else if (odometerReading) {
            data.odometer_reading = parseInt(odometerReading, 10);
        }

        onSubmit(data);
    };

    return (
        <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto px-6 pb-4">
                <div className="space-y-4">
                    <div>
                        <Label htmlFor="template" className="block mb-2 text-foreground">
                            Inspection Template <span className="text-destructive">*</span>
                        </Label>
                        <select
                            id="template"
                            value={templateId}
                            onChange={(e) => {
                                setTemplateId(parseInt(e.target.value) || "");
                                setSkipOdometer(false);
                            }}
                            required
                            className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-muted text-foreground"
                        >
                            <option value="">Select a template</option>
                            {templates.map((template) => (
                                <option key={template.id} value={template.id}>
                                    {template.name}
                                    {template.is_default && " (Default)"}
                                </option>
                            ))}
                        </select>
                        {templates.length === 0 && (
                            <p className="text-xs text-muted-foreground mt-1">
                                No templates available. Please create a template first.
                            </p>
                        )}
                    </div>

                    <div>
                        <Label htmlFor="inspection_date" className="block mb-2 text-foreground">
                            Inspection Date <span className="text-destructive">*</span>
                        </Label>
                        <Input
                            id="inspection_date"
                            type="datetime-local"
                            value={inspectionDate}
                            readOnly
                            required
                            className="w-full bg-border text-foreground cursor-not-allowed"
                        />
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                            <Label htmlFor="inspection_odometer_reading" className="text-foreground">
                                Odometer Reading
                                {requiresOdometer && <span className="text-destructive"> *</span>}
                            </Label>
                            <Button
                                type="button"
                                variant={skipOdometer ? "secondary" : "outline"}
                                size="sm"
                                onClick={() => {
                                    setSkipOdometer((current) => !current);
                                    setOdometerReading("");
                                }}
                                className="h-8"
                            >
                                {skipOdometer ? (
                                    <>
                                        <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                                        Enter Reading
                                    </>
                                ) : (
                                    <>
                                        <Gauge className="w-3.5 h-3.5 mr-1.5" />
                                        Skip Reading
                                    </>
                                )}
                            </Button>
                        </div>
                        <Input
                            id="inspection_odometer_reading"
                            type="number"
                            value={odometerReading}
                            onChange={(e) => {
                                setOdometerReading(e.target.value);
                                setSkipOdometer(false);
                            }}
                            placeholder={skipOdometer ? "Skipped: odometer unavailable" : "Enter odometer reading"}
                            min={0}
                            required={requiresOdometer && !skipOdometer}
                            disabled={skipOdometer}
                            className={`w-full bg-muted border-border text-foreground ${fieldErrors?.odometer_reading ? "border-destructive" : ""}`}
                        />
                        {skipOdometer && (
                            <p className="text-xs text-muted-foreground">
                                Use this when the odometer cannot be read, such as accident vehicles, dead clusters, or electrical damage.
                            </p>
                        )}
                        {fieldErrors?.odometer_reading && (
                            <p className="mt-1 text-sm text-destructive dark:text-red-400">
                                {fieldErrors.odometer_reading}
                            </p>
                        )}
                        {workOrder?.vehicle && typeof workOrder.vehicle === 'object' && workOrder.vehicle.current_mileage != null && workOrder.vehicle.current_mileage > 0 && (
                            <p className="text-xs text-muted-foreground mt-1">
                                Current Mileage: {workOrder.vehicle.current_mileage.toLocaleString()}
                            </p>
                        )}
                    </div>

                    {!vehicleId && (
                        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                            <p className="text-sm text-yellow-800 dark:text-yellow-400">
                                <AlertCircle className="w-4 h-4 inline mr-1.5" />
                                No vehicle selected for this work order. Please ensure the work order has a vehicle assigned.
                            </p>
                        </div>
                    )}
                </div>
            </div>
            <DialogFooter className="shrink-0 px-6 pb-6 pt-4 border-t border-border/50">
                <Button type="button" variant="secondary" onClick={onCancel}>
                    Cancel
                </Button>
                <Button
                    type="button"
                    onClick={handleSubmit}
                    disabled={isSubmitting || !templateId || !vehicleId || (!odometerReading && !skipOdometer && requiresOdometer) || templates.length === 0}
                >
                    {isSubmitting ? "Creating..." : "Create Inspection"}
                </Button>
            </DialogFooter>
        </div>
    );
}
