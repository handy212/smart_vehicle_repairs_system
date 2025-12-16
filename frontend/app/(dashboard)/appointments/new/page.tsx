"use client";

import { useRouter, useSearchParams } from "next/navigation";
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
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AxiosError } from "axios";

const toHHMM = (d: Date) => {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
};

const appointmentSchema = z.object({
  customer: z.number().min(1, "Customer is required"),
  vehicle: z.number().min(1, "Vehicle is required"),
  appointment_date: z.string().min(1, "Date is required"),
  appointment_time: z.string().min(1, "Time is required"),
  service_type: z.enum(["inspection", "repair", "maintenance", "diagnostic"]),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  estimated_duration: z.number().optional(),
  customer_concerns: z.string().optional(),
});

type AppointmentFormData = z.infer<typeof appointmentSchema>;

export default function NewAppointmentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const customerId = searchParams.get("customer");
  const vehicleId = searchParams.get("vehicle");
  const queryClient = useQueryClient();

  const [selectedCustomer, setSelectedCustomer] = useState<number | null>(
    customerId ? parseInt(customerId) : null
  );

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

  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    watch,
    setValue,
    setError,
  } = useForm<AppointmentFormData>({
    resolver: zodResolver(appointmentSchema),
    defaultValues: {
      priority: "normal",
      service_type: "maintenance",
      customer: customerId ? parseInt(customerId) : undefined,
      vehicle: vehicleId ? parseInt(vehicleId) : undefined,
    },
  });

  const customer = watch("customer");
  const appointmentDate = watch("appointment_date");

  const todayStr = new Date().toISOString().split("T")[0];
  const minTimeForSelectedDate =
    appointmentDate && appointmentDate === todayStr ? toHHMM(new Date()) : undefined;

  // Update selected customer when form value changes
  if (customer && customer !== selectedCustomer) {
    setSelectedCustomer(customer);
    setValue("vehicle", undefined as any); // Reset vehicle when customer changes
  }

  const createMutation = useMutation({
    mutationFn: (data: AppointmentFormData) => appointmentsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      router.push("/appointments");
    },
  });

  const onSubmit = async (data: AppointmentFormData) => {
    setServerError(null);
    try {
      await createMutation.mutateAsync(data);
    } catch (error) {
      console.error("Error creating appointment:", error);
      
      if (error instanceof AxiosError && error.response?.data) {
        const errorData = error.response.data;
        const handledFields = new Set<string>();
        
        // Handle field-level errors
        Object.keys(errorData).forEach((field) => {
          if (field !== 'non_field_errors' && field !== 'detail') {
            const fieldError = Array.isArray(errorData[field]) 
              ? errorData[field][0] 
              : errorData[field];
            setError(field as keyof AppointmentFormData, { 
              type: "server", 
              message: fieldError 
            });
            handledFields.add(field);
          }
        });
        
        // Handle non-field errors
        if (errorData.non_field_errors) {
          const nonFieldError = Array.isArray(errorData.non_field_errors)
            ? errorData.non_field_errors[0]
            : errorData.non_field_errors;
          setServerError(nonFieldError);
        } else if (typeof errorData === 'string') {
          setServerError(errorData);
        } else if (errorData.detail) {
          setServerError(errorData.detail);
        } else {
          // If backend returned errors for fields we don't render, surface them.
          const keys = Object.keys(errorData || {});
          const unhandled = keys.filter((k) => !handledFields.has(k));
          setServerError(
            unhandled.length
              ? `Validation error: ${JSON.stringify(errorData)}`
              : "An error occurred while creating the appointment. Please check the form and try again."
          );
        }
      } else {
        setServerError("An unexpected error occurred. Please try again.");
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Link href="/appointments">
          <Button variant="secondary">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">New Appointment</h1>
          <p className="text-sm text-gray-500 mt-1">Schedule a new appointment</p>
        </div>
      </div>

      {serverError && (
        <Card className="bg-red-50 border-red-200">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2 text-red-800">
              <AlertCircle className="w-5 h-5" />
              <p className="text-sm font-medium">{serverError}</p>
            </div>
          </CardContent>
        </Card>
      )}

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
                    id="customer"
                    {...register("customer", { valueAsNumber: true })}
                    className={errors.customer ? "border-red-500" : ""}
                    onChange={(e) => {
                      setValue("customer", parseInt(e.target.value));
                      setSelectedCustomer(parseInt(e.target.value));
                    }}
                  >
                    <option value="">Select a customer</option>
                    {customersData?.results?.map((customer) => {
                      const displayName = customer.full_name || 
                        customer.company_name || 
                        (customer.user?.first_name && customer.user?.last_name 
                          ? `${customer.user.first_name} ${customer.user.last_name}` 
                          : customer.user?.email || customer.customer_number);
                      return (
                      <option key={customer.id} value={customer.id}>
                          {displayName}
                      </option>
                      );
                    })}
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
                    id="vehicle"
                    {...register("vehicle", { valueAsNumber: true })}
                    className={errors.vehicle ? "border-red-500" : ""}
                    disabled={!selectedCustomer || !vehiclesData?.results?.length}
                  >
                    <option value="">
                      {!selectedCustomer
                        ? "Select a customer first"
                        : !vehiclesData?.results?.length
                        ? "No vehicles found"
                        : "Select a vehicle"}
                    </option>
                    {vehiclesData?.results?.map((vehicle) => (
                      <option key={vehicle.id} value={vehicle.id}>
                        {vehicle.make} {vehicle.model} {vehicle.year} - {vehicle.vin}
                      </option>
                    ))}
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
                      min={new Date().toISOString().split("T")[0]}
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
                    min={minTimeForSelectedDate}
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
                      id="service_type"
                      {...register("service_type")}
                    >
                      <option value="inspection">Inspection</option>
                      <option value="repair">Repair</option>
                      <option value="maintenance">Maintenance</option>
                      <option value="diagnostic">Diagnostic</option>
                    </Select>
                  </div>
                  <div>
                    <label htmlFor="priority" className="block text-sm font-medium text-gray-700 mb-1">
                      Priority
                    </label>
                    <Select
                      id="priority"
                      {...register("priority")}
                    >
                      <option value="low">Low</option>
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
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
                  <label htmlFor="customer_concerns" className="block text-sm font-medium text-gray-700 mb-1">
                    Notes
                  </label>
                  <Textarea
                    id="customer_concerns"
                    {...register("customer_concerns")}
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
                  {isSubmitting ? "Creating..." : "Create Appointment"}
                </Button>
                <Link href="/appointments">
                  <Button type="button"variant="secondary" className="w-full">
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

