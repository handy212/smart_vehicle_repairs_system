"use client";

import { useRouter, useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { workordersApi } from "@/lib/api/workorders";
import { customersApi } from "@/lib/api/customers";
import { vehiclesApi } from "@/lib/api/vehicles";
import { inventoryApi, ServiceBundle } from "@/lib/api/inventory";
import {
  SERVICE_PACKAGE_LABEL,
  SERVICE_PACKAGE_PLACEHOLDER,
} from "@/lib/workorders/job-type-labels";
import {
  jobTypesApi,
  jobTypeRequiresBundle,
  type JobType,
} from "@/lib/api/job-types";
import { JobTypeSelect } from "@/components/workorders/JobTypeSelect";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { getUserFacingError } from "@/lib/api/errors";
import { getCustomerDisplayName } from "@/lib/utils/customer-display";

const workOrderSchema = z.object({
  customer: z.number().min(1, "Customer is required"),
  vehicle: z.number().min(1, "Vehicle is required"),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  status: z.enum([
    "draft", "inspection", "intake", "assigned", "diagnosis",
    "awaiting_approval", "approved", "in_progress",
    "additional_work_found", "paused", "quality_check",
    "completed", "invoiced", "closed"
  ]),
  customer_concerns: z.string().optional(),
  job_type_code: z.string().min(1, "Job type is required"),
  service_type: z.number().optional(),
  service_bundle: z.number().optional(),
});

type WorkOrderFormData = z.infer<typeof workOrderSchema>;

import { getValidNextStatuses } from "@/lib/utils/workorder-transitions";
import type { WorkflowWorkOrderContext } from "@/lib/utils/workorder-workflow-steps";

// Status display labels
const STATUS_LABELS: Record<string, string> = {
  'draft': 'Draft',
  'inspection': 'Initial Inspection',
  'intake': 'Intake',
  'assigned': 'Assigned',
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

function getValidStatuses(
  currentStatus: string,
  workOrder?: (WorkflowWorkOrderContext & { paused_from_status?: string | null }) | null
): string[] {
  const validStatuses = [currentStatus];
  let transitions = getValidNextStatuses(currentStatus, workOrder);

  if (
    currentStatus === "paused" &&
    workOrder &&
    (workOrder.paused_from_status === "diagnosis" || workOrder.diagnosis_status === "paused")
  ) {
    transitions = transitions.filter((status) => status !== "in_progress");
  }

  validStatuses.push(...transitions);
  return [...new Set(validStatuses)];
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
    company_name?: string;
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

  // Fetch active service bundles for routine jobs
  const { data: bundlesData } = useQuery({
    queryKey: ["inventory", "bundles", "active"],
    queryFn: () => inventoryApi.listBundles({ is_active: true }),
  });

  const { data: jobTypesData } = useQuery({
    queryKey: ["workorders", "job-types"],
    queryFn: () => jobTypesApi.list({ active_only: true }),
  });

  const jobTypeCode = watch("job_type_code");
  const selectedJobType = useMemo<JobType | null>(() => {
    const jobTypes = jobTypesData?.results ?? [];
    return jobTypes.find((jt) => jt.code === jobTypeCode) ?? null;
  }, [jobTypesData, jobTypeCode]);
  const bundleRequired = jobTypeRequiresBundle(selectedJobType);

  const bundles = (() => {
    if (!bundlesData) return [] as ServiceBundle[];
    return Array.isArray(bundlesData) ? bundlesData : (bundlesData as { results?: ServiceBundle[] }).results || [];
  })();

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
  const watchedVehicle = watch("vehicle");
  const selectedVehicle = (() => {
    const vehicleId = watchedVehicle;
    if (!vehicleId) return null;

    // Check in fetched list
    const fromList = vehiclesData?.results?.find((v) => v.id === vehicleId);
    if (fromList) return fromList;

    // Fallback to workOrder nested object if it matches
    if (workOrder && typeof workOrder.vehicle === 'object' && workOrder.vehicle !== null) {
      if (workOrder.vehicle.id === vehicleId) {
        return workOrder.vehicle;
      }
    }

    return null;
  })();

  // Prepare fallback lists for Select components
  // This ensures the Select always has the current value as an option
  const customerOptions = (() => {
    const items = new Map<number, string>();

    // 1. Add fetched customers
    customersData?.results?.forEach(c => {
      items.set(c.id, getCustomerDisplayName(c));
    });

    // 2. Add current work order customer if not present
    if (workOrder) {
      const wCustomer = workOrder.customer;
      // Handle object case
      if (typeof wCustomer === 'object' && wCustomer !== null) {
        if (!items.has(wCustomer.id)) {
          items.set(wCustomer.id, getCustomerDisplayName(wCustomer));
        }
      }
      // Handle ID case with display name
      else if (typeof wCustomer === 'number' && wCustomer > 0) {
        if (!items.has(wCustomer)) {
          items.set(wCustomer, workOrder.customer_name || `Customer #${wCustomer}`);
        }
      }
    }

    return Array.from(items.entries()).map(([id, label]) => ({ id, label }));
  })();

  const vehicleOptions = (() => {
    const items = new Map<number, string>();

    // 1. Add fetched vehicles
    vehiclesData?.results?.forEach(v => {
      items.set(v.id, `${v.make} ${v.model} ${v.year} — ${v.vin}`);
    });

    // 2. Add current work order vehicle if not present
    if (workOrder) {
      const wVehicle = workOrder.vehicle;
      if (typeof wVehicle === 'object' && wVehicle !== null) {
        if (!items.has(wVehicle.id)) {
          items.set(wVehicle.id, workOrder.vehicle_display || workOrder.vehicle_info || 'Current Vehicle');
        }
      } else if (typeof wVehicle === 'number' && wVehicle > 0) {
        if (!items.has(wVehicle)) {
          items.set(wVehicle, workOrder.vehicle_display || workOrder.vehicle_info || `Vehicle #${wVehicle}`);
        }
      }
    }

    return Array.from(items.entries()).map(([id, label]) => ({ id, label }));
  })();



  // Populate form when work order data loads
  useEffect(() => {
    if (workOrder && !isLoading) {
      // Safer extraction of IDs
      let customerId = 0;
      if (workOrder.customer) {
        if (typeof workOrder.customer === 'object' && 'id' in workOrder.customer) {
          customerId = workOrder.customer.id;
        } else if (typeof workOrder.customer === 'number') {
          customerId = workOrder.customer;
        }
      }

      let vehicleId = 0;
      if (workOrder.vehicle) {
        if (typeof workOrder.vehicle === 'object' && 'id' in workOrder.vehicle) {
          vehicleId = workOrder.vehicle.id;
        } else if (typeof workOrder.vehicle === 'number') {
          vehicleId = workOrder.vehicle;
        }
      }

      const serviceTypeId = typeof workOrder.service_type === 'object' && workOrder.service_type !== null
        ? workOrder.service_type.id
        : (typeof workOrder.service_type === 'number' ? workOrder.service_type : undefined);

      const serviceBundleId = typeof workOrder.service_bundle === 'object' && workOrder.service_bundle !== null
        ? workOrder.service_bundle.id
        : (typeof workOrder.service_bundle === 'number' ? workOrder.service_bundle : undefined);

      // Use setValue for critical fields to ensure they register
      setValue("customer", customerId || 0);
      setValue("vehicle", vehicleId || 0);

      reset({
        customer: customerId || 0,
        vehicle: vehicleId || 0,

        priority: (workOrder.priority || "normal") as WorkOrderFormData["priority"],

        status: (workOrder.status || "draft") as WorkOrderFormData["status"],
        customer_concerns: workOrder.customer_concerns || "",
        job_type_code:
          workOrder.job_type_detail?.code ??
          (workOrder.maintenance_type === "routine" ? "routine_maintenance" : "general_repairs"),
        service_type: serviceTypeId,
        service_bundle: serviceBundleId,
      });

      // Explicitly sync local state for immediate feedback
      if (customerId) {
        setSelectedCustomer(customerId);
      }

      // Set customer data if available from workOrder
      if (typeof workOrder.customer === 'object' && workOrder.customer !== null) {
        setSelectedCustomerData({
          id: workOrder.customer.id,
          full_name: workOrder.customer.full_name,
          company_name: workOrder.customer.company_name,
          email: workOrder.customer.email,
          phone: workOrder.customer.phone,
          customer_type: workOrder.customer.customer_type,
          customer_number: workOrder.customer.customer_number,
        });
      }
    }
  }, [workOrder, isLoading, reset, setValue]);

  const watchedCustomer = watch("customer");

  // Sync selectedCustomer state and data when form value changes
  useEffect(() => {
    if (watchedCustomer && watchedCustomer > 0) {
      if (watchedCustomer !== selectedCustomer) {
        setSelectedCustomer(watchedCustomer);
      }

      // Find and store selected customer data
      const customerInList = customersData?.results?.find((c) => c.id === watchedCustomer);
      if (customerInList) {
        setSelectedCustomerData({
          id: customerInList.id,
          full_name: customerInList.full_name,
          company_name: customerInList.company_name,
          email: customerInList.email,
          phone: customerInList.phone,
          customer_type: customerInList.customer_type,
          customer_number: customerInList.customer_number,
        });
      } else if (workOrder && typeof workOrder.customer === 'object' && workOrder.customer?.id === watchedCustomer) {
        // Fallback to workOrder customer data
        setSelectedCustomerData({
          id: workOrder.customer.id,
          full_name: workOrder.customer.full_name,
          company_name: workOrder.customer.company_name,
          email: workOrder.customer.email,
          phone: workOrder.customer.phone,
          customer_type: workOrder.customer.customer_type,
          customer_number: workOrder.customer.customer_number,
        });
      }
    } else if (watchedCustomer === 0 || !watchedCustomer) {
      if (selectedCustomer !== null) setSelectedCustomer(null);
      if (selectedCustomerData !== null) setSelectedCustomerData(null);
    }
  }, [watchedCustomer, selectedCustomer, customersData, workOrder]);

  // Initialize customer data when customersData loads
  useEffect(() => {
    if (customersData?.results && watchedCustomer && (!selectedCustomerData || selectedCustomerData.id !== watchedCustomer)) {
      const customerData = customersData.results.find((c) => c.id === watchedCustomer);
      if (customerData) {
        setSelectedCustomerData({
          id: customerData.id,
          full_name: customerData.full_name,
          company_name: customerData.company_name,
          email: customerData.email,
          phone: customerData.phone,
          customer_type: customerData.customer_type,
          customer_number: customerData.customer_number,
        });
      }
    }
  }, [customersData, watchedCustomer, selectedCustomerData]);

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
      setErrorMessage(getUserFacingError(error, "Failed to update work order. Please try again."));
    },
  });

  const onSubmit = async (data: WorkOrderFormData) => {
    setErrorMessage(null);
    if (bundleRequired && !data.service_bundle) {
      setErrorMessage("Select a service package for this job type.");
      return;
    }
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
            <p className="text-destructive dark:text-red-400">Work order not found.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (workOrder.status === "closed") {
    return (
      <div className="space-y-4">
        <Link href={`/workorders/${workOrderId}`}>
          <Button variant="secondary">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>Work Order Locked</CardTitle>
            <CardDescription>
              Closed work orders cannot be edited.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Work order <span className="font-mono text-foreground">{workOrder.work_order_number}</span> is already closed. Open the job card to review the final record.
            </p>
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
        <Card className="border-destructive bg-destructive/10 dark:bg-red-900/20">
          <CardContent className="pt-6">
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-destructive dark:text-red-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-destructive dark:text-red-200">
                  Error updating work order
                </p>
                <p className="text-sm text-destructive dark:text-red-400 mt-1">
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
                <CardTitle>Customer / Business & Vehicle</CardTitle>
                <CardDescription>Select the customer or business account and vehicle</CardDescription>
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
                        Customer / Business *
                      </label>

                      <Select
                        key={`customer-${watchedCustomer || 'empty'}-${workOrder?.created_at || 'loading'}`}
                        value={watchedCustomer ? String(watchedCustomer) : ""}
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
                              company_name: customerData.company_name,
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
                        <SelectTrigger id="customer" className={`w-full ${errors.customer ? "border-destructive" : ""}`}>
                          <SelectValue placeholder="Select a customer or business" />
                        </SelectTrigger>
                        <SelectContent>
                          {customerOptions.map((option) => (
                            <SelectItem key={option.id} value={option.id.toString()}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {errors.customer && (
                        <p className="mt-1 text-sm text-destructive dark:text-red-400">
                          {errors.customer.message}
                        </p>
                      )}
                    </div>

                    {/* Customer Info Display */}
                    {selectedCustomerData && (
                      <div className="p-3 bg-muted rounded-md border border-border space-y-2">
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                          Customer / Business Information
                        </div>
                        <div className="space-y-2 text-sm">
                          <div className="flex items-start">
                            <span className="font-medium text-card-foreground w-20 flex-shrink-0">Name:</span>
                            <span className="text-foreground">{getCustomerDisplayName(selectedCustomerData)}</span>
                          </div>
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
                        key={`vehicle-${watchedVehicle || 'empty'}-${workOrder?.created_at || 'loading'}`}
                        value={watchedVehicle ? String(watchedVehicle) : ""}
                        onValueChange={(val) => setValue("vehicle", parseInt(val))}
                        disabled={!selectedCustomer}
                      >
                        <SelectTrigger id="vehicle" className={`w-full ${errors.vehicle ? "border-destructive" : ""}`}>
                          <SelectValue placeholder={!selectedCustomer
                            ? "Select a customer first"
                            : isLoadingVehicles
                              ? "Loading vehicles..."
                              : !vehiclesData?.results?.length && !(workOrder && typeof workOrder.vehicle === 'object')
                                ? "No vehicles found"
                                : "Select a vehicle"} />
                        </SelectTrigger>
                        <SelectContent>
                          {vehicleOptions.map((option) => (
                            <SelectItem key={option.id} value={option.id.toString()}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {errors.vehicle && (
                        <p className="mt-1 text-sm text-destructive dark:text-red-400">
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
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <JobTypeSelect
                      value={jobTypeCode || "general_repairs"}
                      onChange={(code, jobType) => {
                        setValue("job_type_code", code, { shouldValidate: true });
                        if (!jobTypeRequiresBundle(jobType)) {
                          setValue("service_bundle", undefined);
                          setValue("service_type", undefined);
                        }
                      }}
                    />
                  </div>

                  {bundleRequired && (
                    <div>
                      <label htmlFor="service_bundle" className="mb-1 block text-sm font-medium text-card-foreground">
                        {SERVICE_PACKAGE_LABEL} *
                      </label>
                      <Select
                        value={watch("service_bundle")?.toString() || ""}
                        onValueChange={(val) => {
                          const bundleId = parseInt(val, 10);
                          setValue("service_bundle", bundleId, { shouldValidate: true });

                          const bundle = bundles.find((b) => b.id === bundleId);
                          if (bundle?.service_type) {
                            setValue("service_type", bundle.service_type);
                          }
                          if (bundle && !watch("customer_concerns")) {
                            setValue("customer_concerns", `Perform ${bundle.name}`);
                          }
                        }}
                      >
                        <SelectTrigger id="service_bundle">
                          <SelectValue placeholder={SERVICE_PACKAGE_PLACEHOLDER} />
                        </SelectTrigger>
                        <SelectContent>
                          {bundles.map((bundle) => (
                            <SelectItem key={bundle.id} value={bundle.id.toString()}>
                              {bundle.name}
                              {bundle.service_type_name ? ` · ${bundle.service_type_name}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.service_bundle && (
                        <p className="mt-1 text-sm text-destructive">{errors.service_bundle.message}</p>
                      )}
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

                      onValueChange={(val) => setValue("priority", val as WorkOrderFormData["priority"])}
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

                      onValueChange={(val) => setValue("status", val as WorkOrderFormData["status"])}
                      disabled={!workOrder}
                    >
                      <SelectTrigger id="status" className={`w-full ${errors.status ? "border-destructive" : ""}`}>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        {workOrder ? (() => {
                          const validStatuses = getValidStatuses(workOrder.status, workOrder);
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
                      <p className="mt-1 text-sm text-destructive dark:text-red-400">
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
