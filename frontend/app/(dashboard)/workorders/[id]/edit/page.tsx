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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  maintenance_type: z.enum(["general", "routine"]).optional(),
  service_type: z.number().optional(),
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

// Interface for Select items to handle both direct results and fallback from workOrder
interface CustomerSelectItem {
  id: number;
  full_name: string;
}

interface VehicleSelectItem {
  id: number;
  label: string;
}

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
  const [selectedCustomerData, setSelectedCustomerData] = useState<{
    id: number;
    full_name?: string;
    email?: string;
    phone?: string;
    customer_type?: string;
    customer_number?: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  const { data: workOrder, isLoading } = useQuery({
    queryKey: ["workorder", workOrderId],
    queryFn: () => workordersApi.get(workOrderId),
  });

  // Fetch service types
  const { data: serviceTypesData } = useQuery({
    queryKey: ["serviceTypes"],
    queryFn: () => vehiclesApi.getServiceTypes(),
  });

  // Fetch customers
  const { data: customersData } = useQuery({
    queryKey: ["customers", "list"],
    queryFn: () => customersApi.list({ page: 1 }),
  });

  // Fetch vehicles for selected customer
  const { data: vehiclesData, isLoading: isLoadingVehicles } = useQuery({
    queryKey: ["vehicles", "customer", selectedCustomer],
    queryFn: () => vehiclesApi.list({ owner: selectedCustomer || undefined }),
    enabled: !!selectedCustomer,
  });

  // Get selected vehicle details
  const vehicle = watch("vehicle");
  const selectedVehicle = (() => {
    if (!vehicle) return null;

    // Check in fetched list
    const fromList = vehiclesData?.results?.find((v) => v.id === vehicle);
    if (fromList) return fromList;

    // Fallback to workOrder nested object if it matches
    if (workOrder && typeof workOrder.vehicle === 'object' && workOrder.vehicle !== null) {
      if (workOrder.vehicle.id === vehicle) {
        return workOrder.vehicle;
      }
    }

    return null;
  })();



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
        maintenance_type: (workOrder.maintenance_type as any) || "general",
        service_type: typeof workOrder.service_type === 'object' && workOrder.service_type !== null ? workOrder.service_type.id : (workOrder.service_type || undefined),
      });
      // Use a brief timeout to ensure state updates or just let useEffect handles it
      setSelectedCustomer(customerId || null);

      // Set customer data if available from workOrder
      if (typeof workOrder.customer === 'object' && workOrder.customer !== null) {
        setSelectedCustomerData({
          id: workOrder.customer.id,
          full_name: workOrder.customer.full_name,
          email: workOrder.customer.email,
          phone: workOrder.customer.phone,
          customer_type: workOrder.customer.customer_type,
          customer_number: workOrder.customer.customer_number,
        });
      }
    }
  }, [workOrder, isLoading, reset]);

  const customer = watch("customer");

  // Update selected customer when form value changes
  useEffect(() => {
    if (customer && customer !== selectedCustomer) {
      setSelectedCustomer(customer);

      // Find and store selected customer data
      const customerInList = customersData?.results?.find((c) => c.id === customer);
      if (customerInList) {
        setSelectedCustomerData({
          id: customerInList.id,
          full_name: customerInList.full_name,
          email: customerInList.email,
          phone: customerInList.phone,
          customer_type: customerInList.customer_type,
          customer_number: customerInList.customer_number,
        });
      } else if (workOrder && typeof workOrder.customer === 'object' && workOrder.customer?.id === customer) {
        // Fallback to workOrder customer data if not in the current page of customers
        setSelectedCustomerData({
          id: workOrder.customer.id,
          full_name: workOrder.customer.full_name,
          email: workOrder.customer.email,
          phone: workOrder.customer.phone,
          customer_type: workOrder.customer.customer_type,
          customer_number: workOrder.customer.customer_number,
        });
      }
    } else if (!customer) {
      setSelectedCustomerData(null);
    }
  }, [customer, selectedCustomer, customersData, workOrder]);

  // Initialize customer data when customersData loads
  useEffect(() => {
    if (customersData?.results && customer && (!selectedCustomerData || selectedCustomerData.id !== customer)) {
      const customerData = customersData.results.find((c) => c.id === customer);
      if (customerData) {
        setSelectedCustomerData({
          id: customerData.id,
          full_name: customerData.full_name,
          email: customerData.email,
          phone: customerData.phone,
          customer_type: customerData.customer_type,
          customer_number: customerData.customer_number,
        });
      }
    }
  }, [customersData, customer, selectedCustomerData]);

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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!workOrder) {
    return (
      <div className="space-y-4">
        <Link href="/workorders">
          <Button variant="secondary">
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
          <Button variant="secondary">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-foreground">Edit Work Order</h1>
          <p className="text-sm text-muted-foreground mt-1">Update work order information</p>
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

              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                  {/* Customer */}
                  <div className="space-y-3">
                    <div>
                      <label
                        htmlFor="customer"
                        className="block text-sm font-medium text-card-foreground mb-1"
                      >
                        Customer *
                      </label>

                      <Select
                        value={customer?.toString() || ""}
                        onValueChange={(val) => {
                          const numVal = parseInt(val);
                          setValue("customer", numVal);
                          setValue("vehicle", 0); // Reset vehicle when customer changes
                          setSelectedCustomer(numVal);

                          // Update selected customer data
                          const customerData = customersData?.results?.find((c) => c.id === numVal);
                          if (customerData) {
                            setSelectedCustomerData({
                              id: customerData.id,
                              full_name: customerData.full_name,
                              email: customerData.email,
                              phone: customerData.phone,
                              customer_type: customerData.customer_type,
                              customer_number: customerData.customer_number,
                            });
                          } else {
                            setSelectedCustomerData(null);
                          }
                        }}
                      >
                        <SelectTrigger id="customer" className={`w-full ${errors.customer ? "border-red-500" : ""}`}>
                          <SelectValue placeholder="Select a customer" />
                        </SelectTrigger>
                        <SelectContent>
                          {(() => {
                            const items: CustomerSelectItem[] = [];

                            // Add all customers from the list
                            customersData?.results?.forEach(c => {
                              items.push({
                                id: c.id,
                                full_name: c.full_name || `${c.user?.first_name || ''} ${c.user?.last_name || ''}`.trim() || 'Unknown'
                              });
                            });

                            // Add current customer from workOrder if missing from list
                            if (workOrder && typeof workOrder.customer === 'object' && workOrder.customer !== null) {
                              if (!items.find(i => i.id === (workOrder.customer as any).id)) {
                                items.push({
                                  id: (workOrder.customer as any).id,
                                  full_name: (workOrder.customer as any).full_name || 'Current Customer'
                                });
                              }
                            }

                            return items.map((item) => (
                              <SelectItem key={item.id} value={item.id.toString()}>
                                {item.full_name}
                              </SelectItem>
                            ));
                          })()}
                        </SelectContent>
                      </Select>

                      {errors.customer && (
                        <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                          {errors.customer.message}
                        </p>
                      )}
                    </div>

                    {/* Customer Info Display */}
                    {selectedCustomerData && (
                      <div className="p-3 bg-muted rounded-md border border-border space-y-2">
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                          Customer Information
                        </div>
                        <div className="space-y-2 text-sm">
                          {selectedCustomerData.phone && (
                            <div className="flex items-start">
                              <span className="font-medium text-card-foreground w-20 flex-shrink-0">Phone:</span>
                              <span className="text-foreground">{selectedCustomerData.phone}</span>
                            </div>
                          )}
                          {selectedCustomerData.email && (
                            <div className="flex items-start">
                              <span className="font-medium text-card-foreground w-20 flex-shrink-0">Email:</span>
                              <span className="text-foreground break-words">{selectedCustomerData.email}</span>
                            </div>
                          )}
                          {selectedCustomerData.customer_type && (
                            <div className="flex items-start">
                              <span className="font-medium text-card-foreground w-20 flex-shrink-0">Type:</span>
                              <span className="text-foreground capitalize">
                                {selectedCustomerData.customer_type.replace('_', ' ')}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Vehicle */}
                  <div className="space-y-3">
                    <div>
                      <label
                        htmlFor="vehicle"
                        className="block text-sm font-medium text-card-foreground mb-1"
                      >
                        Vehicle *
                      </label>

                      <Select
                        value={vehicle?.toString() || ""}
                        onValueChange={(val) => setValue("vehicle", parseInt(val))}
                        disabled={!selectedCustomer || (isLoadingVehicles && !workOrder)}
                      >
                        <SelectTrigger id="vehicle" className={`w-full ${errors.vehicle ? "border-red-500" : ""}`}>
                          <SelectValue placeholder={!selectedCustomer
                            ? "Select a customer first"
                            : isLoadingVehicles
                              ? "Loading vehicles..."
                              : !vehiclesData?.results?.length && !(workOrder && typeof workOrder.vehicle === 'object')
                                ? "No vehicles found"
                                : "Select a vehicle"} />
                        </SelectTrigger>
                        <SelectContent>
                          {(() => {
                            const items: VehicleSelectItem[] = [];

                            // Add all vehicles from the list
                            vehiclesData?.results?.forEach(v => {
                              items.push({
                                id: v.id,
                                label: `${v.make} ${v.model} ${v.year} — ${v.vin}`
                              });
                            });

                            // Add current vehicle from workOrder if missing from list
                            if (workOrder && typeof workOrder.vehicle === 'object' && workOrder.vehicle !== null) {
                              if (!items.find(i => i.id === (workOrder.vehicle as any).id)) {
                                items.push({
                                  id: (workOrder.vehicle as any).id,
                                  label: (workOrder.vehicle_info || 'Current Vehicle')
                                });
                              }
                            }

                            return items.map((item) => (
                              <SelectItem key={item.id} value={item.id.toString()}>
                                {item.label}
                              </SelectItem>
                            ));
                          })()}
                        </SelectContent>
                      </Select>

                      {errors.vehicle && (
                        <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                          {errors.vehicle.message}
                        </p>
                      )}
                    </div>

                    {/* Vehicle Info Display */}
                    {selectedVehicle && (
                      <div className="p-3 bg-muted rounded-md border border-border space-y-2">
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                          Vehicle Info
                        </div>
                        <div className="space-y-2 text-sm">
                          <div className="flex items-start">
                            <span className="font-medium text-card-foreground w-24 flex-shrink-0">Make/Model:</span>
                            <span className="text-foreground">
                              {selectedVehicle.make} {selectedVehicle.model} {selectedVehicle.year}
                            </span>
                          </div>
                          {selectedVehicle.license_plate && (
                            <div className="flex items-start">
                              <span className="font-medium text-card-foreground w-24 flex-shrink-0">License:</span>
                              <span className="text-foreground">{selectedVehicle.license_plate}</span>
                            </div>
                          )}
                          {selectedVehicle.vin && (
                            <div className="flex items-start">
                              <span className="font-medium text-card-foreground w-24 flex-shrink-0">VIN:</span>
                              <span className="text-foreground font-mono text-xs break-all">{selectedVehicle.vin}</span>
                            </div>
                          )}
                        </div>
                      </div>
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
                  {/* Maintenance Type */}
                  <div className="col-span-2 md:col-span-1">
                    <label className="block text-sm font-medium text-card-foreground mb-1">
                      Maintenance Type
                    </label>
                    <div className="flex items-center space-x-4 mt-2">
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="radio"
                          value="general"
                          {...register("maintenance_type")}
                          className="w-4 h-4 text-primary border-border focus:ring-primary"
                        />
                        <span className="text-sm font-medium text-foreground">General Repair</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="radio"
                          value="routine"
                          {...register("maintenance_type")}
                          className="w-4 h-4 text-primary border-border focus:ring-primary"
                        />
                        <span className="text-sm font-medium text-foreground">Routine Service</span>
                      </label>
                    </div>
                  </div>

                  {/* Service Type (only if routine) */}
                  {watch("maintenance_type") === "routine" && (
                    <div className="col-span-2 md:col-span-1">
                      <label htmlFor="service_type" className="block text-sm font-medium text-card-foreground mb-1">
                        Service Type
                      </label>
                      <Select
                        value={watch("service_type")?.toString()}
                        onValueChange={(val) => {
                          setValue("service_type", parseInt(val));
                          // Auto-fill concerns if empty
                          const type = serviceTypesData?.results?.find(t => t.id === parseInt(val));
                          if (type && !watch("customer_concerns")) {
                            setValue("customer_concerns", `Perform ${type.name}`);
                          }
                        }}
                      >
                        <SelectTrigger id="service_type">
                          <SelectValue placeholder="Select service type" />
                        </SelectTrigger>
                        <SelectContent>
                          {serviceTypesData?.results?.map((type) => (
                            <SelectItem key={type.id} value={type.id.toString()}>
                              {type.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="priority" className="block text-sm font-medium text-foreground mb-1">
                      Priority
                    </label>
                    <Select
                      value={watch("priority")}
                      onValueChange={(val) => setValue("priority", val as any)}
                    >
                      <SelectTrigger id="priority" className="w-full">
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
                  <div>
                    <label htmlFor="status" className="block text-sm font-medium text-card-foreground mb-1">
                      Status
                    </label>
                    <Select
                      value={watch("status")}
                      onValueChange={(val) => setValue("status", val as any)}
                      disabled={!workOrder}
                    >
                      <SelectTrigger id="status" className={`w-full ${errors.status ? "border-red-500" : ""}`}>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        {workOrder ? (() => {
                          const validStatuses = getValidStatuses(workOrder.status);
                          return validStatuses.map((status) => (
                            <SelectItem key={status} value={status}>
                              {STATUS_LABELS[status] || status}
                              {status === workOrder.status ? " (current)" : ""}
                            </SelectItem>
                          ));
                        })() : (
                          <SelectItem value="loading">Loading...</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    {workOrder && (
                      <p className="mt-1 text-xs text-muted-foreground">
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
                  <label htmlFor="customer_concerns" className="block text-sm font-medium text-card-foreground mb-1">
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

