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
import { useState, useEffect } from "react";
import { AxiosError } from "axios";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const workOrderSchema = z.object({
  customer: z.number().min(1, "Customer is required"),
  vehicle: z.number().min(1, "Vehicle is required"),
  appointment: z.number().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  status: z.enum(["draft", "pending", "in_progress", "completed"]),
  customer_concerns: z.string().min(1, "Customer concerns are required"),
  odometer_in: z.number().min(0),
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
      odometer_in: 0,
      customer_concerns: "",
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workorders"] });
      router.push("/workorders");
    },
    onError: (error: any) => {
      console.log(">>> onError handler called");
      console.log(">>> Error object:", error);
      console.log(">>> Error response data:", error?.response?.data);
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

  const onSubmit = async (data: WorkOrderFormData) => {
    setServerError(null);
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
    }
    
    try {
      await createMutation.mutateAsync(submitData);
    } catch (error: any) {
      // Error is handled by onError callback, but we can add fallback here
      console.log(">>> onSubmit catch block");
      console.log(">>> Caught error:", error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Link href="/workorders">
          <Buttonvariant="secondary">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">New JobCard</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Create a New JobCard</p>
        </div>
      </div>

      {appointment && (
        <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <CardContent className="pt-6">
            <p className="text-sm text-blue-800 dark:text-blue-400">
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

      {/* Repeat Visit Alert Dialog */}
      <Dialog open={showRepeatVisitDialog} onOpenChange={setShowRepeatVisitDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2 text-orange-600 dark:text-orange-400">
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
                <h4 className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                  Previous Work Order(s):
                </h4>
                {repeatVisitMatches.map((match, index) => (
                  <Card key={match.work_order_id} className="border-orange-200 dark:border-orange-800">
                    <CardContent className="pt-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-sm">
                              Work Order: <strong>{match.work_order_number}</strong>
                            </p>
                            <p className="text-xs text-gray-600 dark:text-gray-400">
                              Completed {match.days_ago} day{match.days_ago !== 1 ? 's' : ''} ago
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-medium text-orange-600 dark:text-orange-400">
                              {Math.round(match.similarity * 100)}% similar
                            </p>
                          </div>
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
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
                              className="w-4 h-4 text-orange-600"
                            />
                            <span className="text-sm text-gray-700 dark:text-gray-300">
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
            
            <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isWarrantyRework}
                  onChange={(e) => setIsWarrantyRework(e.target.checked)}
                  className="w-4 h-4 text-orange-600 rounded"
                />
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Mark as warranty/rework case
                </span>
              </label>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 ml-6">
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
          {/* Main Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Customer & Vehicle */}
            <Card>
              <CardHeader>
                <CardTitle>Customer & Vehicle</CardTitle>
                <CardDescription>Select customer and vehicle</CardDescription>
              </CardHeader>

  <CardContent className="space-y-6">
    {/* Grid layout — 1 column on mobile, 2 columns on md+ */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      
      {/* Customer */}
      <div className="space-y-3">
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
              
              // Update selected customer data
              const customerData = customersData?.results?.find((c) => c.id === val);
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
            <option value="">Select a customer</option>
            {customersData?.results?.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.full_name || `${customer.user?.first_name || ''} ${customer.user?.last_name || ''}`.trim() || 'Unknown'}
              </option>
            ))}
          </Select>

          {errors.customer && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">
              {errors.customer.message}
            </p>
          )}
        </div>

        {/* Customer Info Display */}
        {selectedCustomerData && (
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 space-y-2">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              Customer Information
            </div>
            <div className="space-y-2 text-sm">
              {selectedCustomerData.phone && (
                <div className="flex items-start">
                  <span className="font-medium text-gray-700 dark:text-gray-300 w-20 flex-shrink-0">Phone:</span>
                  <span className="text-gray-900 dark:text-gray-100">{selectedCustomerData.phone}</span>
                </div>
              )}
              {selectedCustomerData.email && (
                <div className="flex items-start">
                  <span className="font-medium text-gray-700 dark:text-gray-300 w-20 flex-shrink-0">Email:</span>
                  <span className="text-gray-900 dark:text-gray-100 break-words">{selectedCustomerData.email}</span>
                </div>
              )}
              {selectedCustomerData.customer_type && (
                <div className="flex items-start">
                  <span className="font-medium text-gray-700 dark:text-gray-300 w-20 flex-shrink-0">Type:</span>
                  <span className="text-gray-900 dark:text-gray-100 capitalize">
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

        {/* Vehicle Info Display */}
        {selectedVehicle && (
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 space-y-2">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              Vehicle Information
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-start">
                <span className="font-medium text-gray-700 dark:text-gray-300 w-24 flex-shrink-0">Make/Model:</span>
                <span className="text-gray-900 dark:text-gray-100">
                  {selectedVehicle.make} {selectedVehicle.model} {selectedVehicle.year}
                </span>
              </div>
              {selectedVehicle.license_plate && (
                <div className="flex items-start">
                  <span className="font-medium text-gray-700 dark:text-gray-300 w-24 flex-shrink-0">License:</span>
                  <span className="text-gray-900 dark:text-gray-100">{selectedVehicle.license_plate}</span>
                </div>
              )}
              {selectedVehicle.vin && (
                <div className="flex items-start">
                  <span className="font-medium text-gray-700 dark:text-gray-300 w-24 flex-shrink-0">VIN:</span>
                  <span className="text-gray-900 dark:text-gray-100 font-mono text-xs break-all">{selectedVehicle.vin}</span>
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
                <CardDescription>Priority and description</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="priority" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                    <label htmlFor="common_concern" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Quick Select Common Concern
                    </label>
                    <Select
                      id="common_concern"
                      onChange={(e) => {
                        const selectedValue = e.target.value;
                        if (selectedValue) {
                          if (selectedValue === "Other (describe below)") {
                            // Clear the textarea to let user describe their own concern
                            setValue("customer_concerns", "");
                          } else {
                            // Set the selected concern in the textarea
                            setValue("customer_concerns", selectedValue);
                          }
                          // Reset the dropdown to show placeholder
                          e.target.value = "";
                        }
                      }}
                      className="w-full"
                    >
                      {COMMON_CONCERNS.map((concern) => (
                        <option key={concern.value || "empty"} value={concern.value}>
                          {concern.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>

                <div className="space-y-3">

                  <div>
                    <label htmlFor="customer_concerns" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Customer Concerns / Description *
                    </label>
                    <Textarea
                      id="customer_concerns"
                      {...register("customer_concerns")}
                      rows={6}
                      placeholder="Describe the issue or service needed... (You can select a common concern above or type your own)"
                      className={errors.customer_concerns ? "border-red-500" : ""}
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

          {/* Sidebar Actions */}
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

