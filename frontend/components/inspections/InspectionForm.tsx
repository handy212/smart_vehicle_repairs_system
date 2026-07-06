"use client";

import { Path, useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertCircle, FileText, Wrench, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import Link from "next/link";
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { InspectionTemplate, inspectionsApi } from "@/lib/api/inspections";
import { Vehicle, vehiclesApi } from "@/lib/api/vehicles";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";

export const inspectionSchema = z.object({
    vehicle: z.number().min(1, "Vehicle is required"),
    template: z.number().min(1, "Template is required"),
    work_order: z.preprocess(
        (value) => (typeof value === "number" && Number.isNaN(value) ? undefined : value),
        z.number().optional()
    ),
    inspection_date: z.string().min(1, "Inspection date is required"),
    odometer_reading: z.preprocess(
        (value) => (typeof value === "number" && Number.isNaN(value) ? undefined : value),
        z.number().min(0, "Odometer reading cannot be negative").optional()
    ),
    notes: z.string().optional(),
});

export type InspectionFormData = z.infer<typeof inspectionSchema>;

interface InspectionFormProps {
    initialData?: Partial<InspectionFormData>;
    onSubmit: (data: InspectionFormData) => Promise<void>;
    isSubmitting: boolean;
    serverError?: string | null;
    onCancel?: () => void;
    activeWorkOrderBranch?: string | null;
    showActiveWorkOrderDialog?: boolean;
    setShowActiveWorkOrderDialog?: (show: boolean) => void;

    workOrderData?: { id: number; work_order_number?: string; wo_number?: string };
    fieldErrors?: Record<string, string>;
}

export function InspectionForm({
    initialData,
    onSubmit,
    isSubmitting,
    serverError,
    onCancel,
    activeWorkOrderBranch,
    showActiveWorkOrderDialog,
    setShowActiveWorkOrderDialog,
    workOrderData,
    fieldErrors
}: InspectionFormProps) {

    // Fetch templates
    const { data: templatesData } = useQuery({
        queryKey: ["inspection-templates", "active"],
        queryFn: () => inspectionsApi.templates.active(),
    });

    // Fetch vehicles
    const { data: vehiclesData } = useQuery({
        queryKey: ["vehicles", "list"],
        queryFn: () => vehiclesApi.list({ page: 1, page_size: 100 }), // Get more vehicles
    });

    const templates = useMemo<InspectionTemplate[]>(() => templatesData || [], [templatesData]);
    const vehicles = useMemo<Vehicle[]>(() => vehiclesData?.results || [], [vehiclesData]);

    const {
        register,
        handleSubmit,
        formState: { errors },
        setValue,
        setError,
        control,
    } = useForm<InspectionFormData>({
        resolver: zodResolver(inspectionSchema) as Resolver<InspectionFormData>,
        defaultValues: {
            inspection_date: new Date().toISOString().slice(0, 16),
            ...initialData,
        },
    });
    const selectedTemplateId = useWatch({ control, name: "template" });
    const selectedTemplate = templates.find((template) => template.id === selectedTemplateId);
    const requiresOdometer = selectedTemplate?.requires_odometer !== false;

    // Effect to set default template
    useEffect(() => {
        if (templates.length > 0 && !initialData?.template) {
            const defaultTemplate = templates.find(t => t.is_default);
            if (defaultTemplate) {
                setValue("template", defaultTemplate.id);
            }
        }
    }, [templates, initialData, setValue]);

    // Effect to map server field errors to the form
    useEffect(() => {
        if (fieldErrors) {
            Object.entries(fieldErrors).forEach(([field, message]) => {
                setError(field as Path<InspectionFormData>, { type: "server", message });
            });
        }
    }, [fieldErrors, setError]);

    return (
        <div className="space-y-6">
            {serverError && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{serverError}</AlertDescription>
                </Alert>
            )}

            {(showActiveWorkOrderDialog && setShowActiveWorkOrderDialog) && (
                <Dialog open={showActiveWorkOrderDialog} onOpenChange={setShowActiveWorkOrderDialog}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle className="flex items-center space-x-2 text-destructive">
                                <AlertCircle className="w-5 h-5" />
                                <span>Active Work Order Detected</span>
                            </DialogTitle>
                            <DialogDescription className="pt-4">
                                The selected vehicle has an open work order at <strong>{activeWorkOrderBranch}</strong>.
                                Please close it before creating a new one.
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <Button onClick={() => setShowActiveWorkOrderDialog(false)}>
                                OK
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}

            <form
                onSubmit={handleSubmit((data) => {
                    if (requiresOdometer && data.odometer_reading === undefined) {
                        setError("odometer_reading", {
                            type: "manual",
                            message: "Odometer reading is required for this template",
                        });
                        return;
                    }
                    onSubmit(data);
                })}
            >
                <Card>
                    <CardHeader className="pb-4 border-b border-border">
                        <CardTitle className="text-lg font-semibold flex items-center gap-2">
                            <FileText className="w-5 h-5 text-primary" />
                            Inspection Details
                        </CardTitle>
                        <CardDescription>
                            Initialize a new inspection for a vehicle.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="vehicle">Vehicle <span className="text-destructive">*</span></Label>
                                <select
                                    id="vehicle"
                                    {...register("vehicle", { valueAsNumber: true })}
                                    className={cn(
                                        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                                        errors.vehicle ? "border-destructive" : ""
                                    )}
                                >
                                    <option value="">Select a vehicle</option>

                                    {vehicles.map((vehicle) => (
                                        <option key={vehicle.id} value={vehicle.id}>
                                            {vehicle.year} {vehicle.make} {vehicle.model} - {vehicle.license_plate}
                                        </option>
                                    ))}
                                </select>
                                {errors.vehicle && (
                                    <p className="text-destructive text-xs mt-1">{errors.vehicle.message}</p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="template">Template <span className="text-destructive">*</span></Label>
                                <select
                                    id="template"
                                    {...register("template", { valueAsNumber: true })}
                                    className={cn(
                                        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                                        errors.template ? "border-destructive" : ""
                                    )}
                                >
                                    <option value="">Select a template</option>

                                    {templates.map((template) => (
                                        <option key={template.id} value={template.id}>
                                            {template.name}
                                            {template.is_default && " (Default)"}
                                        </option>
                                    ))}
                                </select>
                                {errors.template && (
                                    <p className="text-destructive text-xs mt-1">{errors.template.message}</p>
                                )}
                                <p className="text-xs text-muted-foreground">
                                    <Link href="/inspections/templates" className="text-primary hover:underline">
                                        Manage templates
                                    </Link>
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="work_order">Work Order (Optional)</Label>
                                <Input
                                    id="work_order"
                                    type="number"
                                    {...register("work_order", {
                                        setValueAs: (value) => {
                                            if (value === "" || value === null || value === undefined) {
                                                return undefined;
                                            }
                                            const parsed = Number(value);
                                            return Number.isNaN(parsed) ? undefined : parsed;
                                        },
                                    })}
                                    placeholder="Work order ID"
                                />
                                {errors.work_order && (
                                    <p className="text-destructive text-xs mt-1">{errors.work_order.message}</p>
                                )}
                                {workOrderData && (
                                    <div className="flex items-center gap-2 mt-1 bg-primary/10 dark:bg-orange-900/20 px-2 py-1 rounded text-xs text-orange-700 dark:text-orange-300">
                                        <Wrench className="w-3 h-3" />

                                        Linked to WO #{workOrderData.work_order_number || workOrderData.wo_number || workOrderData.id}
                                    </div>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="inspection_date">Inspection Date <span className="text-destructive">*</span></Label>
                                <div className="relative">
                                    <Input
                                        id="inspection_date"
                                        type="datetime-local"
                                        {...register("inspection_date")}
                                    />
                                </div>
                                {errors.inspection_date && (
                                    <p className="text-destructive text-xs mt-1">{errors.inspection_date.message}</p>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="odometer_reading">
                                    Odometer Reading
                                    {requiresOdometer && <span className="text-destructive"> *</span>}
                                </Label>
                                <Input
                                    id="odometer_reading"
                                    type="number"
                                    {...register("odometer_reading", { valueAsNumber: true })}
                                    placeholder="Current mileage"
                                    min={0}
                                    required={requiresOdometer}
                                />
                                {errors.odometer_reading && (
                                    <p className="text-destructive text-xs mt-1">{errors.odometer_reading.message}</p>
                                )}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="notes">Notes</Label>
                            <Textarea
                                id="notes"
                                {...register("notes")}
                                placeholder="Additional notes about this inspection..."
                                rows={3}
                                className="resize-none"
                            />
                            {errors.notes && (
                                <p className="text-destructive text-xs mt-1">{errors.notes.message}</p>
                            )}
                        </div>

                        <div className="flex justify-end space-x-3 pt-4 border-t border-border">
                            <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting ? (
                                    <div className="flex items-center gap-2">
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Creating...
                                    </div>
                                ) : (
                                    <>
                                        <CheckCircle2 className="w-4 h-4 mr-2" />
                                        Create Inspection
                                    </>
                                )}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </form>
        </div>
    );
}
