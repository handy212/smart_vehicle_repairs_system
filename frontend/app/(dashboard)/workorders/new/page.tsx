"use client";

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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, User, XCircle, AlertTriangle, CheckCircle, HeartPulse, PlusCircle } from "lucide-react";
import { PremiumIcons } from "@/components/ui/icons";
import Link from "next/link";
import { useState, useEffect, useMemo, useRef } from "react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

const workOrderSchema = z.object({
  customer: z.number().min(1, "Customer is required"),
  vehicle: z.number().min(1, "Vehicle is required"),
  appointment: z.number().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  status: z.enum(["draft", "pending", "in_progress", "completed"]),
  customer_concerns: z.string().min(1, "Customer concerns are required"),
  odometer_in: z.number().min(0),
  maintenance_type: z.enum(["general", "routine"]),
  service_type: z.number().optional(),
  service_bundle: z.number().optional(),
});

type WorkOrderFormData = z.infer<typeof workOrderSchema>;

// Predefined common vehicle concerns
const COMMON_CONCERNS = [
  { value: "", label: "Select a common concern (optional)" },
  { value: "Check engine light is on", label: "Check engine light is on" },
  { value: "Engine makes unusual noise", label: "Engine makes unusual noise" },
  { value: "Engine won't start", label: "Engine won't start" },
  { value: "Vehicle is overheating", label: "Vehicle is overheating" },
  { value: "Brakes are making noise", label: "Brakes are making noise" },
  { value: "Brakes feel spongy or soft", label: "Brakes feel spongy or soft" },
  { value: "Brake pedal vibrates", label: "Brake pedal vibrates" },
  { value: "Transmission slipping", label: "Transmission slipping" },
  { value: "Transmission shifting rough", label: "Transmission shifting rough" },
  { value: "Steering wheel vibration", label: "Steering wheel vibration" },
  { value: "Vehicle pulls to one side", label: "Vehicle pulls to one side" },
  { value: "Squeaking or rattling noise", label: "Squeaking or rattling noise" },
  { value: "Exhaust smoke", label: "Exhaust smoke" },
  { value: "AC not working", label: "AC not working" },
  { value: "Heater not working", label: "Heater not working" },
  { value: "Electrical issues", label: "Electrical issues" },
  { value: "Battery keeps dying", label: "Battery keeps dying" },
  { value: "Headlights not working", label: "Headlights not working" },
  { value: "Windshield wipers not working", label: "Windshield wipers not working" },
  { value: "Oil leak", label: "Oil leak" },
  { value: "Fluid leak (unknown)", label: "Fluid leak (unknown)" },
  { value: "Flat tire", label: "Flat tire" },
  { value: "Tire wear issues", label: "Tire wear issues" },
  { value: "Suspension problems", label: "Suspension problems" },
  { value: "Alignment needed", label: "Alignment needed" },
  { value: "Regular maintenance/service", label: "Regular maintenance/service" },
  { value: "Oil change needed", label: "Oil change needed" },
  { value: "Tire rotation needed", label: "Tire rotation needed" },
  { value: "State inspection due", label: "State inspection due" },
  { value: "Safety inspection needed", label: "Safety inspection needed" },
  { value: "Other (describe below)", label: "Other (describe below)" },
];

