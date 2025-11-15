"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { workordersApi } from "@/lib/api/workorders";
import { customersApi } from "@/lib/api/customers";
import { vehiclesApi } from "@/lib/api/vehicles";
import { appointmentsApi } from "@/lib/api/appointments";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AxiosError } from "axios";

const workOrderSchema = z.object({
  customer: z.number().min(1, "Customer is required"),
  vehicle: z.number().min(1, "Vehicle is required"),
  appointment: z.number().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  status: z.enum(["draft", "pending", "in_progress", "completed"]),
  customer_concerns: z.string().optional(),
});

type WorkOrderFormData = z.infer<typeof workOrderSchema>;

export default function NewWorkOrderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const customerId = searchParams.get("customer");
  const vehicleId = searchParams.get("vehicle");
  const appointmentId = searchParams.get("appointment");
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

  // Fetch appointment if provided
  const { data: appointment } = useQuery({
    queryKey: ["appointment", appointmentId],
    queryFn: () => appointmentsApi.get(parseInt(appointmentId!)),
    enabled: !!appointmentId,
  });

  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    watch,
    setValue,
    setError,
  } = useForm<WorkOrderFormData>({
    resolver: zodResolver(workOrderSchema),
    defaultValues: {
      priority: "normal",
      status: "draft",
      customer: customerId ? parseInt(customerId) : undefined,
      vehicle: vehicleId ? parseInt(vehicleId) : undefined,
      appointment: appointmentId ? parseInt(appointmentId) : undefined,
    },
  });

  const customer = watch("customer");

  // Update selected customer when form value changes
  if (customer && customer !== selectedCustomer) {
    setSelectedCustomer(customer);
    setValue("vehicle", undefined as any); // Reset vehicle when customer changes
  }

  // Pre-fill from appointment if available
  if (appointment && !customer) {
    const customerId = typeof appointment.customer === 'object' && appointment.customer !== null 
      ? appointment.customer.id 
      : appointment.customer;
    const vehicleId = typeof appointment.vehicle === 'object' && appointment.vehicle !== null 
      ? appointment.vehicle.id 
      : appointment.vehicle;
    
    setValue("customer", customerId);
    setValue("vehicle", vehicleId);
    setValue("appointment", appointment.id);
    setSelectedCustomer(customerId);
  }

  const createMutation = useMutation({
    mutationFn: (data: WorkOrderFormData) => workordersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workorders"] });
      router.push("/workorders");
    },
  });

  const onSubmit = async (data: WorkOrderFormData) => {
    setServerError(null);
    try {
      await createMutation.mutateAsync(data);
    } catch (error) {
      console.error("Error creating work order:", error);
      
      if (error instanceof AxiosError && error.response?.data) {
        const errorData = error.response.data;
        
        // Handle field-level errors
        Object.keys(errorData).forEach((field) => {
          if (field !== 'non_field_errors' && field !== 'detail') {
            const fieldError = Array.isArray(errorData[field]) 
              ? errorData[field][0] 
              : errorData[field];
            setError(field as keyof WorkOrderFormData, { 
              type: "server", 
              message: fieldError 
            });
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
          setServerError("An error occurred while creating the work order. Please check the form and try again.");
        }
      } else {
        setServerError("An unexpected error occurred. Please try again.");
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Link href="/workorders">
          <Button variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">New Work Order</h1>
          <p className="text-sm text-gray-500 mt-1">Create a new work order</p>
        </div>
      </div>

      {appointment && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <p className="text-sm text-blue-800">
              Creating work order from appointment: <strong>{appointment.appointment_number}</strong>
            </p>
          </CardContent>
        </Card>
      )}

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
                    disabled={!!appointment}
                  >
                    <option value="">Select a customer</option>
                    {customersData?.results?.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.user?.first_name} {customer.user?.last_name} - {customer.customer_number}
                      </option>
                    ))}
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
                    disabled={!selectedCustomer || !vehiclesData?.results?.length || !!appointment}
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

            {/* Work Order Details */}
            <Card>
              <CardHeader>
                <CardTitle>Work Order Details</CardTitle>
                <CardDescription>Priority, status, and description</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
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
                  <div>
                    <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
                      Status
                    </label>
                    <Select
                      id="status"
                      {...register("status")}
                    >
                      <option value="draft">Draft</option>
                      <option value="pending">Pending</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                    </Select>
                  </div>
                </div>

                <div>
                  <label htmlFor="customer_concerns" className="block text-sm font-medium text-gray-700 mb-1">
                    Customer Concerns / Description
                  </label>
                  <Textarea
                    id="customer_concerns"
                    {...register("customer_concerns")}
                    rows={6}
                    placeholder="Describe the issue or service needed..."
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
                  {isSubmitting ? "Creating..." : "Create Work Order"}
                </Button>
                <Link href="/workorders">
                  <Button type="button" variant="outline" className="w-full">
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

