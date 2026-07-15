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
  jobTypesApi,
  jobTypeRequiresBundle,
  type JobType,
} from "@/lib/api/job-types";
import { ServiceIntakeFields } from "@/components/workorders/ServiceIntakeFields";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, Phone, Mail, Tag, Car, Hash } from "lucide-react";
import Link from "next/link";
import { useState, useEffect, useMemo, useRef } from "react";
import { getUserFacingError } from "@/lib/api/errors";
import { getCustomerDisplayName } from "@/lib/utils/customer-display";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
import { FORM_PAGE_CLASS } from "@/lib/constants/layout";
import { CustomerSelector } from "@/components/customers/CustomerSelector";
import { getValidNextStatuses } from "@/lib/utils/workorder-transitions";
import type { WorkflowWorkOrderContext } from "@/lib/utils/workorder-workflow-steps";
import {
  mergeConcernSelections,
  splitConcernsText,
} from "@/lib/constants/common-concerns";

const workOrderSchema = z.object({
  customer: z.number().min(1, "Customer is required"),
  vehicle: z.number().min(1, "Vehicle is required"),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  status: z.enum([
    "draft", "inspection", "intake", "assigned", "diagnosis",
    "awaiting_approval", "approved", "in_progress",
    "additional_work_found", "paused", "quality_check",
    "completed", "invoiced", "closed",
  ]),
  customer_concerns: z.string().optional(),
  odometer_in: z.number().min(0).optional(),
  job_type_code: z.string().min(1, "Job type is required"),
  job_type_codes: z.array(z.string()).optional(),
  service_type: z.number().optional(),
  service_bundle: z.number().optional(),
});

