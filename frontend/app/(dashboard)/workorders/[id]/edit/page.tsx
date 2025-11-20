"use client";

import { useRouter, useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { workordersApi } from "@/lib/api/workorders";
import { customersApi } from "@/lib/api/customers";
import { vehiclesApi } from "@/lib/api/vehicles";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
import axios from "axios";

const workOrderSchema = z.object({
  customer: z.number().min(1, "Customer is required"),
  vehicle: z.number().min(1, "Vehicle is required"),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  status: z.enum([
    "draft", "inspection", "intake", "diagnosis", 
    "awaiting_approval", "approved", "in_progress", 
    "additional_work_found", "paused", "quality_check", 
    "completed", "invoiced", "closed"
  ]),
  customer_concerns: z.string().optional(),
});

type WorkOrderFormData = z.infer<typeof workOrderSchema>;

// Valid status transitions based on backend logic
const VALID_TRANSITIONS: Record<string, string[]> = {
  'draft': ['inspection', 'intake'],
  'inspection': ['intake', 'draft'],
  'intake': ['diagnosis', 'draft'],
  'diagnosis': ['awaiting_approval', 'approved', 'in_progress'],
  'awaiting_approval': ['approved', 'diagnosis'],
  'approved': ['in_progress', 'awaiting_approval'],
  'in_progress': ['paused', 'quality_check', 'completed', 'additional_work_found'],
  'additional_work_found': ['awaiting_approval', 'in_progress'],
  'paused': ['in_progress'],
  'quality_check': ['completed', 'in_progress'],
  'completed': ['invoiced', 'closed'],
  'invoiced': ['closed'],
  'closed': ['invoiced', 'completed', 'in_progress'],
};

// Status display labels
const STATUS_LABELS: Record<string, string> = {
  'draft': 'Draft',
  'inspection': 'Initial Inspection',
  'intake': 'Intake',
  'diagnosis': 'Diagnosis',
  'awaiting_approval': 'Awaiting Customer Approval',
  'approved': 'Approved',
  'in_progress': 'In Progress',
  'additional_work_found': 'Additional Work Found',
  'paused': 'Paused',
  'quality_check': 'Quality Check',
  'completed': 'Completed',
  'invoiced': 'Invoiced',
  'closed': 'Closed',
};

function getValidStatuses(currentStatus: string): string[] {
  // Always include current status
  const validStatuses = [currentStatus];
  
  // Add valid transitions
  const transitions = VALID_TRANSITIONS[currentStatus] || [];
  validStatuses.push(...transitions);
  
  return [...new Set(validStatuses)]; // Remove duplicates
}

export default function EditWorkOrderPage() {
  const router = useRouter();
  const params = useParams();
  const workOrderId = parseInt(params.id as string);
  const queryClient = useQueryClient();

  const [selectedCustomer, setSelectedCustomer] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { data: workOrder, isLoading } = useQuery({
    queryKey: ["workorder", workOrderId],
    queryFn: () => workordersApi.get(workOrderId),
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
  } = useForm<WorkOrderFormData>({
    resolver: zodResolver(workOrderSchema),
  });

  // Populate form when work order data loads
  useEffect(() => {
    if (workOrder && !isLoading) {
      const customerId = typeof workOrder.customer === 'object' && workOrder.customer !== null 
        ? workOrder.customer.id 
        : workOrder.customer || 0;
      const vehicleId = typeof workOrder.vehicle === 'object' && workOrder.vehicle !== null 
        ? workOrder.vehicle.id 
        : workOrder.vehicle || 0;
      
      reset({
        customer: customerId,
        vehicle: vehicleId,
        priority: workOrder.priority as any,
        status: workOrder.status as any,
        customer_concerns: workOrder.customer_concerns || "",
      });
      setSelectedCustomer(customerId || null);
    }
  }, [workOrder, isLoading, reset]);

  const customer = watch("customer");

  // Update selected customer when form value changes
  useEffect(() => {
    if (customer && customer !== selectedCustomer) {
      setSelectedCustomer(customer);
    }
  }, [customer, selectedCustomer]);

  const updateMutation = useMutation({
    mutationFn: (data: WorkOrderFormData) => workordersApi.update(workOrderId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workorder", workOrderId] });
      queryClient.invalidateQueries({ queryKey: ["workorders"] });
      setErrorMessage(null);
      router.push(`/workorders/${workOrderId}`);
    },
    onError: (error: unknown) => {
      console.error("Error updating work order:", error);
      if (axios.isAxiosError(error) && error.response?.data) {
        const errorData = error.response.data;
        // Handle status transition errors
        if (errorData.status) {
          let statusError = Array.isArray(errorData.status) 
            ? errorData.status[0] 
            : errorData.status;
          // Handle case where error might be a string representation of an array
          if (typeof statusError === 'string' && statusError.startsWith('[') && statusError.endsWith(']')) {
            try {
              const parsed = JSON.parse(statusError);
              statusError = Array.isArray(parsed) ? parsed[0] : parsed;
            } catch {
              // If parsing fails, remove brackets and quotes
              statusError = statusError.replace(/^\[|\]$/g, '').replace(/^'|'$/g, '');
            }
          }
          setErrorMessage(statusError);
        } else if (errorData.detail) {
          setErrorMessage(errorData.detail);
        } else if (errorData.message) {
          setErrorMessage(errorData.message);
        } else {
          setErrorMessage("Failed to update work order. Please try again.");
        }
      } else {
        setErrorMessage("Failed to update work order. Please try again.");
      }
    },
  });

  const onSubmit = async (data: WorkOrderFormData) => {
    setErrorMessage(null);
    await updateMutation.mutateAsync(data);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!workOrder) {
    return (
      <div className="space-y-4">
        <Link href="/workorders">
          <Button variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>
        <Card>
          <CardContent className="pt-6">
            <p className="text-red-600 dark:text-red-400">Work order not found.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Link href={`/workorders/${workOrderId}`}>
          <Button variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Edit Work Order</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Update work order information</p>
        </div>
      </div>

      {errorMessage && (
        <Card className="border-red-500 bg-red-50 dark:bg-red-900/20">
          <CardContent className="pt-6">
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-800 dark:text-red-200">
                  Error updating work order
                </p>
                <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                  {errorMessage}
                </p>
              </div>
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

  <CardContent>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      
      {/* Customer */}
      <div>
        <label
          htmlFor="customer"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          Customer *
        </label>

        <Select
          id="customer"
          {...register("customer", { valueAsNumber: true })}
          className={`w-full ${errors.customer ? "border-red-500" : ""}`}
          onChange={(e) => {
            const val = parseInt(e.target.value);
            setValue("customer", val);
            setSelectedCustomer(val);
          }}
        >
          <option value="">Select a customer</option>
          {customersData?.results?.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.user?.first_name} {customer.user?.last_name} — {customer.customer_number}
            </option>
          ))}
        </Select>

        {errors.customer && (
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">
            {errors.customer.message}
          </p>
        )}
      </div>

      {/* Vehicle */}
      <div>
        <label
          htmlFor="vehicle"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          Vehicle *
        </label>

        <Select
          id="vehicle"
          {...register("vehicle", { valueAsNumber: true })}
          className={`w-full ${errors.vehicle ? "border-red-500" : ""}`}
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
              {vehicle.make} {vehicle.model} {vehicle.year} — {vehicle.vin}
            </option>
          ))}
        </Select>

        {errors.vehicle && (
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">
            {errors.vehicle.message}
          </p>
        )}
      </div>

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
                    <label htmlFor="status" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Status
                    </label>
                    <Select
                      id="status"
                      {...register("status")}
                      className={errors.status ? "border-red-500" : ""}
                      disabled={!workOrder}
                    >
                      {workOrder ? (() => {
                        const validStatuses = getValidStatuses(workOrder.status);
                        return validStatuses.map((status) => (
                          <option key={status} value={status}>
                            {STATUS_LABELS[status] || status}
                            {status === workOrder.status ? " (current)" : ""}
                          </option>
                        ));
                      })() : (
                        <option value="">Loading...</option>
                      )}
                    </Select>
                    {workOrder && (
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Current: {STATUS_LABELS[workOrder.status] || workOrder.status}
                      </p>
                    )}
                    {errors.status && (
                      <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                        {errors.status.message}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label htmlFor="customer_concerns" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                  {isSubmitting ? "Saving..." : "Save Changes"}
                </Button>
                <Link href={`/workorders/${workOrderId}`}>
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

