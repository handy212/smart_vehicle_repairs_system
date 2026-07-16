"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useRouter, useSearchParams } from "next/navigation";
import { useForm, SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { workordersApi } from "@/lib/api/workorders";
import { customersApi } from "@/lib/api/customers";
import { vehiclesApi } from "@/lib/api/vehicles";
import { appointmentsApi } from "@/lib/api/appointments";
import { inventoryApi, ServiceBundle } from "@/lib/api/inventory";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import Link from "next/link";
import { useState, useEffect, useMemo, useRef } from "react";
import { CustomerForm, CustomerFormData } from "@/components/customers/CustomerForm";
import { VehicleForm, VehicleFormData } from "@/components/vehicles/VehicleForm";
import { useToast } from "@/lib/hooks/useToast";
import { AxiosError } from "axios";
import { getUserFacingError } from "@/lib/api/errors";
import {
  jobTypesApi,
  isFastTrackJobType,
  jobTypeRequiresBundle,
  type JobType,
} from "@/lib/api/job-types";
import { NewWorkOrderCustomerSection } from "@/components/workorders/NewWorkOrderCustomerSection";
import { NewWorkOrderDialogs } from "@/components/workorders/NewWorkOrderDialogs";
import { NewWorkOrderServiceSection } from "@/components/workorders/NewWorkOrderServiceSection";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { mergeConcernSelections } from "@/lib/constants/common-concerns";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
import { FORM_PAGE_CLASS } from "@/lib/constants/layout";

const workOrderSchema = z.object({
  customer: z.number().min(1, "Customer is required"),
  vehicle: z.number().min(1, "Vehicle is required"),
  appointment: z.number().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  status: z.enum(["draft", "pending", "in_progress", "completed"]),
  brought_by_type: z.enum(["account_holder", "saved_contact", "third_party"]).default("account_holder"),
  brought_by_contact: z.number().optional(),
  brought_by_name: z.string().optional(),
  brought_by_phone: z.string().optional(),
  brought_by_email: z.string().optional(),
  brought_by_relationship: z.string().optional(),
  customer_concerns: z.string().min(1, "Customer concerns are required"),
  odometer_in: z.number().min(0),
  job_type_code: z.string().min(1, "Job type is required"),
  job_type_codes: z.array(z.string()).optional(),
  service_type: z.number().optional(),
  service_bundle: z.number().optional(),
});

type WorkOrderFormData = z.input<typeof workOrderSchema>;

export default function NewWorkOrderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const customerId = searchParams.get("customer");
  const vehicleId = searchParams.get("vehicle");
  const appointmentId = searchParams.get("appointment");
  const relatedWorkOrderId = searchParams.get("related_work_order");
  const reworkFromUrl = searchParams.get("rework") === "true";
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [showAddCustomerDialog, setShowAddCustomerDialog] = useState(false);
  const [showAddVehicleDialog, setShowAddVehicleDialog] = useState(false);
  const [vehicleFieldErrors, setVehicleFieldErrors] = useState<Record<string, string>>({});
  const [customConcerns, setCustomConcerns] = useState("");

  // Fetch inventory bundles for service types
  const { data: bundlesData } = useQuery({
    queryKey: ["inventory", "bundles", "active"],
    queryFn: () => inventoryApi.listBundles({ is_active: true }),
  });

  const bundles = useMemo(() => {
    if (!bundlesData) return [];
    return Array.isArray(bundlesData) ? bundlesData : (bundlesData as any).results || [];
  }, [bundlesData]);

  const [selectedCustomer, setSelectedCustomer] = useState<number | null>(
    customerId ? parseInt(customerId) : null
  );
  const [selectedCustomerData, setSelectedCustomerData] = useState<{
    id: number;
    full_name?: string;
    company_name?: string;
    email?: string;
    phone?: string;
    customer_type?: string;
    customer_number?: string;
  } | null>(null);
  const [selectedConcerns, setSelectedConcerns] = useState<string[]>([]);
  const [businessUseManualContact, setBusinessUseManualContact] = useState(false);
  const [individualUseThirdParty, setIndividualUseThirdParty] = useState(false);

  // Fetch vehicle if vehicleId is provided in URL
  const { data: vehicleFromUrl } = useQuery({
    queryKey: ["vehicle", vehicleId],
    queryFn: () => vehiclesApi.get(parseInt(vehicleId!)),
    enabled: !!vehicleId,
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

  // Fetch recent work orders when vehicle is selected (will be set after vehicle is selected)
  const [vehicleForRecentWorkOrders, setVehicleForRecentWorkOrders] = useState<number | null>(null);
  const { data: recentWorkOrdersData, isLoading: isLoadingRecentWorkOrders } = useQuery({
    queryKey: ["recentWorkOrders", vehicleForRecentWorkOrders],
    queryFn: () => workordersApi.getRecentWorkOrders(vehicleForRecentWorkOrders!),
    enabled: !!vehicleForRecentWorkOrders,
  });

  const [serverError, setServerError] = useState<string | null>(null);
  const [showActiveWorkOrderDialog, setShowActiveWorkOrderDialog] = useState(false);
  const [activeWorkOrderBranch, setActiveWorkOrderBranch] = useState<string | null>(null);

  // Refs to prevent infinite loops and track initialization
  const isInitialSyncRef = useRef(false);
  const skipCustomerEffectRef = useRef(false);

  // Repeat visit detection
  const [repeatVisitMatches, setRepeatVisitMatches] = useState<Array<{
    work_order_id: number;
    work_order_number: string;
    completed_at: string;
    days_ago: number;
    customer_concerns: string;
    similarity: number;
    technician: string;
    branch_name: string;
  }>>([]);
  const [showRepeatVisitDialog, setShowRepeatVisitDialog] = useState(false);
  const [isWarrantyRework, setIsWarrantyRework] = useState(false);
  const [selectedRelatedWorkOrder, setSelectedRelatedWorkOrder] = useState<number | null>(null);
  const [warrantyReason, setWarrantyReason] = useState<string>("");
  const [recentWorkOrders, setRecentWorkOrders] = useState<Array<{
    id: number;
    work_order_number: string;
    status: string;
    completed_at: string | null;
    customer_concerns: string;
    technician_name: string;
    branch_name: string;
    days_ago: number | null;
  }>>([]);
  const [workOrderSearchQuery, setWorkOrderSearchQuery] = useState<string>("");
  const [showWorkOrderSearch, setShowWorkOrderSearch] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const advancedOptionsRef = useRef<HTMLDivElement | null>(null);
  const [selectedRelatedWorkOrderDetail, setSelectedRelatedWorkOrderDetail] = useState<{
    id: number;
    work_order_number: string;
    status: string;
    completed_at: string | null;
    customer_concerns: string;
    technician_name: string;
    branch_name: string;
    days_ago: number | null;
  } | null>(null);

  useEffect(() => {
    if (reworkFromUrl && relatedWorkOrderId) {
      setIsWarrantyRework(true);
      setSelectedRelatedWorkOrder(parseInt(relatedWorkOrderId));
    }
  }, [reworkFromUrl, relatedWorkOrderId]);

  // Unapproved recommendations state
  const [showUnapprovedRecommendationsDialog, setShowUnapprovedRecommendationsDialog] = useState(false);
  const [acknowledgedUnapproved, setAcknowledgedUnapproved] = useState(false);
  const [hasPromptedUnapproved, setHasPromptedUnapproved] = useState(false);

  // Service progression state
  const [suggestedService, setSuggestedService] = useState<{
    suggested_service_id: number | null;
    suggested_service_name: string | null;
    suggested_bundle_id?: number | null;
    reason: string;
    last_service_id?: number;
    last_service_name?: string | null;
    last_service_date?: string;
    smart_suggestions?: Array<{
        id: number;
        service_type_id: number;
        service_type_name: string;
        is_due: boolean;
        is_due_soon: boolean;
        estimated_due_date: string | null;
        days_until_due: number | null;
    }>;
  } | null>(null);
  const [progressionWarning, setProgressionWarning] = useState<string | null>(null);

  const {
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

      customer: customerId ? parseInt(customerId) : (undefined as any),

      vehicle: vehicleId ? parseInt(vehicleId) : (undefined as any),
      appointment: appointmentId ? parseInt(appointmentId) : undefined,
      odometer_in: 0,
      brought_by_type: "account_holder",
      brought_by_contact: undefined,
      brought_by_name: "",
      brought_by_phone: "",
      brought_by_email: "",
      brought_by_relationship: "",
      customer_concerns: "",
      job_type_code: "general_repairs",
      job_type_codes: ["general_repairs"],
      service_bundle: undefined,
    },
  });

  const customer = watch("customer");
  const vehicle = watch("vehicle");
  const jobTypeCode = watch("job_type_code");
  const jobTypeCodes = watch("job_type_codes") || [jobTypeCode || "general_repairs"];

  const { data: jobTypesData } = useQuery({
    queryKey: ["workorders", "job-types"],
    queryFn: () => jobTypesApi.list({ active_only: true }),
  });

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
  const odometerIn = watch("odometer_in");
  const customerConcerns = watch("customer_concerns");
  const broughtByContact = watch("brought_by_contact");

  const concernsMerged = useMemo(
    () => mergeConcernSelections(selectedConcerns, customConcerns),
    [selectedConcerns, customConcerns]
  );

  useEffect(() => {
    setValue("customer_concerns", concernsMerged, { shouldValidate: false });
  }, [concernsMerged, setValue]);

  const toggleConcern = (concern: string) => {
    setSelectedConcerns((prev) =>
      prev.includes(concern) ? prev.filter((c) => c !== concern) : [...prev, concern]
    );
  };

  const applyProgressionWarning = (bundle: ServiceBundle) => {
    if (!suggestedService) {
      setProgressionWarning(null);
      return;
    }
    if (suggestedService.last_service_id === bundle.service_type) {
      setProgressionWarning(
        `Warning: ${suggestedService.last_service_name} was already performed on ${suggestedService.last_service_date}. It is recommended to perform ${suggestedService.suggested_service_name} now.`
      );
    } else if (suggestedService.suggested_service_id !== bundle.service_type) {
      setProgressionWarning(
        `Note: ${suggestedService.suggested_service_name} is the expected next service based on history.`
      );
    } else {
      setProgressionWarning(null);
    }
  };

  const { data: fetchedCustomer } = useQuery({
    queryKey: ["customer", customer],
    queryFn: () => customersApi.get(customer!),
    enabled: !!customer,
  });

  const { data: customerContacts } = useQuery({
    queryKey: ["customer-contacts", selectedCustomer],
    queryFn: () => customersApi.contacts.list(selectedCustomer!),
    enabled: !!selectedCustomer,
  });

  const createCustomerMutation = useMutation({
    mutationFn: (data: CustomerFormData) => customersApi.create(data),
    onSuccess: (newCustomer) => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["customers-search"] });
      applyCustomerSelection(newCustomer);
      setShowAddCustomerDialog(false);
      toast({ title: "Customer created", description: "Customer has been added and selected." });
    },
    onError: (error: unknown) => {
      toast({ title: "Error", description: getUserFacingError(error, "Failed to create customer"), variant: "destructive" });
    },
  });

  const createVehicleMutation = useMutation({
    mutationFn: (data: VehicleFormData | FormData) => vehiclesApi.create(data as VehicleFormData),
    onSuccess: (newVehicle) => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      queryClient.invalidateQueries({ queryKey: ["vehicles", "customer", selectedCustomer] });
      setValue("vehicle", newVehicle.id);
      if (newVehicle.current_mileage) {
        setValue("odometer_in", newVehicle.current_mileage);
      }
      setShowAddVehicleDialog(false);
      setVehicleFieldErrors({});
      toast({ title: "Vehicle created", description: "Vehicle has been added and selected." });
    },
    onError: (error: unknown) => {
      setVehicleFieldErrors({});
      if (error instanceof AxiosError && error.response?.data) {
        const errorData = error.response.data as Record<string, string | string[]>;
        const extracted: Record<string, string> = {};
        Object.keys(errorData).forEach((field) => {
          if (field !== "non_field_errors" && field !== "detail") {
            const fieldError = Array.isArray(errorData[field])
              ? errorData[field][0]
              : errorData[field];
            if (fieldError) extracted[field] = String(fieldError);
          }
        });
        if (Object.keys(extracted).length > 0) {
          setVehicleFieldErrors(extracted);
          return;
        }
      }
      toast({ title: "Error", description: getUserFacingError(error, "Failed to create vehicle"), variant: "destructive" });
    },
  });

  const applyCustomerSelection = (cust: {
    id: number;
    full_name?: string;
    company_name?: string;
    email?: string;
    phone?: string;
    customer_type?: string;
    customer_number?: string;
  }) => {
    skipCustomerEffectRef.current = true;
    setValue("customer", cust.id);
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
    setBusinessUseManualContact(false);
    setIndividualUseThirdParty(false);
    if (!isInitialSyncRef.current) {
      setValue("vehicle", undefined as any);
      setValue("odometer_in", 0);
    }
  };

  const handleCreateVehicle = async (data: VehicleFormData, imageFile: File | null) => {
    let payload: VehicleFormData | FormData;
    const vehicleData = { ...data, owner: selectedCustomer || data.owner };

    if (imageFile) {
      const formData = new FormData();
      Object.keys(vehicleData).forEach((key) => {
        const value = vehicleData[key as keyof VehicleFormData];
        if (value !== undefined && value !== null) {
          formData.append(key, value.toString());
        }
      });
      formData.append("image", imageFile);
      payload = formData;
    } else {
      payload = vehicleData;
    }

    await createVehicleMutation.mutateAsync(payload);
  };

  // Get selected vehicle details
  const selectedVehicle = vehicle && vehiclesData?.results
    ? vehiclesData.results.find((v) => v.id === vehicle) || null
    : null;
  const isBusinessAccount =
    selectedCustomerData?.customer_type === "business" || selectedCustomerData?.customer_type === "fleet";
  const availableContacts = Array.isArray(customerContacts) ? customerContacts : [];
  const selectedBusinessContact = availableContacts.find((contact) => contact.id === broughtByContact) || null;

  useEffect(() => {
    if (!isBusinessAccount) return;
    if (availableContacts.length > 0) return;
    setBusinessUseManualContact(true);
    setValue("brought_by_type", "third_party");
  }, [availableContacts.length, isBusinessAccount, setValue]);

  useEffect(() => {
    if (fetchedCustomer) {
      setSelectedCustomerData({
        id: fetchedCustomer.id,
        full_name: fetchedCustomer.full_name,
        company_name: fetchedCustomer.company_name,
        email: fetchedCustomer.email,
        phone: fetchedCustomer.phone,
        customer_type: fetchedCustomer.customer_type,
        customer_number: fetchedCustomer.customer_number,
      });
    }
  }, [fetchedCustomer]);

  useEffect(() => {
    const customerType = selectedCustomerData?.customer_type;
    const isBusiness = customerType === "business" || customerType === "fleet";

    setValue("brought_by_contact", undefined as any);
    setValue("brought_by_name", "");
    setValue("brought_by_phone", "");
    setValue("brought_by_email", "");
    setValue("brought_by_relationship", "");

    if (isBusiness) {
      setBusinessUseManualContact(false);
      setIndividualUseThirdParty(false);
      setValue("brought_by_type", "saved_contact");
    } else {
      setBusinessUseManualContact(false);
      setIndividualUseThirdParty(false);
      setValue("brought_by_type", "account_holder");
    }
  }, [selectedCustomerData?.id, selectedCustomerData?.customer_type, setValue]);

  // Update selected customer when form value changes
  useEffect(() => {
    if (skipCustomerEffectRef.current) {
      skipCustomerEffectRef.current = false;
      return;
    }

    if (customer && customer !== selectedCustomer) {
      setSelectedCustomer(customer);
      if (!isInitialSyncRef.current) {
        setValue("vehicle", undefined as any);
        setValue("odometer_in", 0);
      }
    } else if (!customer) {
      setSelectedCustomerData(null);
      setSelectedCustomer(null);
    }
  }, [customer, selectedCustomer, setValue]);

  // Pre-fill odometer from vehicle's current mileage when vehicle is selected
  useEffect(() => {
    if (vehicle && vehiclesData?.results && !odometerIn) {
      const selectedVehicle = vehiclesData.results.find(v => v.id === vehicle);
      if (selectedVehicle?.current_mileage) {
        setValue("odometer_in", selectedVehicle.current_mileage);
      }
    }
  }, [vehicle, vehiclesData, odometerIn, setValue]);

  // 2. Sync from appointment
  useEffect(() => {
    if (appointment && !isInitialSyncRef.current) {
      const apptCustomerId = typeof appointment.customer === 'object' && appointment.customer !== null
        ? appointment.customer.id
        : appointment.customer;
      const apptVehicleId = typeof appointment.vehicle === 'object' && appointment.vehicle !== null
        ? appointment.vehicle.id
        : appointment.vehicle;

      if (apptCustomerId) {
        skipCustomerEffectRef.current = true;
        setValue("customer", apptCustomerId);
        setSelectedCustomer(apptCustomerId);
      }
      if (apptVehicleId) {
        setValue("vehicle", apptVehicleId);
      }
      setValue("appointment", appointment.id);
      isInitialSyncRef.current = true;
    }
  }, [appointment, setValue]);

  // Update vehicle for recent work orders query when vehicle changes
  useEffect(() => {
    if (vehicle) {
      setVehicleForRecentWorkOrders(vehicle);

      // Fetch suggested service for this vehicle
      vehiclesApi.getSuggestedService(vehicle)
        .then(data => {
          if (!data?.suggested_service_id) {
            setSuggestedService(null);
            return;
          }
          setSuggestedService(data as typeof suggestedService);
          // Pre-select suggested bundle when job type requires a service package
          if (bundleRequired && !watch("service_bundle") && data.suggested_bundle_id) {
            setValue("service_bundle", data.suggested_bundle_id);
            setValue("service_type", data.suggested_service_id);
            const bundle = bundles.find((b: ServiceBundle) => b.id === data.suggested_bundle_id);
            if (bundle && (!customConcerns.trim() || customConcerns.startsWith("Perform"))) {
              setSelectedConcerns([]);
              setCustomConcerns(`Perform ${bundle.name}`);
            }
          }
        })
        .catch(() => {
          setSuggestedService(null);
        });
    } else {
      setVehicleForRecentWorkOrders(null);
      setSuggestedService(null);
    }
    // Reset acknowledgment when vehicle changes
    setAcknowledgedUnapproved(false);
    setHasPromptedUnapproved(false);
    setShowUnapprovedRecommendationsDialog(false);
    setProgressionWarning(null);
  }, [vehicle]);

  // Check for unapproved recommendations when vehicle is selected
  const { data: unapprovedRecommendationsData } = useQuery({
    queryKey: ["unapproved-recommendations", vehicle],
    queryFn: () => workordersApi.checkUnapprovedRecommendations(vehicle!),
    enabled: !!vehicle && !isSubmitting,
  });

  useEffect(() => {
    if (!vehicle || acknowledgedUnapproved || hasPromptedUnapproved) {
      return;
    }

    if ((unapprovedRecommendationsData?.count ?? 0) > 0) {
      setShowUnapprovedRecommendationsDialog(true);
      setHasPromptedUnapproved(true);
    }
  }, [
    vehicle,
    acknowledgedUnapproved,
    hasPromptedUnapproved,
    unapprovedRecommendationsData?.count,
  ]);

  useEffect(() => {
    if (recentWorkOrdersData?.results) {
      setRecentWorkOrders(recentWorkOrdersData.results);
    }
  }, [recentWorkOrdersData]);

  // Update selected related work order detail when selection changes
  useEffect(() => {
    if (selectedRelatedWorkOrder) {
      const detail = recentWorkOrders.find(wo => wo.id === selectedRelatedWorkOrder);
      if (detail) {
        setSelectedRelatedWorkOrderDetail(detail);
      } else {
        // If not in recent list, fetch the work order detail
        workordersApi.get(selectedRelatedWorkOrder).then(wo => {
          setSelectedRelatedWorkOrderDetail({
            id: wo.id,
            work_order_number: wo.work_order_number,
            status: wo.status,
            completed_at: wo.completed_at || null,
            customer_concerns: wo.customer_concerns || "",
            technician_name: wo.primary_technician_name || "Not assigned",
            branch_name: typeof wo.branch === "object" ? wo.branch?.name || "Unknown Branch" : "Unknown Branch",
            days_ago: wo.completed_at ? Math.floor((new Date().getTime() - new Date(wo.completed_at).getTime()) / (1000 * 60 * 60 * 24)) : null,
          });
        }).catch(() => {
          setSelectedRelatedWorkOrderDetail(null);
        });
      }
    } else {
      setSelectedRelatedWorkOrderDetail(null);
    }
  }, [selectedRelatedWorkOrder, recentWorkOrders]);

  // 3. Sync from URL Vehicle ID
  useEffect(() => {
    if (vehicleFromUrl && vehicleId && !isInitialSyncRef.current) {
      const ownerId = typeof vehicleFromUrl.owner === 'object' && vehicleFromUrl.owner !== null
        ? vehicleFromUrl.owner.id
        : vehicleFromUrl.owner;

      if (ownerId) {
        skipCustomerEffectRef.current = true;
        setValue("customer", ownerId);
        setSelectedCustomer(ownerId);
      }

      setValue("vehicle", vehicleFromUrl.id);
      if (vehicleFromUrl.current_mileage) {
        setValue("odometer_in", vehicleFromUrl.current_mileage);
      }

      isInitialSyncRef.current = true;
    }
  }, [vehicleFromUrl, vehicleId, setValue]);

  // Check for repeat visits when vehicle and concerns are filled
  useEffect(() => {
    const checkRepeatVisit = async () => {
      if (vehicle && customerConcerns && customerConcerns.trim().length > 10) {
        try {
          const result = await workordersApi.checkRepeatVisit({
            vehicle,
            customer_concerns: customerConcerns,
          });

          if (result.has_repeat && result.matches.length > 0) {
            setRepeatVisitMatches(result.matches);
            setShowRepeatVisitDialog(true);
            // Pre-select the first (most similar) match
            if (result.matches[0]) {
              setSelectedRelatedWorkOrder(result.matches[0].work_order_id);
            }
          } else {
            setRepeatVisitMatches([]);
            setShowRepeatVisitDialog(false);
          }
        } catch (error) {
          // Silently fail - repeat visit check is non-blocking
          console.error("Error checking repeat visit:", error);
        }
      } else {
        setRepeatVisitMatches([]);
        setShowRepeatVisitDialog(false);
      }
    };

    // Debounce the check
    const timeoutId = setTimeout(checkRepeatVisit, 1000);
    return () => clearTimeout(timeoutId);
  }, [vehicle, customerConcerns]);

  const createMutation = useMutation({
    mutationFn: (data: WorkOrderFormData) => workordersApi.create(data),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["workorders"] });
      const isRoutine = isFastTrackJobType(
        (jobTypesData?.results ?? []).find((jt) => jt.code === variables.job_type_code) ?? null
      );
      router.push(
        isRoutine
          ? `/workorders/${data.id}?from=check-in&flow=routine&tab=parts`
          : `/workorders/${data.id}`
      );
    },

    onError: (error: any) => {
      setServerError(null);

      // Extract error data from response
      const errorData = error?.response?.data;

      if (!errorData) {
        setServerError("An unexpected error occurred. Please try again.");
        return;
      }

      // Extract error message from various possible locations
      const errorMessage = getUserFacingError(error, "An error occurred while creating the work order. Please check the form and try again.");

      // Check if this is an active work order error
      if (errorMessage.toLowerCase().includes('active work order')) {
        // Extract branch name from error message
        // Format: "This vehicle has an active work order (WO-123) at Branch Name. A new..."
        const branchMatch = errorMessage.match(/at ([^.]+)\./);
        const branchName = branchMatch ? branchMatch[1].trim() : 'another branch';

        setActiveWorkOrderBranch(branchName);
        setShowActiveWorkOrderDialog(true);
        return;
      }

      // Handle field-level errors
      Object.keys(errorData).forEach((field) => {
        if (field !== 'non_field_errors' && field !== 'detail') {
          const fieldError = Array.isArray(errorData[field])
            ? errorData[field][0]
            : String(errorData[field]);

          setError(field as keyof WorkOrderFormData, {
            type: "server",
            message: fieldError
          });
        }
      });

      // Set general error message
      setServerError(errorMessage);
    },
  });

  const onSubmit: SubmitHandler<WorkOrderFormData> = async (data) => {
    setServerError(null);

    if (bundleRequired && !data.service_bundle) {
      setError("service_bundle", {
        type: "manual",
        message: "Select a service package for this job type",
      });
      return;
    }

    // Check for unapproved recommendations
    if (vehicle && (unapprovedRecommendationsData?.count ?? 0) > 0 && !acknowledgedUnapproved) {
      setShowUnapprovedRecommendationsDialog(true);
      return; // Block submission
    }

    // Ensure odometer_in is always a number (default to 0 if not provided)

    const submitData: any = {
      ...data,
      odometer_in: data.odometer_in ?? 0,
      customer_concerns: data.customer_concerns || "",
      job_type_code: data.job_type_code || (data.job_type_codes?.[0] ?? "general_repairs"),
      job_type_codes: data.job_type_codes?.length
        ? data.job_type_codes
        : [data.job_type_code || "general_repairs"],
    };

    // Add warranty rework fields if applicable
    if (isWarrantyRework && selectedRelatedWorkOrder) {
      submitData.is_warranty_rework = true;
      submitData.related_work_order = selectedRelatedWorkOrder;
      if (warrantyReason.trim()) {
        submitData.warranty_reason = warrantyReason.trim();
      }
    }

    try {
      await createMutation.mutateAsync(submitData);
    } catch {
      // Error is handled by onError callback
    }
  };

  return (
    <div className={`${FORM_PAGE_CLASS} space-y-6 pb-24`}>
      <StaffPageHeader
        title="New Job Card"
        description="Create a work order for a customer visit."
        breadcrumbs={[
          { label: "Work Orders", href: "/workorders" },
          { label: "New" },
        ]}
        actions={
          !appointment ? (
            <Link href="/check-in">
              <Button type="button" variant="outline" size="sm" disabled={isSubmitting}>
                Walk-in Check-in
              </Button>
            </Link>
          ) : undefined
        }
      />

      {appointment && (
        <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-primary">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Creating from appointment <strong>{appointment.appointment_number}</strong>
          </p>
        </div>
      )}

      {serverError && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <p className="text-sm font-medium text-destructive">{serverError}</p>
        </div>
      )}

      <NewWorkOrderDialogs
        showActiveWorkOrderDialog={showActiveWorkOrderDialog}
        onActiveWorkOrderDialogChange={setShowActiveWorkOrderDialog}
        activeWorkOrderBranch={activeWorkOrderBranch}
        showRepeatVisitDialog={showRepeatVisitDialog}
        onRepeatVisitDialogChange={setShowRepeatVisitDialog}
        repeatVisitMatches={repeatVisitMatches}
        selectedRelatedWorkOrderId={selectedRelatedWorkOrder}
        onSelectRelatedWorkOrderId={setSelectedRelatedWorkOrder}
        isWarrantyRework={isWarrantyRework}
        onWarrantyReworkChange={setIsWarrantyRework}
        onRepeatVisitContinueAnyway={() => {
          setShowRepeatVisitDialog(false);
          setIsWarrantyRework(false);
          setSelectedRelatedWorkOrder(null);
        }}
        showUnapprovedRecommendationsDialog={showUnapprovedRecommendationsDialog}
        onUnapprovedRecommendationsDialogChange={setShowUnapprovedRecommendationsDialog}
        unapprovedRecommendationsData={unapprovedRecommendationsData}
        acknowledgedUnapproved={acknowledgedUnapproved}
        onAcknowledgedUnapprovedChange={setAcknowledgedUnapproved}
        onUnapprovedRecommendationsCancel={() => {
          setShowUnapprovedRecommendationsDialog(false);
          setAcknowledgedUnapproved(false);
        }}
        onUnapprovedRecommendationsProceed={() => {
          setShowUnapprovedRecommendationsDialog(false);
        }}
      />

      <form id="new-work-order-form" onSubmit={handleSubmit(onSubmit)}>
        <div className="space-y-4 w-full">
          <NewWorkOrderCustomerSection
            customerId={customer}
            customerError={errors.customer}
            onCustomerSelect={applyCustomerSelection}
            onAddCustomerClick={() => setShowAddCustomerDialog(true)}
            selectedCustomerData={selectedCustomerData}
            selectedCustomerId={selectedCustomer}
            vehicleId={vehicle}
            vehicleError={errors.vehicle}
            onVehicleChange={(vehicleId) => setValue("vehicle", vehicleId)}
            vehicles={vehiclesData?.results ?? []}
            selectedVehicle={selectedVehicle}
            onAddVehicleClick={() => setShowAddVehicleDialog(true)}
            isBusinessAccount={isBusinessAccount}
            businessUseManualContact={businessUseManualContact}
            onBusinessUseManualContactChange={(checked) => {
              setBusinessUseManualContact(checked);
              setValue("brought_by_contact", undefined as any);
              setValue("brought_by_name", "");
              setValue("brought_by_phone", "");
              setValue("brought_by_email", "");
              setValue("brought_by_relationship", "");
              setValue("brought_by_type", checked ? "third_party" : "saved_contact");
            }}
            individualUseThirdParty={individualUseThirdParty}
            onIndividualUseThirdPartyChange={(checked) => {
              setIndividualUseThirdParty(checked);
              setValue("brought_by_type", checked ? "third_party" : "account_holder");
              setValue("brought_by_contact", undefined as any);
              if (!checked) {
                setValue("brought_by_name", "");
                setValue("brought_by_phone", "");
                setValue("brought_by_email", "");
                setValue("brought_by_relationship", "");
              }
            }}
            availableContacts={availableContacts}
            broughtByContactId={broughtByContact}
            onBroughtByContactSelect={(selectedId, contact) => {
              setValue("brought_by_type", "saved_contact");
              setValue("brought_by_contact", selectedId);
              setValue("brought_by_name", contact ? `${contact.first_name} ${contact.last_name}`.trim() : "");
              setValue("brought_by_phone", contact?.phone || "");
              setValue("brought_by_email", contact?.email || "");
              setValue("brought_by_relationship", contact?.job_title || "Business Contact");
            }}
            selectedBusinessContact={selectedBusinessContact}
            broughtByContactError={errors.brought_by_contact}
            broughtByName={watch("brought_by_name") || ""}
            onBroughtByNameChange={(value) => setValue("brought_by_name", value)}
            broughtByNameError={errors.brought_by_name}
            broughtByPhone={watch("brought_by_phone") || ""}
            onBroughtByPhoneChange={(value) => setValue("brought_by_phone", value)}
            broughtByEmail={watch("brought_by_email") || ""}
            onBroughtByEmailChange={(value) => setValue("brought_by_email", value)}
            broughtByRelationship={watch("brought_by_relationship") || ""}
            onBroughtByRelationshipChange={(value) => setValue("brought_by_relationship", value)}
          />

          <NewWorkOrderServiceSection
            idPrefix="new-wo"
            showAdvanced={showAdvanced}
            onToggleAdvanced={() => {
              setShowAdvanced((v) => {
                const next = !v;
                if (next) {
                  requestAnimationFrame(() => {
                    advancedOptionsRef.current?.scrollIntoView({
                      behavior: "smooth",
                      block: "nearest",
                    });
                  });
                }
                return next;
              });
            }}
            advancedOptionsRef={advancedOptionsRef}
            isWarrantyRework={isWarrantyRework}
            onToggleWarrantyRework={() => {
              const newState = !isWarrantyRework;
              setIsWarrantyRework(newState);
              if (!newState) {
                setSelectedRelatedWorkOrder(null);
                setSelectedRelatedWorkOrderDetail(null);
                setWarrantyReason("");
              }
            }}
            vehicleId={vehicle}
            isLoadingRecentWorkOrders={isLoadingRecentWorkOrders}
            recentWorkOrders={recentWorkOrders}
            selectedRelatedWorkOrderId={selectedRelatedWorkOrder}
            onSelectRelatedWorkOrder={(wo) => {
              setSelectedRelatedWorkOrder(wo.id);
              setSelectedRelatedWorkOrderDetail(wo);
              setShowWorkOrderSearch(false);
            }}
            showWorkOrderSearch={showWorkOrderSearch}
            onToggleWorkOrderSearch={() => setShowWorkOrderSearch(!showWorkOrderSearch)}
            workOrderSearchQuery={workOrderSearchQuery}
            onWorkOrderSearchQueryChange={(value) => {
              setWorkOrderSearchQuery(value);
              setShowWorkOrderSearch(value.length > 0);
            }}
            onClearWorkOrderSearch={() => {
              setShowWorkOrderSearch(false);
              setWorkOrderSearchQuery("");
            }}
            warrantyReason={warrantyReason}
            onWarrantyReasonChange={setWarrantyReason}
            repeatVisitMatchCount={repeatVisitMatches.length}
            showRepeatVisitDialog={showRepeatVisitDialog}
            jobTypeCode={jobTypeCode || "general_repairs"}
            jobTypeCodes={jobTypeCodes}
            onJobTypeChange={(code, jobType) => {
              setValue("job_type_code", code, { shouldValidate: true });
              if (!jobTypeRequiresBundle(jobType)) {
                setValue("service_bundle", undefined);
                setValue("service_type", undefined);
                setProgressionWarning(null);
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
                setProgressionWarning(null);
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
              applyProgressionWarning(bundle);
              if (!customConcerns.trim() || customConcerns.startsWith("Perform")) {
                setSelectedConcerns([]);
                setCustomConcerns(`Perform ${bundle.name}`);
              }
            }}
            suggestedService={
              suggestedService?.suggested_service_id
                ? {
                    ...suggestedService,
                    suggested_service_id: suggestedService.suggested_service_id,
                    suggested_service_name: suggestedService.suggested_service_name || "",
                  }
                : null
            }
            progressionWarning={progressionWarning}
            bundleError={errors.service_bundle?.message}
            selectedConcerns={selectedConcerns}
            onToggleConcern={toggleConcern}
            customConcerns={customConcerns}
            onCustomConcernsChange={setCustomConcerns}
            concernsPreview={concernsMerged}
            concernsError={errors.customer_concerns?.message}
            odometer={
              typeof odometerIn === "number" && !Number.isNaN(odometerIn)
                ? String(odometerIn)
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
        </div>
      </form>

      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-end gap-3 border-t border-border bg-background/95 px-1 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <Link href="/workorders">
          <Button type="button" variant="outline" disabled={isSubmitting}>
            Cancel
          </Button>
        </Link>
        <Button
          type="submit"
          form="new-work-order-form"
          className="shadow-workshop"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Creating..." : "Create Job Card"}
        </Button>
      </div>

      {/* Open Recommendation Warning Dialog */}
      {/* Add Customer Dialog */}
      <Dialog open={showAddCustomerDialog} onOpenChange={setShowAddCustomerDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Customer</DialogTitle>
            <DialogDescription>
              Create a customer without leaving this page. They will be selected automatically.
            </DialogDescription>
          </DialogHeader>
          <CustomerForm
            mode="create"
            hidePortalAccess
            isSubmitting={createCustomerMutation.isPending}
            onCancel={() => setShowAddCustomerDialog(false)}
            onSubmit={async (data) => {
              await createCustomerMutation.mutateAsync(data);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Add Vehicle Dialog */}
      <Dialog open={showAddVehicleDialog} onOpenChange={setShowAddVehicleDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Vehicle</DialogTitle>
            <DialogDescription>
              Register a vehicle for the selected customer. It will be selected automatically.
            </DialogDescription>
          </DialogHeader>
          <VehicleForm
            mode="create"
            customerId={selectedCustomer?.toString() ?? null}
            isSubmitting={createVehicleMutation.isPending}
            serverFieldErrors={vehicleFieldErrors}
            onCancel={() => setShowAddVehicleDialog(false)}
            onSubmit={handleCreateVehicle}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
