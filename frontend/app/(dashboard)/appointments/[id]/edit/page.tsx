"use client";

import { useRouter, useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { appointmentsApi } from "@/lib/api/appointments";
import { customersApi } from "@/lib/api/customers";
import { vehiclesApi } from "@/lib/api/vehicles";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";

const appointmentSchema = z.object({
  customer: z.number().min(1, "Customer is required"),
  vehicle: z.number().min(1, "Vehicle is required"),
  appointment_date: z.string().min(1, "Date is required"),
  appointment_time: z.string().min(1, "Time is required"),
  service_type: z.enum(["inspection", "repair", "maintenance", "diagnostic"]),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  estimated_duration: z.number().optional(),
  notes: z.string().optional(),
});

type AppointmentFormData = z.infer<typeof appointmentSchema>;

export default function EditAppointmentPage() {
  const router = useRouter();
  const params = useParams();
  const appointmentId = parseInt(params.id as string);
  const queryClient = useQueryClient();

  const [selectedCustomer, setSelectedCustomer] = useState<number | null>(null);

  const { data: appointment, isLoading } = useQuery({
    queryKey: ["appointment", appointmentId],
    queryFn: () => appointmentsApi.get(appointmentId),
  });

  // Fetch customers
  const { data: customersData } = useQuery({
    queryKey: ["customers", "list"],
    queryFn: () => customersApi.list({ page: 1 }),
  });

  // Fetch vehicles for selected customer
  const { data: vehiclesData } = useQuery({
    queryKey: ["vehicles", "customer", selectedCustomer],
    queryFn: () => vehiclesApi.list({ owner: selectedCustomer || undefined }),
    enabled: !!selectedCustomer,
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    watch,
    setValue,
    reset,
  } = useForm<AppointmentFormData>({
    resolver: zodResolver(appointmentSchema),
  });

  // Populate form when appointment data loads
  useEffect(() => {
    if (appointment && !isLoading) {
      const appointmentDate = appointment.appointment_date
        ? new Date(appointment.appointment_date).toISOString().split("T")[0]
        : "";

      const customerId = typeof appointment.customer === 'object' && appointment.customer !== null
        ? appointment.customer.id
        : appointment.customer || 0;
      const vehicleId = typeof appointment.vehicle === 'object' && appointment.vehicle !== null
        ? appointment.vehicle.id
        : appointment.vehicle || 0;

      reset({
        customer: customerId,
        vehicle: vehicleId,
        appointment_date: appointmentDate,
        appointment_time: appointment.appointment_time || "",
        service_type: appointment.service_type as any,
        priority: appointment.priority as any,
        estimated_duration: appointment.estimated_duration || undefined,
        notes: appointment.notes || "",
      });
      setSelectedCustomer(customerId || null);
    }
  }, [appointment, isLoading, reset]);

  const customer = watch("customer");

  // Update selected customer when form value changes
  useEffect(() => {
    if (customer && customer !== selectedCustomer) {
      setSelectedCustomer(customer);
    }
  }, [customer, selectedCustomer]);

  const updateMutation = useMutation({
    mutationFn: (data: AppointmentFormData) => appointmentsApi.update(appointmentId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointment", appointmentId] });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      router.push(`/appointments/${appointmentId}`);
    },
  });

  const onSubmit = async (data: AppointmentFormData) => {
    try {
      await updateMutation.mutateAsync(data);
    } catch (error) {
      console.error("Error updating appointment:", error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!appointment) {
    return (
      <div className="space-y-4">
        <Link href="/appointments">
          <Button variant="secondary">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>
        <Card>
          <CardContent className="pt-6">
            <p className="text-red-600">Appointment not found.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-1">
            <Link href="/dashboard" className="hover:text-primary transition-colors">Dashboard</Link>
            <span>/</span>
            <Link href="/appointments" className="hover:text-primary transition-colors">Appointments</Link>
            <span>/</span>
            <Link href={`/appointments/${appointmentId}`} className="hover:text-primary transition-colors">#{appointmentId}</Link>
            <span>/</span>
            <span className="text-foreground font-medium">Edit</span>
          </div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">Edit Appointment</h1>
        </div>
        <Link href={`/appointments/${appointmentId}`}>
          <Button variant="outline" size="sm" className="h-9 dark:bg-gray-800 dark:text-gray-100 border-border">
            <ArrowLeft className="w-3.5 h-3.5 mr-2" />
            Cancel
          </Button>
        </Link>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Customer & Vehicle */}
            <Card>
              <CardHeader>
                <CardTitle>Customer & Vehicle</CardTitle>
                <CardDescription>Select customer and vehicle</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label htmlFor="customer" className="block text-sm font-medium text-gray-700 mb-1">
                    Customer *
                  </label>
                  <Select
                    value={watch("customer")?.toString() || ""}
                    onValueChange={(val) => {
                      const numVal = parseInt(val);
                      setValue("customer", numVal, { shouldValidate: true });
                      setSelectedCustomer(numVal);
                    }}
                  >
                    <SelectTrigger className={errors.customer ? "border-red-500" : ""}>
                      <SelectValue placeholder="Select a customer" />
                    </SelectTrigger>
                    <SelectContent>
                      {customersData?.results?.map((customer) => {
                        const displayName = customer.full_name ||
                          customer.company_name ||
                          (customer.user?.first_name && customer.user?.last_name
                            ? `${customer.user.first_name} ${customer.user.last_name}`
                            : customer.user?.email || customer.customer_number);
                        return (
                          <SelectItem key={customer.id} value={customer.id.toString()}>
                            {displayName}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  {errors.customer && (
                    <p className="mt-1 text-sm text-red-600">{errors.customer.message}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="vehicle" className="block text-sm font-medium text-gray-700 mb-1">
                    Vehicle *
                  </label>
                  <Select
                    value={watch("vehicle")?.toString() || ""}
                    onValueChange={(val) => setValue("vehicle", parseInt(val), { shouldValidate: true })}
                    disabled={!selectedCustomer || !vehiclesData?.results?.length}
                  >
                    <SelectTrigger className={errors.vehicle ? "border-red-500" : ""}>
                      <SelectValue placeholder={
                        !selectedCustomer
                          ? "Select a customer first"
                          : !vehiclesData?.results?.length
                            ? "No vehicles found"
                            : "Select a vehicle"
                      } />
                    </SelectTrigger>
                    <SelectContent>
                      {vehiclesData?.results?.map((vehicle) => (
                        <SelectItem key={vehicle.id} value={vehicle.id.toString()}>
                          {vehicle.make} {vehicle.model} {vehicle.year} - {vehicle.vin}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.vehicle && (
                    <p className="mt-1 text-sm text-red-600">{errors.vehicle.message}</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Appointment Details */}
            <Card>
              <CardHeader>
                <CardTitle>Appointment Details</CardTitle>
                <CardDescription>Schedule date, time, and service type</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="appointment_date" className="block text-sm font-medium text-gray-700 mb-1">
                      Date *
                    </label>
                    <Input
                      id="appointment_date"
                      type="date"
                      {...register("appointment_date")}
                      className={errors.appointment_date ? "border-red-500" : ""}
                    />
                    {errors.appointment_date && (
                      <p className="mt-1 text-sm text-red-600">{errors.appointment_date.message}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="appointment_time" className="block text-sm font-medium text-gray-700 mb-1">
                      Time *
                    </label>
                    <Input
                      id="appointment_time"
                      type="time"
                      {...register("appointment_time")}
                      className={errors.appointment_time ? "border-red-500" : ""}
                    />
                    {errors.appointment_time && (
                      <p className="mt-1 text-sm text-red-600">{errors.appointment_time.message}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="service_type" className="block text-sm font-medium text-gray-700 mb-1">
                      Service Type *
                    </label>
                    <Select
                      value={watch("service_type") || ""}
                      onValueChange={(val: any) => setValue("service_type", val, { shouldValidate: true })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="inspection">Inspection</SelectItem>
                        <SelectItem value="repair">Repair</SelectItem>
                        <SelectItem value="maintenance">Maintenance</SelectItem>
                        <SelectItem value="diagnostic">Diagnostic</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label htmlFor="priority" className="block text-sm font-medium text-gray-700 mb-1">
                      Priority
                    </label>
                    <Select
                      value={watch("priority") || ""}
                      onValueChange={(val: any) => setValue("priority", val, { shouldValidate: true })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select priority" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <label htmlFor="estimated_duration" className="block text-sm font-medium text-gray-700 mb-1">
                    Estimated Duration (minutes)
                  </label>
                  <Input
                    id="estimated_duration"
                    type="number"
                    {...register("estimated_duration", { valueAsNumber: true })}
                    placeholder="60"
                  />
                </div>

                <div>
                  <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
                    Notes
                  </label>
                  <Textarea
                    id="notes"
                    {...register("notes")}
                    rows={4}
                    placeholder="Additional notes or customer concerns..."
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar Actions */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? "Saving..." : "Save Changes"}
                </Button>
                <Link href={`/appointments/${appointmentId}`}>
                  <Button type="button" variant="secondary" className="w-full">
                    Cancel
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  );
}

