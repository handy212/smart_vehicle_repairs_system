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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, XCircle, AlertTriangle, CheckCircle, Plus } from "lucide-react";
import { PremiumIcons } from "@/components/ui/icons";
import Link from "next/link";
import { useState, useEffect, useMemo, useRef } from "react";
import { CustomerSelector } from "@/components/customers/CustomerSelector";
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
import { ServiceIntakeFields } from "@/components/workorders/ServiceIntakeFields";
import { getCustomerDisplayName } from "@/lib/utils/customer-display";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { mergeConcernSelections } from "@/lib/constants/common-concerns";

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
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            className="w-fit -ml-2 h-8 text-muted-foreground hover:text-foreground"
          >
            <PremiumIcons.ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <h1 className="text-xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <PremiumIcons.PlusCircle className="w-6 h-6 text-primary shrink-0" />
            <span className="font-semibold text-lg">New Work Order</span>
          </h1>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 sm:pt-7">
          {!appointment && (
            <Link href="/check-in">
              <Button type="button" variant="outline" disabled={isSubmitting}>
                Walk-in Check-in
              </Button>
            </Link>
          )}
          <Link href="/workorders">
            <Button type="button" variant="outline" disabled={isSubmitting}>
              Cancel
            </Button>
          </Link>
          <Button type="submit" form="new-work-order-form" disabled={isSubmitting}>
            {isSubmitting ? "Creating..." : "Create JobCard"}
          </Button>
        </div>
      </div>

      {appointment && (
        <Card className="border-primary/15 bg-primary/5">
          <CardContent className="pt-6">
            <p className="text-sm text-primary">
              Creating work order from appointment: <strong>{appointment.appointment_number}</strong>
            </p>
          </CardContent>
        </Card>
      )}

      {serverError && (
        <Card className="bg-destructive/10 dark:bg-red-900/20 border-destructive/20 dark:border-red-800">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2 text-destructive dark:text-red-400">
              <AlertCircle className="w-5 h-5" />
              <p className="text-sm font-medium">{serverError}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={showActiveWorkOrderDialog} onOpenChange={setShowActiveWorkOrderDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2 text-destructive dark:text-red-400">
              <AlertCircle className="w-5 h-5" />
              <span>Active Work Order Detected</span>
            </DialogTitle>
            <DialogDescription className="pt-4">
              The selected vehicle has an open work order at <strong>{activeWorkOrderBranch || 'another branch'}</strong>.
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

      {/* Repeat Visit Alert Dialog */}
      <Dialog open={showRepeatVisitDialog} onOpenChange={setShowRepeatVisitDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2 text-primary">
              <AlertCircle className="w-5 h-5" />
              <span>Repeat Visit Detected</span>
            </DialogTitle>
            <DialogDescription className="pt-4">
              This vehicle was recently serviced for a similar issue. This may indicate a warranty/rework case.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {repeatVisitMatches.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-semibold text-sm text-foreground">
                  Previous Work Order(s):
                </h4>
                {repeatVisitMatches.map((match) => (
                  <Card key={match.work_order_id} className="border-primary/15">
                    <CardContent className="pt-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-sm">
                              Work Order: <strong>{match.work_order_number}</strong>
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Completed {match.days_ago} day{match.days_ago !== 1 ? 's' : ''} ago
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-medium text-primary">
                              {Math.round(match.similarity * 100)}% similar
                            </p>
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground space-y-1">
                          <p><strong>Branch:</strong> {match.branch_name}</p>
                          <p><strong>Technician:</strong> {match.technician}</p>
                          <p><strong>Previous Concerns:</strong> {match.customer_concerns.substring(0, 150)}{match.customer_concerns.length > 150 ? '...' : ''}</p>
                        </div>
                        <div className="pt-2">
                          <label className="flex items-center space-x-2 cursor-pointer">
                            <input
                              type="radio"
                              name="related_work_order"
                              checked={selectedRelatedWorkOrder === match.work_order_id}
                              onChange={() => setSelectedRelatedWorkOrder(match.work_order_id)}
                              className="w-4 h-4 text-primary"
                            />
                            <span className="text-sm text-card-foreground">
                              Link this work order as related
                            </span>
                          </label>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            <div className="pt-2 border-t border-border">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isWarrantyRework}
                  onChange={(e) => setIsWarrantyRework(e.target.checked)}
                  className="w-4 h-4 text-primary rounded"
                />
                <span className="text-sm font-medium text-foreground">
                  Mark as warranty/rework case
                </span>
              </label>
              <p className="text-xs text-muted-foreground mt-1 ml-6">
                This will flag the work order as a warranty case and link it to the previous work order.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setShowRepeatVisitDialog(false);
                setIsWarrantyRework(false);
                setSelectedRelatedWorkOrder(null);
              }}
            >
              Continue Anyway
            </Button>
            <Button onClick={() => setShowRepeatVisitDialog(false)}>
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <form id="new-work-order-form" onSubmit={handleSubmit(onSubmit)}>
        <div className="space-y-4 w-full">
            {/* Customer & Vehicle */}
            <Card className="border-0 overflow-hidden">
              <CardHeader className="bg-muted/30 border-b border-border/40 pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <PremiumIcons.Users className="w-5 h-5 text-primary/80" />
                  Customer / Business & Vehicle
                </CardTitle>
                <CardDescription>Select the customer or business account and vehicle</CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Grid layout — 1 column on mobile, 2 columns on md+ */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                  {/* Customer */}
                  <div className="space-y-3">
                    <div>
                      <label
                        htmlFor="customer"
                        className="block text-sm font-medium text-card-foreground mb-1"
                      >
                        Customer / Business *
                      </label>

                      <div className="flex gap-2">
                        <div className={`flex-1 min-w-0 ${errors.customer ? "[&_button]:border-destructive" : ""}`}>
                          <CustomerSelector
                            selectedCustomerId={customer}
                            placeholder="Search by company, contact, phone, or customer number..."
                            onSelect={(cust) => applyCustomerSelection(cust)}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="shrink-0 h-11 w-11"
                          title="Add new customer"
                          onClick={() => setShowAddCustomerDialog(true)}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>

                      {errors.customer && (
                        <p className="mt-1 text-sm text-destructive dark:text-red-400">
                          {errors.customer.message}
                        </p>
                      )}
                    </div>

                    {/* Customer Info Display */}
                    {selectedCustomerData && (
                      <div className="text-xs text-muted-foreground mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                        <span className="font-medium text-foreground">
                          {getCustomerDisplayName(selectedCustomerData)}
                        </span>
                        {selectedCustomerData.phone && <span>📞 {selectedCustomerData.phone}</span>}
                        {selectedCustomerData.email && <span className="truncate max-w-[200px]" title={selectedCustomerData.email}>✉️ {selectedCustomerData.email}</span>}
                        {selectedCustomerData.customer_type && <span className="capitalize">🏷️ {selectedCustomerData.customer_type.replace('_', ' ')}</span>}
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

                      <div className="flex gap-2">
                        <div className="flex-1 min-w-0">
                        <Select
                          value={vehicle?.toString() || ""}
                          onValueChange={(val) => setValue("vehicle", parseInt(val))}
                          disabled={!selectedCustomer}
                        >
                          <SelectTrigger id="vehicle" className={`w-full ${errors.vehicle ? "border-destructive" : ""}`}>
                            <SelectValue placeholder={
                              !selectedCustomer
                                ? "Select a customer or business first"
                                : !vehiclesData?.results?.length
                                  ? "No vehicles — add one with +"
                                  : "Select a vehicle"
                            } />
                          </SelectTrigger>
                          <SelectContent>
                            {vehiclesData?.results?.map((v) => (
                              <SelectItem key={v.id} value={v.id.toString()}>
                                {v.make} {v.model} {v.year} — {v.vin}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="shrink-0 h-10 w-10"
                          title="Add new vehicle"
                          disabled={!selectedCustomer}
                          onClick={() => setShowAddVehicleDialog(true)}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>

                      {errors.vehicle && (
                        <p className="mt-1 text-sm text-destructive dark:text-red-400">
                          {errors.vehicle.message}
                        </p>
                      )}
                    </div>

                    {/* Vehicle Info Display */}
                    {selectedVehicle && (
                      <div className="text-xs text-muted-foreground mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                        <span className="font-medium text-foreground">🚗 {selectedVehicle.make} {selectedVehicle.model} {selectedVehicle.year}</span>
                        {selectedVehicle.license_plate && <span>#️⃣ {selectedVehicle.license_plate}</span>}
                        {selectedVehicle.vin && <span>VIN: <span className="font-mono">{selectedVehicle.vin}</span></span>}
                      </div>
                    )}
                  </div>

                </div>

                {selectedCustomerData && (
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Delivered By</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        Record the individual who delivered the vehicle for this work order.
                      </p>
                    </div>

                    {isBusinessAccount ? (
                      <div className="space-y-4">
                        <label className="flex items-start gap-3 rounded-lg border border-border/60 bg-background/60 px-3 py-3">
                          <input
                            type="checkbox"
                            checked={businessUseManualContact}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setBusinessUseManualContact(checked);
                              setValue("brought_by_contact", undefined as any);
                              setValue("brought_by_name", "");
                              setValue("brought_by_phone", "");
                              setValue("brought_by_email", "");
                              setValue("brought_by_relationship", "");
                              setValue("brought_by_type", checked ? "third_party" : "saved_contact");
                            }}
                            className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                          />
                          <div>
                            <p className="text-sm font-medium text-foreground">Not in saved business contacts</p>
                          </div>
                        </label>

                        {!businessUseManualContact ? (
                          <div className="space-y-2">
                            <label className="block text-sm font-medium text-card-foreground">
                              Business contact *
                            </label>
                            <Select
                              value={broughtByContact?.toString() || ""}
                              onValueChange={(val) => {
                                const selectedId = parseInt(val);
                                const contact = availableContacts.find((item) => item.id === selectedId);
                                setValue("brought_by_type", "saved_contact");
                                setValue("brought_by_contact", selectedId);
                                setValue("brought_by_name", contact ? `${contact.first_name} ${contact.last_name}`.trim() : "");
                                setValue("brought_by_phone", contact?.phone || "");
                                setValue("brought_by_email", contact?.email || "");
                                setValue("brought_by_relationship", contact?.job_title || "Business Contact");
                              }}
                            >
                              <SelectTrigger className={errors.brought_by_contact ? "border-destructive" : ""}>
                                <SelectValue placeholder={availableContacts.length ? "Select contact person" : "No saved contacts found"} />
                              </SelectTrigger>
                              <SelectContent>
                                {availableContacts.map((contact) => (
                                  <SelectItem key={contact.id} value={contact.id.toString()}>
                                    {contact.first_name} {contact.last_name}
                                    {contact.job_title ? ` — ${contact.job_title}` : ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {errors.brought_by_contact && (
                              <p className="text-sm text-destructive">{errors.brought_by_contact.message}</p>
                            )}
                            {selectedBusinessContact && (
                              <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                                {selectedBusinessContact.phone && <span>📞 {selectedBusinessContact.phone}</span>}
                                {selectedBusinessContact.email && <span>✉️ {selectedBusinessContact.email}</span>}
                                {selectedBusinessContact.job_title && <span>Role: {selectedBusinessContact.job_title}</span>}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-card-foreground mb-1">
                                Person name *
                              </label>
                              <Input {...register("brought_by_name")} placeholder="Enter full name" />
                              {errors.brought_by_name && <p className="mt-1 text-sm text-destructive">{errors.brought_by_name.message}</p>}
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-card-foreground mb-1">
                                Relationship / role
                              </label>
                              <Input {...register("brought_by_relationship")} placeholder="Driver, staff, representative..." />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-card-foreground mb-1">
                                Phone
                              </label>
                              <Input {...register("brought_by_phone")} placeholder="Phone number" />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-card-foreground mb-1">
                                Email
                              </label>
                              <Input {...register("brought_by_email")} type="email" placeholder="Email address" />
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <label className="flex items-start gap-3 rounded-lg border border-border/60 bg-background/60 px-3 py-3">
                          <input
                            type="checkbox"
                            checked={individualUseThirdParty}
                            onChange={(e) => {
                              const checked = e.target.checked;
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
                            className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                          />
                          <div>
                            <p className="text-sm font-medium text-foreground">Brought by driver or another person</p>
                            <p className="text-xs text-muted-foreground">
                              Turn this on if someone other than the customer/account holder brought the vehicle.
                            </p>
                          </div>
                        </label>

                        {individualUseThirdParty && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-card-foreground mb-1">
                                Person name *
                              </label>
                              <Input {...register("brought_by_name")} placeholder="Enter full name" />
                              {errors.brought_by_name && <p className="mt-1 text-sm text-destructive">{errors.brought_by_name.message}</p>}
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-card-foreground mb-1">
                                Relationship
                              </label>
                              <Input {...register("brought_by_relationship")} placeholder="Driver, spouse, staff, friend..." />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-card-foreground mb-1">
                                Phone
                              </label>
                              <Input {...register("brought_by_phone")} placeholder="Phone number" />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-card-foreground mb-1">
                                Email
                              </label>
                              <Input {...register("brought_by_email")} type="email" placeholder="Email address" />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Service / Request */}
            <Card className="border-0 overflow-hidden">
              <CardHeader className="bg-muted/30 border-b border-border/40 pb-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <PremiumIcons.FileText className="w-5 h-5 text-primary/80" />
                      Service & request
                    </CardTitle>
                    <CardDescription>
                      Job type, package if needed, customer concerns, and intake reading
                    </CardDescription>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs w-fit"
                      onClick={() => {
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
                    >
                      {showAdvanced ? "Hide return / rework options" : "Show return / rework options"}
                    </Button>
                    <p className="max-w-[16rem] text-right text-[11px] text-muted-foreground">
                      Optional: link this job to a previous visit for warranty or rework.
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ServiceIntakeFields
                  idPrefix="new-wo"
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
                  concernsFooter={
                    repeatVisitMatches.length > 0 && !showRepeatVisitDialog ? (
                      <div className="rounded-md border border-primary/15 bg-primary/5 p-3">
                        <p className="text-sm text-primary">
                          <AlertCircle className="mr-1 inline h-4 w-4" />
                          Similar concerns detected from recent work order(s). Check the alert dialog for details.
                        </p>
                      </div>
                    ) : null
                  }
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
              </CardContent>
            </Card>

            {showAdvanced && (
            <div ref={advancedOptionsRef}>
            <Card className={`border overflow-hidden transition-colors ${isWarrantyRework ? "border-primary/30" : "border-border"}`}>
              <div className="border-b border-border/60 px-4 py-2 bg-muted/30">
                <p className="text-xs text-muted-foreground">
                  Return / rework options — turn on below only when this visit is related to a previous job.
                </p>
              </div>
              <button
                type="button"
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${isWarrantyRework ? "bg-primary/5" : "hover:bg-muted/40"}`}
                onClick={() => {
                  const newState = !isWarrantyRework;
                  setIsWarrantyRework(newState);
                  if (!newState) {
                    setSelectedRelatedWorkOrder(null);
                    setSelectedRelatedWorkOrderDetail(null);
                    setWarrantyReason("");
                  }
                }}
              >
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isWarrantyRework ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                  <AlertCircle className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium ${isWarrantyRework ? "text-primary" : "text-foreground"}`}>
                    Return / rework job
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {isWarrantyRework
                      ? "Link this job to a previous work order"
                      : "Optional — for warranty or repeat visits"}
                  </p>
                </div>
                <span
                  className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border transition-colors ${isWarrantyRework ? "border-primary bg-primary" : "border-border bg-muted"}`}
                  aria-hidden
                >
                  <span
                    className={`inline-block h-5 w-5 rounded-full border border-border bg-card shadow-sm transition-transform mt-0.5 ${isWarrantyRework ? "translate-x-5" : "translate-x-0.5"}`}
                  />
                </span>
              </button>

              {isWarrantyRework && (
                <CardContent className="space-y-4 border-t border-border/60 pt-4 pb-4">
                  {!vehicle ? (
                    <p className="text-sm text-muted-foreground rounded-md bg-muted/50 px-3 py-2">
                      Select a vehicle above to see recent jobs.
                    </p>
                  ) : (
                    <>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <label className="text-sm font-medium text-foreground">Previous job</label>
                        {selectedRelatedWorkOrder && (
                          <button
                            type="button"
                            onClick={() => setShowWorkOrderSearch(!showWorkOrderSearch)}
                            className="text-xs font-medium text-primary hover:underline w-fit"
                          >
                            Search by ID
                          </button>
                        )}
                      </div>

                      {isLoadingRecentWorkOrders ? (
                        <div className="flex items-center justify-center gap-2 rounded-lg bg-muted/50 py-6 text-sm text-muted-foreground">
                          <PremiumIcons.Spinner className="h-4 w-4 animate-spin" />
                          Loading history…
                        </div>
                      ) : recentWorkOrders.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-52 overflow-y-auto">
                          {recentWorkOrders.map((wo) => (
                            <button
                              key={wo.id}
                              type="button"
                              onClick={() => {
                                setSelectedRelatedWorkOrder(wo.id);
                                setSelectedRelatedWorkOrderDetail(wo);
                                setShowWorkOrderSearch(false);
                              }}
                              className={`rounded-lg border p-3 text-left transition-all hover:shadow-sm ${selectedRelatedWorkOrder === wo.id
                                ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                                : "border-border bg-card hover:border-primary/30"
                                }`}
                            >
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <span className="font-semibold text-sm text-foreground">{wo.work_order_number}</span>
                                <span className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">
                                  {wo.days_ago !== null ? `${wo.days_ago}d` : "—"}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground line-clamp-2">
                                {wo.customer_concerns || "No description"}
                              </p>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed border-border py-5 text-center">
                          <p className="text-sm text-muted-foreground">No recent jobs for this vehicle.</p>
                          <Button
                            type="button"
                            variant="link"
                            size="sm"
                            className="mt-1 h-auto p-0"
                            onClick={() => setShowWorkOrderSearch(true)}
                          >
                            Search by work order ID
                          </Button>
                        </div>
                      )}

                      {(showWorkOrderSearch || (!recentWorkOrders.length && !isLoadingRecentWorkOrders)) && (
                        <div className="flex gap-2 max-w-md">
                          <Input
                            type="text"
                            placeholder="Work order number…"
                            value={workOrderSearchQuery}
                            onChange={(e) => {
                              setWorkOrderSearchQuery(e.target.value);
                              setShowWorkOrderSearch(e.target.value.length > 0);
                            }}
                          />
                          {showWorkOrderSearch && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="shrink-0"
                              onClick={() => {
                                setShowWorkOrderSearch(false);
                                setWorkOrderSearchQuery("");
                              }}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      )}

                      {selectedRelatedWorkOrder && (
                        <div className="space-y-1.5 max-w-2xl">
                          <label htmlFor="warranty_reason" className="text-sm font-medium text-foreground">
                            Reason for rework <span className="text-destructive">*</span>
                          </label>
                          <Textarea
                            id="warranty_reason"
                            value={warrantyReason}
                            onChange={(e) => setWarrantyReason(e.target.value)}
                            placeholder="e.g. Issue persisted, part failure"
                            rows={2}
                            className={`resize-none ${!warrantyReason.trim() ? "border-primary/50 focus-visible:ring-primary/30" : ""}`}
                          />
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              )}
            </Card>
            </div>
            )}
        </div>
      </form>

      {/* Open Recommendation Warning Dialog */}
      <Dialog open={showUnapprovedRecommendationsDialog} onOpenChange={setShowUnapprovedRecommendationsDialog}>
        <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <AlertTriangle className="w-5 h-5 text-primary" />
              Open Vehicle Recommendations Found
            </DialogTitle>
            <DialogDescription className="text-sm">
              This vehicle has {unapprovedRecommendationsData?.count || 0} pending or deferred recommendation{unapprovedRecommendationsData?.count !== 1 ? 's' : ''} from previous work orders. Please review and acknowledge before proceeding.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {unapprovedRecommendationsData && unapprovedRecommendationsData.count > 0 ? (
              <div className="space-y-4">
                {/* Group recommendations by work order */}
                {Object.entries(

                  unapprovedRecommendationsData.recommendations.reduce((acc: any, rec: any) => {
                    const woId = rec.work_order_id;
                    if (!acc[woId]) {
                      acc[woId] = {
                        work_order_number: rec.work_order_number,
                        work_order_completed_at: rec.work_order_completed_at,
                        recommendations: [],
                      };
                    }
                    acc[woId].recommendations.push(rec);
                    return acc;

                  }, {} as Record<number, any>)

                ).map(([woId, group]: [string, any]) => (
                  <div key={woId} className="border border-border rounded-lg p-4 bg-muted/50">
                    <div className="mb-3 pb-2 border-b border-border">
                      <p className="font-semibold text-sm text-foreground">
                        Work Order: {group.work_order_number}
                      </p>
                      {group.work_order_completed_at && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Completed: {new Date(group.work_order_completed_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <div className="space-y-3">

                      {group.recommendations.map((rec: any) => (
                        <div key={rec.id} className="rounded border-l-4 border-l-primary bg-card p-3">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge
                                variant={
                                  rec.priority === "critical"
                                    ? "danger"
                                    : rec.priority === "necessary"
                                      ? "default"
                                      : "secondary"
                                }
                                className="text-xs capitalize"
                              >
                                {rec.priority_display}
                              </Badge>
                              <Badge variant="outline" className="text-xs capitalize">
                                {rec.recommendation_type_display}
                              </Badge>
                              <Badge variant="outline" className="text-xs capitalize">
                                {rec.approval_status_display}
                              </Badge>
                            </div>
                          </div>
                          <p className="text-sm text-card-foreground mt-2">
                            {rec.description}
                          </p>
                          {Array.isArray(rec.parts_needed) && rec.parts_needed.length > 0 && (
                            <p className="mt-2 text-xs text-muted-foreground">
                              Parts listed: {rec.parts_needed.length}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6">
                <CheckCircle className="w-10 h-10 mx-auto text-success mb-2" />
                <p className="font-medium text-foreground">
                  No Open Recommendations
                </p>
              </div>
            )}
          </div>

          {unapprovedRecommendationsData && unapprovedRecommendationsData.count > 0 && (
            <DialogFooter className="flex-col sm:flex-row gap-3">
              <label className="flex items-center space-x-2 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={acknowledgedUnapproved}
                  onChange={(e) => setAcknowledgedUnapproved(e.target.checked)}
                  className="w-4 h-4 text-primary rounded border-border focus:ring-primary"
                />
                <span className="text-card-foreground">
                  I acknowledge these open vehicle recommendations and wish to proceed
                </span>
              </label>
              <div className="flex gap-2 w-full sm:w-auto">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowUnapprovedRecommendationsDialog(false);
                    setAcknowledgedUnapproved(false);
                  }}
                  className="flex-1 sm:flex-none"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    setShowUnapprovedRecommendationsDialog(false);
                  }}
                  disabled={!acknowledgedUnapproved}
                  className="flex-1 sm:flex-none"
                >
                  Proceed
                </Button>
              </div>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

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