type WorkOrderFormData = z.infer<typeof workOrderSchema>;

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
  const { hasPermission } = usePermissions();
  const canListCustomers = hasPermission("view_customers");

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
  const [selectedConcerns, setSelectedConcerns] = useState<string[]>([]);
  const [customConcerns, setCustomConcerns] = useState("");
  const concernsHydratedRef = useRef(false);

  const {
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
  const jobTypeCodes = watch("job_type_codes") || [jobTypeCode || "general_repairs"];
  const selectedJobTypes = useMemo<JobType[]>(() => {
    const jobTypes = jobTypesData?.results ?? [];
    return jobTypeCodes
      .map((code) => jobTypes.find((jt) => jt.code === code))
      .filter(Boolean) as JobType[];
  }, [jobTypesData, jobTypeCodes]);
  const selectedJobType = useMemo<JobType | null>(
    () => selectedJobTypes[0] ?? null,
    [selectedJobTypes]
  );
  const bundleRequired = jobTypeRequiresBundle(selectedJobType);

  const concernsMerged = useMemo(
    () => mergeConcernSelections(selectedConcerns, customConcerns),
    [selectedConcerns, customConcerns]
  );

  useEffect(() => {
    if (!concernsHydratedRef.current) return;
    setValue("customer_concerns", concernsMerged, { shouldValidate: false });
  }, [concernsMerged, setValue]);

  const toggleConcern = (concern: string) => {
    setSelectedConcerns((prev) =>
      prev.includes(concern) ? prev.filter((c) => c !== concern) : [...prev, concern]
    );
  };

  const bundles = (() => {
    if (!bundlesData) return [] as ServiceBundle[];
    return Array.isArray(bundlesData) ? bundlesData : (bundlesData as { results?: ServiceBundle[] }).results || [];
  })();

  // Fetch customers
  const { data: customersData } = useQuery({
    queryKey: ["customers", "list"],
    queryFn: () => customersApi.list({ page: 1 }),
    enabled: canListCustomers,
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
        odometer_in:
          typeof workOrder.odometer_in === "number"
            ? workOrder.odometer_in
            : workOrder.odometer_in != null
              ? Number(workOrder.odometer_in)
              : 0,
        job_type_code:
          workOrder.job_type_detail?.code ??
          (workOrder.maintenance_type === "routine" ? "routine_maintenance" : "general_repairs"),
        job_type_codes:
          (workOrder.job_type_codes?.length
            ? workOrder.job_type_codes
            : workOrder.job_types_detail?.map((jt) => jt.code).filter(Boolean)) ||
          [
            workOrder.job_type_detail?.code ??
              (workOrder.maintenance_type === "routine" ? "routine_maintenance" : "general_repairs"),
          ],
        service_type: serviceTypeId,
        service_bundle: serviceBundleId,
      });

      const split = splitConcernsText(workOrder.customer_concerns || "");
      setSelectedConcerns(split.selected);
      setCustomConcerns(split.custom);
      concernsHydratedRef.current = true;

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
    const codes = data.job_type_codes?.length
      ? data.job_type_codes
      : [data.job_type_code || "general_repairs"];
    await updateMutation.mutateAsync({
      ...data,
      job_type_code: codes[0],
      job_type_codes: codes,
    });
  };

  if (isLoading) {
    return (
      <div className={`${FORM_PAGE_CLASS} flex h-64 items-center justify-center`}>
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!workOrder) {
    return (
      <div className={`${FORM_PAGE_CLASS} space-y-4`}>
        <StaffPageHeader
          title="Work order not found"
          breadcrumbs={[
            { label: "Work Orders", href: "/workorders" },
            { label: "Edit" },
          ]}
        />
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
          This work order could not be loaded.
        </div>
        <Link href="/workorders">
          <Button variant="outline">Back to work orders</Button>
        </Link>
      </div>
    );
  }

  if (workOrder.status === "closed") {
    return (
      <div className={`${FORM_PAGE_CLASS} space-y-4`}>
        <StaffPageHeader
          title={`#${workOrder.work_order_number}`}
          description="Closed work orders cannot be edited."
          breadcrumbs={[
            { label: "Work Orders", href: "/workorders" },
            { label: workOrder.work_order_number, href: `/workorders/${workOrderId}` },
            { label: "Edit" },
          ]}
        />
        <Card>
          <CardHeader>
            <CardTitle>Work Order Locked</CardTitle>
            <CardDescription>
              Open the job card to review the final record.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href={`/workorders/${workOrderId}`}>
              <Button>View job card</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={`${FORM_PAGE_CLASS} space-y-6 pb-24`}>
      <StaffPageHeader
        title={`Edit #${workOrder.work_order_number}`}
        description="Update customer, vehicle, job type, and status."
        breadcrumbs={[
          { label: "Work Orders", href: "/workorders" },
          { label: workOrder.work_order_number, href: `/workorders/${workOrderId}` },
          { label: "Edit" },
        ]}
      />

      {errorMessage && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div>
            <p className="text-sm font-medium text-destructive">Could not save changes</p>
            <p className="mt-1 text-sm text-destructive">{errorMessage}</p>
          </div>
        </div>
      )}

      <form id="edit-work-order-form" onSubmit={handleSubmit(onSubmit)}>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Main Form */}
          <div className="space-y-6 lg:col-span-2">
            {/* Customer & Vehicle */}
            <Card className="overflow-hidden">
              <CardHeader className="border-b border-border/40 bg-muted/30 pb-4">
                <CardTitle className="text-base">Customer / Business & Vehicle</CardTitle>
                <CardDescription>Select the customer or business account and vehicle</CardDescription>
              </CardHeader>

              <CardContent className="space-y-6 pt-6">
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">

                  {/* Customer */}
                  <div className="space-y-3">
                    <div>
                      <label
                        htmlFor="customer"
                        className="mb-1 block text-sm font-medium text-card-foreground"
                      >
                        Customer / Business *
                      </label>

                      {canListCustomers ? (
                        <div className={errors.customer ? "[&_button]:border-destructive" : ""}>
                          <CustomerSelector
                            selectedCustomerId={watchedCustomer || undefined}
                            placeholder="Search by company, contact, phone..."
                            onSelect={(cust) => {
                              setValue("customer", cust.id, { shouldValidate: true });
                              setValue("vehicle", 0);
                              setSelectedCustomer(cust.id);
                              setSelectedCustomerData({
                                id: cust.id,
                                full_name: cust.full_name,
                                company_name: cust.company_name,
                                email: cust.email,
                                phone: cust.phone,
                                customer_type: cust.customer_type,
                                customer_number: cust.customer_number,
                              });
                            }}
                          />
                        </div>
                      ) : (
                        <Select
                          key={`customer-${watchedCustomer || "empty"}-${workOrder?.created_at || "loading"}`}
                          value={watchedCustomer ? String(watchedCustomer) : ""}
                          onValueChange={(val) => {
                            const numVal = parseInt(val);
                            setValue("customer", numVal);
                            setValue("vehicle", 0);
                            setSelectedCustomer(numVal);
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
                      )}

                      {errors.customer && (
                        <p className="mt-1 text-sm text-destructive">
                          {errors.customer.message}
                        </p>
                      )}
                    </div>

                    {selectedCustomerData && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {getCustomerDisplayName(selectedCustomerData)}
                        </span>
                        {selectedCustomerData.phone && (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {selectedCustomerData.phone}
                          </span>
                        )}
                        {selectedCustomerData.email && (
                          <span className="inline-flex max-w-[200px] items-center gap-1 truncate">
                            <Mail className="h-3 w-3 shrink-0" />
                            {selectedCustomerData.email}
                          </span>
                        )}
                        {selectedCustomerData.customer_type && (
                          <span className="inline-flex items-center gap-1 capitalize">
                            <Tag className="h-3 w-3" />
                            {selectedCustomerData.customer_type.replace("_", " ")}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Vehicle */}
                  <div className="space-y-3">
                    <div>
                      <label
                        htmlFor="vehicle"
                        className="mb-1 block text-sm font-medium text-card-foreground"
                      >
                        Vehicle *
                      </label>

                      <Select
                        key={`vehicle-${watchedVehicle || "empty"}-${workOrder?.created_at || "loading"}`}
                        value={watchedVehicle ? String(watchedVehicle) : ""}
                        onValueChange={(val) => setValue("vehicle", parseInt(val))}
                        disabled={!selectedCustomer}
                      >
                        <SelectTrigger id="vehicle" className={`w-full ${errors.vehicle ? "border-destructive" : ""}`}>
                          <SelectValue placeholder={!selectedCustomer
                            ? "Select a customer first"
                            : isLoadingVehicles
                              ? "Loading vehicles..."
                              : !vehiclesData?.results?.length && !(workOrder && typeof workOrder.vehicle === "object")
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
                        <p className="mt-1 text-sm text-destructive">
                          {errors.vehicle.message}
                        </p>
                      )}
                    </div>

                    {selectedVehicle && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1 font-medium text-foreground">
                          <Car className="h-3 w-3" />
                          {selectedVehicle.make} {selectedVehicle.model} {selectedVehicle.year}
                        </span>
                        {selectedVehicle.license_plate && (
                          <span className="inline-flex items-center gap-1">
                            <Hash className="h-3 w-3" />
                            {selectedVehicle.license_plate}
                          </span>
                        )}
                        {selectedVehicle.vin && (
                          <span>
                            VIN: <span className="font-mono text-[11px]">{selectedVehicle.vin}</span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                </div>
              </CardContent>
            </Card>


            {/* Work Order Details */}
            <Card className="overflow-hidden">
              <CardHeader className="border-b border-border/40 bg-muted/30 pb-4">
                <CardTitle className="text-base">Service & request</CardTitle>
                <CardDescription>
                  Job type, package if needed, customer concerns, and intake reading
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 pt-6">
                <ServiceIntakeFields
                  idPrefix="edit-wo"
                  jobTypeCode={jobTypeCode || "general_repairs"}
                  jobTypeCodes={jobTypeCodes}
                  onJobTypeChange={(code, jobType) => {
                    setValue("job_type_code", code, { shouldValidate: true });
                    if (!jobTypeRequiresBundle(jobType)) {
                      setValue("service_bundle", undefined);
                      setValue("service_type", undefined);
                    }
                  }}
                  onJobTypesChange={(codes, types) => {
                    setValue("job_type_codes", codes, { shouldValidate: true });
                    setValue("job_type_code", codes[0] || "general_repairs", {
                      shouldValidate: true,
                    });
                    const primary = types[0] ?? null;
                    if (!jobTypeRequiresBundle(primary)) {
                      setValue("service_bundle", undefined);
                      setValue("service_type", undefined);
                    }
                  }}
                  primaryJobType={selectedJobType}
                  selectedJobTypes={selectedJobTypes}
                  bundles={bundles}
                  serviceBundleId={watch("service_bundle")}
                  onServiceBundleChange={(bundleId, bundle) => {
                    setValue("service_bundle", bundleId, { shouldValidate: true });
                    if (bundle.service_type) {
                      setValue("service_type", bundle.service_type);
                    }
                    if (!customConcerns.trim() || customConcerns.startsWith("Perform")) {
                      setSelectedConcerns([]);
                      setCustomConcerns(`Perform ${bundle.name}`);
                    }
                  }}
                  bundleError={errors.service_bundle?.message}
                  selectedConcerns={selectedConcerns}
                  onToggleConcern={toggleConcern}
                  customConcerns={customConcerns}
                  onCustomConcernsChange={setCustomConcerns}
                  concernsPreview={concernsMerged}
                  concernsError={errors.customer_concerns?.message}
                  odometer={
                    typeof watch("odometer_in") === "number" && !Number.isNaN(watch("odometer_in"))
                      ? String(watch("odometer_in"))
                      : ""
                  }
                  onOdometerChange={(value) => {
                    const parsed = value === "" ? 0 : parseInt(value, 10);
                    setValue("odometer_in", Number.isNaN(parsed) ? 0 : parsed, {
                      shouldValidate: true,
                    });
                  }}
                  odometerError={errors.odometer_in?.message}
                  priority={(watch("priority") as "low" | "normal" | "high" | "urgent") || "normal"}
                  onPriorityChange={(value) => setValue("priority", value)}
                />

                <div className="max-w-sm border-t border-border/60 pt-4">
                  <label htmlFor="status" className="mb-1 block text-sm font-medium text-card-foreground">
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
                    <p className="mt-1 text-sm text-destructive">
                      {errors.status.message}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar Actions — desktop */}
          <div className="hidden space-y-6 lg:block">
            <div className="space-y-6 lg:sticky lg:top-20 lg:self-start">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-medium">Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button type="submit" className="w-full shadow-workshop" disabled={isSubmitting}>
                    {isSubmitting ? "Saving..." : "Save Changes"}
                  </Button>
                  <Link href={`/workorders/${workOrderId}`} className="block">
                    <Button type="button" variant="outline" className="w-full">
                      Cancel
                    </Button>
                  </Link>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-medium">Job card</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex justify-between gap-2">
                    <span>Number</span>
                    <span className="font-mono text-foreground">{workOrder.work_order_number}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span>Status</span>
                    <span className="text-foreground">
                      {STATUS_LABELS[workOrder.status] || workOrder.status}
                    </span>
                  </div>
                  {typeof workOrder.branch === "object" && workOrder.branch?.name ? (
                    <div className="flex justify-between gap-2">
                      <span>Branch</span>
                      <span className="text-right text-foreground">{workOrder.branch.name}</span>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </form>

      {/* Mobile sticky actions */}
      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-3 border-t border-border bg-background/95 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden">
        <Link href={`/workorders/${workOrderId}`}>
          <Button type="button" variant="outline" disabled={isSubmitting}>
            Cancel
          </Button>
        </Link>
        <Button
          type="submit"
          form="edit-work-order-form"
          className="shadow-workshop"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
