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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ArrowLeft, AlertCircle, Check, User, XCircle, AlertTriangle, CheckCircle } from "lucide-react";
import { PremiumIcons } from "@/components/ui/icons";
import Link from "next/link";
import { useState, useEffect } from "react";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { AxiosError } from "axios";
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

  // Fetch service types
  const { data: serviceTypesData } = useQuery({
    queryKey: ["serviceTypes"],
    queryFn: () => vehiclesApi.getServiceTypes(),
  });

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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  // Service progression state
  const [suggestedService, setSuggestedService] = useState<{
    suggested_service_id: number;
    suggested_service_name: string;
    reason: string;
    last_service_id?: number;
    last_service_name?: string;
    last_service_date?: string;
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      customer: customerId ? parseInt(customerId) : (undefined as any),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vehicle: vehicleId ? parseInt(vehicleId) : (undefined as any),
    appointment: appointmentId ? parseInt(appointmentId) : undefined,
    odometer_in: 0,
    customer_concerns: "",
    maintenance_type: "general",
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

// Update selected customer when form value changes
useEffect(() => {
  if (customer && customer !== selectedCustomer) {
    setSelectedCustomer(customer);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setValue("vehicle", undefined as any); // Reset vehicle when customer changes
    setValue("odometer_in", 0); // Reset odometer when vehicle changes

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
  } else if (!customer) {
    setSelectedCustomerData(null);
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

// Pre-fill from appointment if available
useEffect(() => {
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
}, [appointment, customer, setValue]);

// Update vehicle for recent work orders query when vehicle changes
useEffect(() => {
  if (vehicle) {
    setVehicleForRecentWorkOrders(vehicle);

    // Fetch suggested service for this vehicle
    vehiclesApi.getSuggestedService(vehicle)
      .then(data => {
        setSuggestedService(data);
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
  setProgressionWarning(null);
}, [vehicle]);

// Check for unapproved recommendations when vehicle is selected
const { data: unapprovedRecommendationsData } = useQuery({
  queryKey: ["unapproved-recommendations", vehicle],
  queryFn: () => workordersApi.checkUnapprovedRecommendations(vehicle!),
  enabled: !!vehicle && !isSubmitting,
});

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

// Auto-fill customer and vehicle when vehicle is provided in URL
useEffect(() => {
  if (vehicleFromUrl && vehicleId) {
    // Extract owner/customer from vehicle
    const ownerId = typeof vehicleFromUrl.owner === 'object' && vehicleFromUrl.owner !== null
      ? vehicleFromUrl.owner.id
      : vehicleFromUrl.owner;

    // Only auto-fill if customer is not already set (from URL params or form)
    if (ownerId && (!customer || customer === 0)) {
      setValue("customer", ownerId);
      setValue("vehicle", vehicleFromUrl.id);
      setSelectedCustomer(ownerId);

      // Set customer data if available
      if (customersData?.results) {
        const customerData = customersData.results.find((c) => c.id === ownerId);
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
    } else if (ownerId && customer && customer !== ownerId) {
      // If customer is already set but doesn't match vehicle owner, still set the vehicle
      // (user might have selected a different customer, but we should still set the vehicle)
      setValue("vehicle", vehicleFromUrl.id);
    }
  }
}, [vehicleFromUrl, vehicleId, customer, setValue, customersData]);

// Initialize customer data from URL params or when customersData loads
useEffect(() => {
  if (customersData?.results && (customerId || customer)) {
    const targetCustomerId = customer || (customerId ? parseInt(customerId) : null);
    if (targetCustomerId) {
      const customerData = customersData.results.find((c) => c.id === targetCustomerId);
      if (customerData && (!selectedCustomerData || selectedCustomerData.id !== customerData.id)) {
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
  }
}, [customerId, customer, customersData, selectedCustomerData]);

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        // Premium Header - Removed manual breadcrumbs
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
      <Card className="bg-primary/10 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800">
        <CardContent className="pt-6">
          <p className="text-sm text-orange-800 text-primary">
            Creating work order from appointment: <strong>{appointment.appointment_number}</strong>
          </p>
        </CardContent>
      </Card>
    )}

    {serverError && (
      <Card className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
        <CardContent className="pt-6">
          <div className="flex items-center space-x-2 text-red-800 dark:text-red-400">
            <AlertCircle className="w-5 h-5" />
            <p className="text-sm font-medium">{serverError}</p>
          </div>
        </CardContent>
      </Card>
    )}

    <Dialog open={showActiveWorkOrderDialog} onOpenChange={setShowActiveWorkOrderDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2 text-red-600 dark:text-red-400">
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

    // Repeat Visit Alert Dialog
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
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              {repeatVisitMatches.map((match, index) => (
                <Card key={match.work_order_id} className="border-orange-200 dark:border-orange-800">
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        // Main Form
        <div className="lg:col-span-2 space-y-6">
          // Customer & Vehicle
          <Card className="border-none shadow-sm bg-card/60 backdrop-blur-md ring-1 ring-gray-900/5">
            <CardHeader className="bg-card/40 bg-muted/40 backdrop-blur-sm border-b border-border/50">
              <CardTitle className="flex items-center gap-2">
                <PremiumIcons.Users className="w-5 h-5 text-muted-foreground" />
                Customer & Vehicle
              </CardTitle>
              <CardDescription>Select customer and vehicle</CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              // Grid layout — 1 column on mobile, 2 columns on md+
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                // Customer
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
                      <SelectTrigger id="customer" className={`w-full ${errors.customer ? "border-red-500" : ""}`}>
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
                      <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                        {errors.customer.message}
                      </p>
                    )}
                  </div>

                  // Customer Info Display
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

                // Vehicle
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
                      <SelectTrigger id="vehicle" className={`w-full ${errors.vehicle ? "border-red-500" : ""}`}>
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
                      <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                        {errors.vehicle.message}
                      </p>
                    )}
                  </div>

                  // Vehicle Info Display
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



          // Work Order Details
          <Card className="border-none shadow-sm bg-card/60 backdrop-blur-md ring-1 ring-gray-900/5">
            <CardHeader className="bg-card/40 bg-muted/40 backdrop-blur-sm border-b border-border/50">
              <CardTitle className="flex items-center gap-2">
                <PremiumIcons.FileText className="w-5 h-5 text-muted-foreground" />
                Work Order Details
              </CardTitle>
              <CardDescription>Priority and description</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                // Maintenance Type
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

                // Service Type (only if routine)
                {watch("maintenance_type") === "routine" && (
                  <div className="col-span-2 md:col-span-1">
                    <div className="flex justify-between items-center mb-1">
                      <label htmlFor="service_type" className="block text-sm font-medium text-card-foreground">
                        Service Type
                      </label>
                      {suggestedService && (
                        <Badge variant="outline" className="text-[10px] bg-info/10 text-blue-700 border-blue-200">
                          Suggested: {suggestedService.suggested_service_name}
                        </Badge>
                      )}
                    </div>
                    <Select
                      value={watch("service_type")?.toString()}
                      onValueChange={(val) => {
                        const serviceTypeId = parseInt(val);
                        setValue("service_type", serviceTypeId);

                        // Check for progression logic
                        if (suggestedService) {
                          if (suggestedService.last_service_id === serviceTypeId) {
                            setProgressionWarning(`Warning: ${suggestedService.last_service_name} was already performed on ${suggestedService.last_service_date}. It is recommended to perform ${suggestedService.suggested_service_name} now.`);
                          } else if (suggestedService.suggested_service_id !== serviceTypeId) {
                            setProgressionWarning(`Note: ${suggestedService.suggested_service_name} is the expected next service based on history.`);
                          } else {
                            setProgressionWarning(null);
                          }
                        }

                        // Auto-fill concerns if empty
                        const type = serviceTypesData?.results?.find(t => t.id === serviceTypeId);
                        if (type && (!watch("customer_concerns") || watch("customer_concerns").startsWith("Perform"))) {
                          setValue("customer_concerns", `Perform ${type.name}`);
                        }
                      }}
                    >
                      <SelectTrigger id="service_type">
                        <SelectValue placeholder="Select service type" />
                      </SelectTrigger>
                      <SelectContent>
                        {serviceTypesData?.results?.filter(type => type.has_bundle).map((type) => (
                          <SelectItem key={type.id} value={type.id.toString()}>
                            {type.name}
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
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
                  <div>
                    <label className="block text-sm font-medium text-card-foreground mb-2">
                      Quick Select Common Concerns
                    </label>
                    <div className="max-h-32 overflow-y-auto border border-border rounded-lg p-2 bg-muted/20">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                        {COMMON_CONCERNS.filter(c => c.value !== "").map((concern) => (
                          <label
                            key={concern.value}
                            className="flex items-center space-x-2 cursor-pointer hover:bg-muted hover:bg-muted p-1.5 rounded"
                          >
                            <input
                              type="checkbox"
                              checked={selectedConcerns.includes(concern.value)}
                              onChange={(e) => {
                                const isChecked = e.target.checked;
                                let updatedConcerns: string[];

                                if (isChecked) {
                                  if (concern.value === "Other (describe below)") {
                                    // Clear other selections when "Other" is selected
                                    updatedConcerns = [concern.value];
                                    setValue("customer_concerns", "");
                                  } else {
                                    // Add to selection, but remove "Other" if it was selected
                                    updatedConcerns = selectedConcerns
                                      .filter(c => c !== "Other (describe below)")
                                      .concat(concern.value);
                                  }
                                } else {
                                  // Remove from selection
                                  updatedConcerns = selectedConcerns.filter(c => c !== concern.value);
                                }

                                setSelectedConcerns(updatedConcerns);

                                // Update textarea with selected concerns (excluding "Other")
                                const concernsToAdd = updatedConcerns.filter(c => c !== "Other (describe below)");
                                if (concernsToAdd.length > 0) {
                                  setValue("customer_concerns", concernsToAdd.join("\n"));
                                } else {
                                  setValue("customer_concerns", "");
                                }
                              }}
                              className="rounded border-border text-primary focus:ring-primary"
                            />
                            <span className="text-sm text-card-foreground">{concern.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
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
                    className={errors.customer_concerns ? "border-red-500" : ""}
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
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.customer_concerns.message}</p>
                  )}
                  {repeatVisitMatches.length > 0 && !showRepeatVisitDialog && (
                    <div className="mt-2 p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-md">
                      <p className="text-sm text-orange-800 dark:text-orange-400">
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

        // Sidebar Actions
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Creating..." : "Create JobCard"}
              </Button>
              <Link href="/workorders">
                <Button type="button" variant="secondary" className="w-full">
                  Cancel
                </Button>
              </Link>
            </CardContent>
          </Card>

          // Return/Rework Section (Compact)
          <Card className={`transition-all duration-200 border-2 ${isWarrantyRework ? 'border-orange-200 dark:border-orange-800 bg-card/60 shadow-sm' : 'border-transparent bg-transparent shadow-none'}`}>
            <CardContent className="p-0">
              // Header / Toggle Area
              <div className={`flex items-center justify-between p-4 rounded-lg cursor-pointer transition-colors ${isWarrantyRework ? 'bg-orange-50/40 dark:bg-orange-900/20' : 'bg-transparent hover:bg-muted hover:bg-muted/50 border border-dashed border-border'}`}
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
                  <div className={`p-2 rounded-full ${isWarrantyRework ? 'bg-orange-100 text-primary dark:bg-orange-900/50 dark:text-orange-400' : 'bg-muted text-muted-foreground bg-muted text-muted-foreground'}`}>
                    <AlertCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className={`font-semibold text-base ${isWarrantyRework ? 'text-orange-900 dark:text-orange-100' : 'text-card-foreground'}`}>
                      Return / Rework Job?
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {isWarrantyRework ? 'Link to previous work order' : 'Click to mark this as a return or rework job'}
                    </p>
                  </div>
                </div>

                <div className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" checked={isWarrantyRework} readOnly />
                  <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-orange-300 dark:peer-focus:ring-orange-800 rounded-full peer bg-muted peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-card after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all border-border peer-checked:bg-primary"></div>
                </div>
              </div>

              {isWarrantyRework && (
                <div className="p-4 space-y-6 animate-in slide-in-from-top-2 duration-200">
                  <Separator className="bg-orange-100 dark:bg-orange-800/30" />

                  // Recent Work Orders List
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
                                ? "border-primary bg-orange-50 dark:bg-orange-900/20 ring-1 ring-primary"
                                : "border-border hover:border-orange-300 bg-card"
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

                  // Manual Search (Conditional)
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

                  // Warranty Reason
                  {selectedRelatedWorkOrder && (
                    <div className="space-y-2 animate-in fade-in duration-300">
                      <label htmlFor="warranty_reason" className="text-sm font-medium text-card-foreground flex items-center justify-between">
                        <span>Reason for Rework <span className="text-red-500">*</span></span>
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
            </CardContent>
          </Card>
        </div>
      </div>
    </form>

    // Unapproved Recommendations Warning Dialog
    <Dialog open={showUnapprovedRecommendationsDialog} onOpenChange={setShowUnapprovedRecommendationsDialog}>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <AlertTriangle className="w-5 h-5 text-primary" />
            Unapproved Recommendations Found
          </DialogTitle>
          <DialogDescription className="text-sm">
            This vehicle has {unapprovedRecommendationsData?.count || 0} unapproved recommendation{unapprovedRecommendationsData?.count !== 1 ? 's' : ''} from previous work orders. Please review and acknowledge before proceeding.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {unapprovedRecommendationsData && unapprovedRecommendationsData.count > 0 ? (
            <div className="space-y-4">
              // Group recommendations by work order
              {Object.entries(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                }, {} as Record<number, any>)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    {group.recommendations.map((rec: any) => (
                      <div key={rec.id} className="border-l-4 border-l-orange-500 bg-card rounded p-3">
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
                          </div>
                          {rec.estimated_total_cost && Number(rec.estimated_total_cost) > 0 && (
                            <span className="text-sm font-bold text-foreground font-mono">
                              ${Number(rec.estimated_total_cost).toFixed(2)}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-card-foreground mt-2">
                          {rec.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6">
              <CheckCircle className="w-10 h-10 mx-auto text-green-500 mb-2" />
              <p className="font-medium text-foreground">
                No Unapproved Recommendations
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
                I acknowledge these unapproved recommendations and wish to proceed
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

