"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { customersApi } from "@/lib/api/customers";
import { vehiclesApi } from "@/lib/api/vehicles";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2 } from "lucide-react";
import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";

const toHHMM = (d: Date) => {
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
};

export const appointmentSchema = z.object({
    customer: z.number().min(1, "Customer is required"),
    vehicle: z.number().min(1, "Vehicle is required"),
    appointment_date: z.string().min(1, "Date is required"),
    appointment_time: z.string().min(1, "Time is required"),
    service_type: z.enum(["inspection", "repair", "maintenance", "diagnostic"]),
    priority: z.enum(["low", "normal", "high", "urgent"]),
    estimated_duration: z.number().optional(),
    customer_concerns: z.string().optional(),
});

export type AppointmentFormData = z.infer<typeof appointmentSchema>;

interface AppointmentFormProps {
    initialData?: Partial<AppointmentFormData>;
    customerId?: string | null;
    vehicleId?: string | null;
    onSubmit: (data: AppointmentFormData) => Promise<void>;
    isSubmitting: boolean;
    mode: "create" | "edit";
    onCancel?: () => void;
}

export function AppointmentForm({ initialData, customerId, vehicleId, onSubmit, isSubmitting, mode, onCancel }: AppointmentFormProps) {
    const [selectedCustomer, setSelectedCustomer] = useState<number | null>(
        initialData?.customer || (customerId ? parseInt(customerId) : null)
    );

    const { data: customersData } = useQuery({
        queryKey: ["customers", "list"],
        queryFn: () => customersApi.list({ page: 1 }),
    });

    const { data: vehiclesData } = useQuery({
        queryKey: ["vehicles", "customer", selectedCustomer],
        queryFn: () => vehiclesApi.list({ owner: selectedCustomer || undefined }),
        enabled: !!selectedCustomer,
    });

    const {
        register,
        handleSubmit,
        formState: { errors },
        watch,
        setValue,
    } = useForm<AppointmentFormData>({
        resolver: zodResolver(appointmentSchema),
        defaultValues: {
            priority: "normal",
            service_type: "maintenance",
            appointment_date: new Date().toISOString().split("T")[0],
            appointment_time: toHHMM(new Date()),
            customer: customerId ? parseInt(customerId) : undefined,
            vehicle: vehicleId ? parseInt(vehicleId) : undefined,
            ...initialData,
        },
    });

    const customer = watch("customer");
    const appointmentDate = watch("appointment_date");

    const todayStr = new Date().toISOString().split("T")[0];
    const minTimeForSelectedDate =
        appointmentDate && appointmentDate === todayStr ? toHHMM(new Date()) : undefined;

    // Update selected customer for vehicle filtering
    useEffect(() => {
        if (customer && customer !== selectedCustomer) {
            setSelectedCustomer(customer);
            // Only reset vehicle if we are not initializing
            // But React Hook Form manages connection. If we change customer manually, vehicle might be invalid.
            // If it's a programmatic change from initialData, we might want to keep it.
            // Simplified: If customer changes via UI, reset vehicle.
        }
    }, [customer, selectedCustomer]);

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    {/* Customer & Vehicle */}
                    <Card>
                        <CardHeader className="pb-3 border-b border-gray-100 dark:border-gray-800">
                            <CardTitle className="text-base font-medium flex justify-between">
                                Customer & Vehicle
                                {mode === 'edit' && <Badge variant="outline">Editing</Badge>}
                            </CardTitle>
                            <CardDescription className="text-xs">Who is this appointment for?</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-4 grid sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Customer <span className="text-red-500">*</span></label>
                                <Select
                                    {...register("customer", { valueAsNumber: true })}
                                    className={errors.customer ? "border-red-500" : ""}
                                    onChange={(e) => {
                                        setValue("customer", parseInt(e.target.value));
                                        setValue("vehicle", 0); // Reset vehicle
                                    }}
                                >
                                    <option value="">Select Customer</option>
                                    {customersData?.results?.map((c) => {
                                        const displayName = c.full_name ||
                                            c.company_name ||
                                            (c.user ? `${c.user.first_name || ''} ${c.user.last_name || ''}`.trim() : '') ||
                                            c.customer_number;
                                        return (
                                            <option key={c.id} value={c.id}>
                                                {displayName}
                                            </option>
                                        );
                                    })}
                                </Select>
                                {errors.customer && <p className="text-xs text-red-500">{errors.customer.message}</p>}
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium">Vehicle <span className="text-red-500">*</span></label>
                                <Select
                                    {...register("vehicle", { valueAsNumber: true })}
                                    className={errors.vehicle ? "border-red-500" : ""}
                                    disabled={!selectedCustomer}
                                >
                                    <option value="">
                                        {!selectedCustomer ? "Select a customer first" : "Select Vehicle"}
                                    </option>
                                    {vehiclesData?.results?.map((v) => (
                                        <option key={v.id} value={v.id}>
                                            {v.year} {v.make} {v.model} ({v.vin})
                                        </option>
                                    ))}
                                </Select>
                                {errors.vehicle && <p className="text-xs text-red-500">{errors.vehicle.message}</p>}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Scheduling Details */}
                    <Card>
                        <CardHeader className="pb-3 border-b border-gray-100 dark:border-gray-800">
                            <CardTitle className="text-base font-medium">Schedule</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 grid sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Date <span className="text-red-500">*</span></label>
                                <Input
                                    type="date"
                                    {...register("appointment_date")}
                                    min={todayStr}
                                    className={errors.appointment_date ? "border-red-500" : ""}
                                />
                                {errors.appointment_date && <p className="text-xs text-red-500">{errors.appointment_date.message}</p>}
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Time <span className="text-red-500">*</span></label>
                                <Input
                                    type="time"
                                    {...register("appointment_time")}
                                    min={minTimeForSelectedDate}
                                    className={errors.appointment_time ? "border-red-500" : ""}
                                />
                                {errors.appointment_time && <p className="text-xs text-red-500">{errors.appointment_time.message}</p>}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Service Info */}
                    <Card>
                        <CardHeader className="pb-3 border-b border-gray-100 dark:border-gray-800">
                            <CardTitle className="text-base font-medium">Service Info</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 space-y-4">
                            <div className="grid sm:grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Service Type</label>
                                    <Select {...register("service_type")}>
                                        <option value="maintenance">Maintenance</option>
                                        <option value="repair">Repair</option>
                                        <option value="inspection">Inspection</option>
                                        <option value="diagnostic">Diagnostic</option>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Priority</label>
                                    <Select {...register("priority")}>
                                        <option value="low">Low</option>
                                        <option value="normal">Normal</option>
                                        <option value="high">High</option>
                                        <option value="urgent">Urgent</option>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Duration (mins)</label>
                                    <Input
                                        type="number"
                                        {...register("estimated_duration", { valueAsNumber: true })}
                                        placeholder="60"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Notes / Concerns</label>
                                <Textarea
                                    {...register("customer_concerns")}
                                    placeholder="Describe the issue..."
                                    rows={4}
                                />
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Actions */}
                <div className="space-y-6">
                    <Card>
                        <CardHeader className="pb-3 border-b border-gray-100 dark:border-gray-800">
                            <CardTitle className="text-base font-medium">Actions</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 space-y-3">
                            <Button type="submit" className="w-full" disabled={isSubmitting}>
                                {isSubmitting ? (
                                    <div className="flex items-center gap-2">
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Saving...
                                    </div>
                                ) : (
                                    <>
                                        <CheckCircle2 className="w-4 h-4 mr-2" />
                                        {mode === 'create' ? "Schedule Appointment" : "Save Changes"}
                                    </>
                                )}
                            </Button>
                            <Button type="button" variant="ghost" className="w-full" onClick={onCancel}>
                                Cancel
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </form>
    );
}