export default function NewWorkOrderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const customerId = searchParams.get("customer");
  const vehicleId = searchParams.get("vehicle");
  const appointmentId = searchParams.get("appointment");
  const queryClient = useQueryClient();

  // ... (state vars)

  // Fetch service types (for legacy or fallback)
  const { data: serviceTypesData } = useQuery({
    queryKey: ["serviceTypes"],
    queryFn: () => vehiclesApi.getServiceTypes(),
  });

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
    email?: string;
    phone?: string;
    customer_type?: string;
    customer_number?: string;
  } | null>(null);
  const [selectedConcerns, setSelectedConcerns] = useState<string[]>([]);

  // Fetch customers
  const { data: customersData } = useQuery({
    queryKey: ["customers", "list"],
    queryFn: () => customersApi.list({ page: 1 }),
  });

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

  // Unapproved recommendations state
  const [showUnapprovedRecommendationsDialog, setShowUnapprovedRecommendationsDialog] = useState(false);
  const [acknowledgedUnapproved, setAcknowledgedUnapproved] = useState(false);
  const [hasPromptedUnapproved, setHasPromptedUnapproved] = useState(false);

  // Service progression state
  const [suggestedService, setSuggestedService] = useState<{
    suggested_service_id: number;
    suggested_service_name: string;
    suggested_bundle_id?: number | null;
    reason: string;
    last_service_id?: number;
    last_service_name?: string;
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
      customer_concerns: "",
      maintenance_type: "general",
      service_bundle: undefined,
    },
  });

  const customer = watch("customer");
  const vehicle = watch("vehicle");
  const odometerIn = watch("odometer_in");
  const customerConcerns = watch("customer_concerns");

  // Get selected vehicle details
  const selectedVehicle = vehicle && vehiclesData?.results
    ? vehiclesData.results.find((v) => v.id === vehicle) || null
    : null;

  // 1. CONSOLIDATED: Update selected customer when form value changes
  useEffect(() => {
    if (skipCustomerEffectRef.current) {
      skipCustomerEffectRef.current = false;
      return;
    }

    if (customer && customer !== selectedCustomer) {
      setSelectedCustomer(customer);

      // Find and store selected customer data
      const customerData = customersData?.results?.find((c) => c.id === customer);
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

      // Reset vehicle and odometer ONLY if not in initial sync
      if (isInitialSyncRef.current) {
        setValue("vehicle", undefined as any);
        setValue("odometer_in", 0);
      }
    } else if (!customer) {
      setSelectedCustomerData(null);
      setSelectedCustomer(null);
    }
  }, [customer, selectedCustomer, setValue, customersData]);

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
          setSuggestedService(data);
          // If maintenance type is routine and nothing is selected yet, pre-select suggested bundle
          if (watch("maintenance_type") === "routine" && !watch("service_bundle") && data.suggested_bundle_id) {
            setValue("service_bundle", data.suggested_bundle_id);
            setValue("service_type", data.suggested_service_id);
          }
        })
        .catch(err => {
          console.error("Error fetching suggested service:", err);
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
            branch_name: wo.branch?.name || "Unknown Branch",
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

        // Find and set customer data
        const customerData = customersData?.results?.find(c => c.id === ownerId);
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

      setValue("vehicle", vehicleFromUrl.id);
      if (vehicleFromUrl.current_mileage) {
        setValue("odometer_in", vehicleFromUrl.current_mileage);
      }

      isInitialSyncRef.current = true;
    }
  }, [vehicleFromUrl, vehicleId, setValue, customersData]);

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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["workorders"] });
      router.push(`/workorders/${data.id}`);
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
      let errorMessage = '';

      if (errorData.non_field_errors) {
        errorMessage = Array.isArray(errorData.non_field_errors)
          ? errorData.non_field_errors[0]
          : errorData.non_field_errors;
      } else if (errorData.detail) {
        errorMessage = typeof errorData.detail === 'string'
          ? errorData.detail
          : (Array.isArray(errorData.detail) ? errorData.detail[0] : String(errorData.detail));
      } else if (typeof errorData === 'string') {
        errorMessage = errorData;
      }

      // Check if this is an active work order error
      if (errorMessage && errorMessage.toLowerCase().includes('active work order')) {
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
      if (errorMessage) {
        setServerError(errorMessage);
      } else {
        setServerError("An error occurred while creating the work order. Please check the form and try again.");
      }
    },
  });

  const onSubmit: SubmitHandler<WorkOrderFormData> = async (data) => {
    setServerError(null);

    // Check for unapproved recommendations
    if (vehicle && (unapprovedRecommendationsData?.count ?? 0) > 0 && !acknowledgedUnapproved) {
      setShowUnapprovedRecommendationsDialog(true);
      return; // Block submission
    }

    // Ensure odometer_in is always a number (default to 0 if not provided)

    const submitData: any = {
      ...data,
      odometer_in: data.odometer_in ?? 0,
      customer_concerns: data.customer_concerns || "", // Ensure it's not undefined
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
      <div className="flex items-center justify-between">
        <div>
          {/* Premium Header - Removed manual breadcrumbs */}
          <div className="flex flex-col gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.back()}
              className="w-fit -ml-2 h-8 text-muted-foreground hover:text-foreground text-muted-foreground "
            >
              <PremiumIcons.ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
            <h1 className="text-xl font-bold text-foreground tracking-tight flex items-center gap-2">
              <PremiumIcons.PlusCircle className="w-6 h-6 text-primary" />
              <span className="font-semibold text-lg">New Work Order</span>
            </h1>
          </div>
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

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Main Form */}
          <div className="lg:col-span-2 space-y-4">
            {/* Customer & Vehicle */}
            <Card className="border-0 overflow-hidden">
              <CardHeader className="bg-muted/30 border-b border-border/40 pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <PremiumIcons.Users className="w-5 h-5 text-primary/80" />
                  Customer & Vehicle
                </CardTitle>
                <CardDescription>Select customer and vehicle</CardDescription>
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
                        Customer *
                      </label>

                      <Select
                        value={customer?.toString() || ""}
                        onValueChange={(val) => {
                          const customerId = parseInt(val);
                          setValue("customer", customerId);
                          setSelectedCustomer(customerId);

                          // Update selected customer data
                          const customerData = customersData?.results?.find((c) => c.id === customerId);
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
                        <SelectTrigger id="customer" className={`w-full ${errors.customer ? "border-destructive" : ""}`}>
                          <SelectValue placeholder="Select a customer" />
                        </SelectTrigger>
                        <SelectContent>
                          {customersData?.results?.map((customer) => (
                            <SelectItem key={customer.id} value={customer.id.toString()}>
                              {customer.full_name || `${customer.user?.first_name || ''} ${customer.user?.last_name || ''}`.trim() || 'Unknown'}
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
                      <div className="text-xs text-muted-foreground mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
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

                      <Select
                        value={vehicle?.toString() || ""}
                        onValueChange={(val) => setValue("vehicle", parseInt(val))}
                        disabled={!selectedCustomer || !vehiclesData?.results?.length}
                      >
                        <SelectTrigger id="vehicle" className={`w-full ${errors.vehicle ? "border-destructive" : ""}`}>
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
                              {vehicle.make} {vehicle.model} {vehicle.year} — {vehicle.vin}
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
                      <div className="text-xs text-muted-foreground mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                        <span className="font-medium text-foreground">🚗 {selectedVehicle.make} {selectedVehicle.model} {selectedVehicle.year}</span>
                        {selectedVehicle.license_plate && <span>#️⃣ {selectedVehicle.license_plate}</span>}
                        {selectedVehicle.vin && <span>VIN: <span className="font-mono">{selectedVehicle.vin}</span></span>}
                      </div>
                    )}
                  </div>

                </div>
              </CardContent>
            </Card>

            {/* Smart Preventive Suggestions */}
            {suggestedService?.smart_suggestions && suggestedService.smart_suggestions.length > 0 && (
              <Card className="border-warning/20 bg-warning/10 dark:border-amber-900/50 dark:bg-amber-900/20 shadow-sm animate-in fade-in slide-in-from-top-4">
                <CardHeader className="pb-2">
                  <CardTitle className="text-warning dark:text-amber-300 flex items-center gap-2 text-md">
                    <HeartPulse className="w-5 h-5 animate-pulse" />
                    Smart Preventive Suggestions
                  </CardTitle>
                  <CardDescription className="text-amber-700/80 dark:text-amber-400/80">
                    Based on the vehicle's unique usage history, the following services are due or due very soon.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {suggestedService.smart_suggestions.map((service) => (
                      <li key={service.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-background/50 rounded-md border text-sm gap-2 hover:bg-background transition-colors">
                        <div>
                          <span className="font-semibold text-foreground flex items-center gap-2">
                            {service.service_type_name}
                            {service.is_due ? (
                              <Badge variant="danger" className="text-[10px] h-4 px-1 py-0 shadow-sm leading-none">OVERDUE</Badge>
                            ) : service.is_due_soon ? (
                              <Badge variant="warning" className="text-[10px] h-4 px-1 py-0 shadow-sm leading-none bg-warning/100 text-amber-950">DUE SOON</Badge>
                            ) : null}
                          </span>
                          <span className="text-muted-foreground font-mono text-xs mt-1 block">
                            {service.estimated_due_date ? `Estimated Due: ${format(new Date(service.estimated_due_date), "MMM d, yyyy")}` : `Due in ${service.days_until_due} days`}
                          </span>
                        </div>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          type="button" 
                          className="shrink-0 bg-background"
                          onClick={() => {
                            const currentConcerns = watch("customer_concerns");
                            const newConcern = `Perform ${service.service_type_name}`;
                            if (!currentConcerns.includes(newConcern)) {
                              setValue("customer_concerns", currentConcerns ? `${currentConcerns}\n${newConcern}` : newConcern);
                            }
                          }}
                        >
                          <PlusCircle className="w-4 h-4 mr-1" />
                          Add to Request
                        </Button>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Work Order Details */}
            <Card className="border-0 overflow-hidden">
              <CardHeader className="bg-muted/30 border-b border-border/40 pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <PremiumIcons.FileText className="w-5 h-5 text-primary/80" />
                  Work Order Details
                </CardTitle>
                <CardDescription>Priority and description for this job</CardDescription>
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
                      <div className="flex justify-between items-center mb-1">
                        <label htmlFor="service_type" className="block text-sm font-medium text-card-foreground">
                          Service Type
                        </label>
                        {suggestedService && (
                          <Badge variant="outline" className="text-[10px] bg-info/10 text-blue-700 border-info/20">
                            Suggested: {suggestedService.suggested_service_name}
                          </Badge>
                        )}
                      </div>
                      <Select
                        value={watch("service_bundle")?.toString()}
                        onValueChange={(val) => {
                          const bundleId = parseInt(val);
                          setValue("service_bundle", bundleId);

                          // Find selected bundle and set service_type
                          const bundle = bundles.find((b: ServiceBundle) => b.id === bundleId);
                          if (bundle && bundle.service_type) {
                            setValue("service_type", bundle.service_type);

                            // Check for progression logic
                            if (suggestedService) {
                              if (suggestedService.last_service_id === bundle.service_type) {
                                setProgressionWarning(`Warning: ${suggestedService.last_service_name} was already performed on ${suggestedService.last_service_date}. It is recommended to perform ${suggestedService.suggested_service_name} now.`);
                              } else if (suggestedService.suggested_service_id !== bundle.service_type) {
                                setProgressionWarning(`Note: ${suggestedService.suggested_service_name} is the expected next service based on history.`);
                              } else {
                                setProgressionWarning(null);
                              }
                            }

                            // Auto-fill concerns if empty - use bundle name
                            if (!watch("customer_concerns") || watch("customer_concerns").startsWith("Perform")) {
                              setValue("customer_concerns", `Perform ${bundle.name}`);
                            }
                          }
                        }}
                      >
                        <SelectTrigger id="service_type">
                          <SelectValue placeholder="Select service bundle" />
                        </SelectTrigger>
                        <SelectContent>
                          {bundles.map((bundle: ServiceBundle) => (
                            <SelectItem key={bundle.id} value={bundle.id.toString()}>
                              {bundle.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {progressionWarning && (
                        <p className="mt-1 text-xs font-medium text-primary flex items-center animate-in fade-in slide-in-from-top-1">
                          <AlertTriangle className="mr-1 h-3 w-3" />
                          {progressionWarning}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="priority" className="block text-sm font-medium text-card-foreground mb-1">
                      Priority
                    </label>
                    <Select
                      defaultValue="normal"

                      onValueChange={(val) => setValue("priority", val as any)}
                    >
                      <SelectTrigger id="priority">
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
                  {watch("maintenance_type") !== "routine" && (
                    <div className="flex items-end">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" type="button" className="text-xs h-9 w-full justify-start text-muted-foreground">
                            + Quick Select Common Concerns
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80 p-0" align="start">
                          <div className="max-h-60 overflow-y-auto p-2">
                            <div className="flex flex-col gap-1">
                              {COMMON_CONCERNS.filter(c => c.value !== "").map((concern) => (
                                <label
                                  key={concern.value}
                                  className="flex items-center space-x-2 cursor-pointer hover:bg-muted p-1.5 rounded"
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedConcerns.includes(concern.value)}
                                    onChange={(e) => {
                                      const isChecked = e.target.checked;
                                      let updatedConcerns: string[];

                                      if (isChecked) {
                                        if (concern.value === "Other (describe below)") {
                                          updatedConcerns = [concern.value];
                                          setValue("customer_concerns", "");
                                        } else {
                                          updatedConcerns = selectedConcerns
                                            .filter(c => c !== "Other (describe below)")
                                            .concat(concern.value);
                                        }
                                      } else {
                                        updatedConcerns = selectedConcerns.filter(c => c !== concern.value);
                                      }

                                      setSelectedConcerns(updatedConcerns);

                                      const concernsToAdd = updatedConcerns.filter(c => c !== "Other (describe below)");
                                      if (concernsToAdd.length > 0) {
                                        setValue("customer_concerns", concernsToAdd.join("\n"));
                                      } else {
                                        setValue("customer_concerns", "");
                                      }
                                    }}
                                    className="rounded border-border text-primary focus:ring-primary"
                                  />
                                  <span className="text-xs text-card-foreground">{concern.label}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  )}
                </div>

                <div className="space-y-3">

                  <div>
                    <label htmlFor="customer_concerns" className="block text-sm font-medium text-card-foreground mb-1">
                      Customer Concerns / Description *
                    </label>
                    <Textarea
                      id="customer_concerns"
                      {...register("customer_concerns")}
                      rows={6}
                      placeholder="Describe the issue or service needed... (You can select multiple common concerns above or type your own)"
                      className={errors.customer_concerns ? "border-destructive" : ""}
                      onChange={(e) => {
                        // Update the textarea value
                        setValue("customer_concerns", e.target.value);
                        // If user types manually, clear "Other" selection if it was selected
                        if (selectedConcerns.includes("Other (describe below)") && e.target.value.trim() !== "") {
                          setSelectedConcerns(prev => prev.filter(c => c !== "Other (describe below)"));
                        }
                      }}
                    />
                    {errors.customer_concerns && (
                      <p className="mt-1 text-sm text-destructive dark:text-red-400">{errors.customer_concerns.message}</p>
                    )}
                    {repeatVisitMatches.length > 0 && !showRepeatVisitDialog && (
                      <div className="mt-2 rounded-md border border-primary/15 bg-primary/5 p-3">
                        <p className="text-sm text-primary">
                          <AlertCircle className="w-4 h-4 inline mr-1" />
                          Similar concerns detected from recent work order(s). Check the alert dialog for details.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar Actions */}
          <div className="space-y-6">
            <div className="sticky top-6 space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm transition-colors duration-200">
              <h3 className="font-semibold text-xs tracking-wide uppercase text-muted-foreground">Actions</h3>
              <div className="space-y-3">
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? "Creating..." : "Create JobCard"}
                </Button>
                <Link href="/workorders" className="block w-full">
                  <Button type="button" variant="secondary" className="w-full">
                    Cancel
                  </Button>
                </Link>
              </div>
            </div>

            {/* Return/Rework Section (Compact) */}
            <div className={`overflow-hidden rounded-2xl border bg-card transition-colors duration-200 ${isWarrantyRework ? 'border-primary/30 shadow-sm' : 'border-border hover:border-border/80 hover:shadow-sm'}`}>
              <div className="p-0">
                {/* Header / Toggle Area */}
                <div className={`flex items-center justify-between p-3 cursor-pointer transition-colors ${isWarrantyRework ? 'bg-primary/5' : 'bg-transparent hover:bg-muted/50'}`}
                  onClick={() => {
                    const newState = !isWarrantyRework;
                    setIsWarrantyRework(newState);
                    if (!newState) {
                      setSelectedRelatedWorkOrder(null);
                      setSelectedRelatedWorkOrderDetail(null);
                      setWarrantyReason("");
                    }
                  }}>
                  <div className="flex items-center gap-3">
                    <div className={`rounded-full p-2 ${isWarrantyRework ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                      <AlertCircle className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className={`text-base font-semibold ${isWarrantyRework ? 'text-primary' : 'text-card-foreground'}`}>
                        Return / Rework Job?
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {isWarrantyRework ? 'Link to previous work order' : 'Click to mark this as a return or rework job'}
                      </p>
                    </div>
                  </div>

                  <div className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={isWarrantyRework} readOnly />
                    <div className="w-11 h-6 rounded-full border border-border bg-muted peer bg-muted peer-checked:bg-primary peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 peer-checked:after:translate-x-full peer-checked:after:border-white after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-border after:bg-card after:content-[''] after:transition-all"></div>
                  </div>
                </div>

                {isWarrantyRework && (
                  <div className="p-4 space-y-6 animate-in slide-in-from-top-2 duration-200">
                    <Separator className="bg-primary/15" />

                    {/* Recent Work Orders List */}
                    {vehicle && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium text-card-foreground">
                            Select Previous Job
                          </label>
                          {selectedRelatedWorkOrder && (
                            <button type="button" onClick={() => setShowWorkOrderSearch(!showWorkOrderSearch)} className="text-xs text-primary hover:text-primary font-medium">
                              Search manually
                            </button>
                          )}
                        </div>

                        {isLoadingRecentWorkOrders ? (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground p-4 justify-center bg-muted rounded-lg">
                            <PremiumIcons.Spinner className="w-4 h-4 animate-spin" />
                            Loading history...
                          </div>
                        ) : recentWorkOrders.length > 0 ? (
                          <div className="grid grid-cols-1 gap-3 max-h-60 overflow-y-auto pr-1">
                            {recentWorkOrders.map((wo) => (
                              <div
                                key={wo.id}
                                onClick={() => {
                                  setSelectedRelatedWorkOrder(wo.id);
                                  setSelectedRelatedWorkOrderDetail(wo);
                                  setShowWorkOrderSearch(false);
                                }}
                                className={`p-3 rounded-lg border text-left cursor-pointer transition-all hover:shadow-md ${selectedRelatedWorkOrder === wo.id
                                  ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                                  : "border-border bg-card hover:border-primary/20"
                                  }`}
                              >
                                <div className="flex justify-between items-start mb-1">
                                  <span className="font-bold text-sm text-foreground">{wo.work_order_number}</span>
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium uppercase tracking-wide">
                                    {wo.days_ago !== null ? `${wo.days_ago} DAYS AGO` : 'N/A'}
                                  </span>
                                </div>
                                <p className="text-xs text-muted-foreground line-clamp-2 mb-2 min-h-[2.5em]">
                                  {wo.customer_concerns || "No description provided"}
                                </p>
                                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                  <User className="w-3 h-3" /> {wo.technician_name.split(' ')[0]}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-6 bg-muted/20 rounded-lg border border-dashed border-border">
                            <p className="text-sm text-muted-foreground mt-1">No recent history found.</p>
                            <Button type="button" variant="link" size="sm" onClick={() => setShowWorkOrderSearch(true)} className="text-primary">
                              Search by ID instead
                            </Button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Manual Search (Conditional) */}
                    {(showWorkOrderSearch || (!recentWorkOrders.length && !isLoadingRecentWorkOrders)) && (
                      <div className="space-y-2 bg-muted p-3 rounded-lg border border-border">
                        <label className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">
                          Search by ID
                        </label>
                        <div className="relative">
                          <Input
                            type="text"
                            placeholder="HQ-WO..."
                            value={workOrderSearchQuery}
                            onChange={(e) => {
                              setWorkOrderSearchQuery(e.target.value);
                              setShowWorkOrderSearch(e.target.value.length > 0);
                            }}
                            className="bg-card"
                          />
                          <Button size="sm" variant="ghost" className="absolute right-1 top-1 h-7 w-7 p-0" onClick={() => setShowWorkOrderSearch(false)}>
                            <XCircle className="w-4 h-4 text-muted-foreground" />
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Warranty Reason */}
                    {selectedRelatedWorkOrder && (
                      <div className="space-y-2 animate-in fade-in duration-300">
                        <label htmlFor="warranty_reason" className="text-sm font-medium text-card-foreground flex items-center justify-between">
                          <span>Reason for Rework <span className="text-destructive">*</span></span>
                        </label>
                        <Textarea
                          id="warranty_reason"
                          value={warrantyReason}
                          onChange={(e) => setWarrantyReason(e.target.value)}
                          placeholder="Why is the vehicle returning? (e.g., Issue persisted, Part failure)"
                          rows={2}
                          className={`resize-none ${selectedRelatedWorkOrder && !warrantyReason.trim() ? "border-primary focus-visible:ring-primary" : ""}`}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
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
    </div>
  );
}
