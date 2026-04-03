"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { inspectionsApi } from "@/lib/api/inspections";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { AlertCircle } from "lucide-react";

interface CreateInspectionFormProps {
    workOrder?: any;
    onSubmit: (data: any) => void;
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

    const { data: templatesData } = useQuery({
        queryKey: ["inspection-templates", "active"],
        queryFn: () => inspectionsApi.templates.active(),
    });

    const templates = templatesData || [];
    const vehicleId = workOrder?.vehicle
        ? (typeof workOrder.vehicle === "object" ? workOrder.vehicle.id : workOrder.vehicle)
        : null;

    const handleSubmit = (e?: React.FormEvent) => {
        if (e) e.preventDefault();

        if (!templateId || !vehicleId) return;

        const data: any = {
            vehicle: vehicleId,
            template: templateId,
            work_order: workOrder?.id,
            inspection_date: inspectionDate,
        };

        if (odometerReading) {
            data.odometer_reading = parseFloat(odometerReading);
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
                            onChange={(e) => setTemplateId(parseInt(e.target.value) || "")}
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

                    <div>
                        <Label htmlFor="inspection_odometer_reading" className="block mb-2 text-foreground">
                            Odometer Reading <span className="text-destructive">*</span>
                        </Label>
                        <Input
                            id="inspection_odometer_reading"
                            type="number"
                            value={odometerReading}
                            onChange={(e) => setOdometerReading(e.target.value)}
                            placeholder="Enter odometer reading"
                            min={0}
                            required
                            className={`w-full bg-muted border-border text-foreground ${fieldErrors?.odometer_reading ? "border-destructive" : ""}`}
                        />
                        {fieldErrors?.odometer_reading && (
                            <p className="mt-1 text-sm text-destructive dark:text-red-400">
                                {fieldErrors.odometer_reading}
                            </p>
                        )}
                        {workOrder?.vehicle && typeof workOrder.vehicle === 'object' && workOrder.vehicle.current_mileage > 0 && (
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
                    disabled={isSubmitting || !templateId || !vehicleId || !odometerReading || templates.length === 0}
                >
                    {isSubmitting ? "Creating..." : "Create Inspection"}
                </Button>
            </DialogFooter>
        </div>
    );
}
