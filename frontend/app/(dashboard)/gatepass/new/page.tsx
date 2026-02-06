"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { gatepassApi } from "@/lib/api/gatepass";
import { workordersApi } from "@/lib/api/workorders";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { AxiosError } from "axios";
import { useToast } from "@/lib/hooks/useToast";

const gatePassSchema = z.object({
  work_order: z.number().min(1, "Work order is required"),
  picked_up_by_customer: z.boolean(),
  pickup_person_name: z.string().optional(),
  pickup_person_relationship: z.string().optional(),
  pickup_person_id_type: z.string().optional(),
  pickup_person_id_number: z.string().optional(),
  pickup_person_phone: z.string().optional(),
  pickup_notes: z.string().optional(),
}).refine((data) => {
  if (!data.picked_up_by_customer && !data.pickup_person_name) {
    return false;
  }
  return true;
}, {
  message: "Pickup person name is required when customer is not picking up",
  path: ["pickup_person_name"],
});

type GatePassFormData = z.infer<typeof gatePassSchema>;

export default function NewGatePassPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const workOrderId = searchParams.get("work_order");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [selectedWorkOrder, setSelectedWorkOrder] = useState<number | null>(
    workOrderId ? parseInt(workOrderId) : null
  );
  const [workOrderData, setWorkOrderData] = useState<any>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    watch,
    setValue,
  } = useForm<GatePassFormData>({
    resolver: zodResolver(gatePassSchema),
    defaultValues: {
      work_order: workOrderId ? parseInt(workOrderId) : undefined,
      picked_up_by_customer: true,
      pickup_person_name: "",
      pickup_person_relationship: "",
      pickup_person_id_type: "",
      pickup_person_id_number: "",
      pickup_person_phone: "",
      pickup_notes: "",
    },
  });

  // Fetch closed work orders
  const { data: workOrdersData } = useQuery({
    queryKey: ["workorders", "closed"],
    queryFn: () => workordersApi.list({ status: "closed", page: 1 }),
  });

  // Fetch selected work order details (from state or URL param)
  const workOrderToFetch = selectedWorkOrder || (workOrderId ? parseInt(workOrderId) : null);
  const { data: selectedWorkOrderData } = useQuery({
    queryKey: ["workorder", workOrderToFetch],
    queryFn: () => workordersApi.get(workOrderToFetch!),
    enabled: !!workOrderToFetch,
  });

  useEffect(() => {
    if (selectedWorkOrderData) {
      setWorkOrderData(selectedWorkOrderData);
      // Auto-populate form with work order data
      setValue("work_order", selectedWorkOrderData.id);
      // Also update selectedWorkOrder state if it was from URL
      if (!selectedWorkOrder && selectedWorkOrderData.id) {
        setSelectedWorkOrder(selectedWorkOrderData.id);
      }
    }
  }, [selectedWorkOrderData, setValue, selectedWorkOrder]);

  // Helper function to get customer name from work order data
  const getCustomerName = (workOrder: any): string => {
    if (!workOrder) return "N/A";
    // Check if customer_name exists (from list serializer)
    if (workOrder.customer_name) return workOrder.customer_name;
    // Check if customer is an object with full_name (from detail serializer)
    if (typeof workOrder.customer === 'object' && workOrder.customer) {
      if (workOrder.customer.full_name) return workOrder.customer.full_name;
      if (workOrder.customer.user) {
        const user = workOrder.customer.user;
        if (user.first_name || user.last_name) {
          return `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email || "N/A";
        }
        if (user.email) return user.email;
      }
    }
    return "N/A";
  };

  // Helper function to get vehicle info from work order data
  const getVehicleInfo = (workOrder: any): string => {
    if (!workOrder) return "N/A";
    // Check if vehicle_info exists (from list serializer)
    if (workOrder.vehicle_info) return workOrder.vehicle_info;
    // Check if vehicle is an object (from detail serializer)
    if (typeof workOrder.vehicle === 'object' && workOrder.vehicle) {
      const vehicle = workOrder.vehicle;
      const parts = [];
      if (vehicle.year) parts.push(vehicle.year);
      if (vehicle.make) parts.push(vehicle.make);
      if (vehicle.model) parts.push(vehicle.model);
      if (vehicle.license_plate) parts.push(`- ${vehicle.license_plate}`);
      return parts.length > 0 ? parts.join(' ') : "N/A";
    }
    return "N/A";
  };

  const pickedUpByCustomer = watch("picked_up_by_customer");
  const workOrder = watch("work_order");

  const createMutation = useMutation({
    mutationFn: (data: GatePassFormData) => gatepassApi.create(data),
    onSuccess: (gatePass) => {
      queryClient.invalidateQueries({ queryKey: ["gatepasses"] });
      queryClient.invalidateQueries({ queryKey: ["workorder", workOrder] });
      toast({
        title: "Success",
        description: `Gate pass ${gatePass.gate_pass_number} created successfully`,
      });
      router.push(`/gatepass/${gatePass.id}`);
    },
    onError: (error) => {
      console.error("Error creating gate pass:", error);
      if (error instanceof AxiosError && error.response?.data) {
        const errorData = error.response.data;
        console.error("Error response data:", errorData);
        
        // Handle field-level errors
        const fieldErrors: string[] = [];
        Object.keys(errorData).forEach((field) => {
          if (field !== 'non_field_errors' && field !== 'detail') {
            const fieldError = Array.isArray(errorData[field])
              ? errorData[field][0]
              : errorData[field];
            fieldErrors.push(`${field}: ${fieldError}`);
          }
        });
        
        if (fieldErrors.length > 0) {
          setServerError(fieldErrors.join(', '));
        } else if (errorData.detail) {
          setServerError(typeof errorData.detail === 'string' ? errorData.detail : JSON.stringify(errorData.detail));
        } else if (errorData.non_field_errors) {
          setServerError(Array.isArray(errorData.non_field_errors) ? errorData.non_field_errors[0] : errorData.non_field_errors);
        } else {
          setServerError("An error occurred. Please check the form details.");
        }
      } else {
        setServerError("An unexpected error occurred. Please try again.");
      }
    },
  });

  const onSubmit = async (data: GatePassFormData) => {
    setServerError(null);
    // Ensure customer, vehicle, and branch are included from work order
    const submitData: any = {
      ...data,
    };
    
    if (workOrderData) {
      // Include customer and vehicle from work order
      submitData.customer = typeof workOrderData.customer === 'object' ? workOrderData.customer.id : workOrderData.customer;
      submitData.vehicle = typeof workOrderData.vehicle === 'object' ? workOrderData.vehicle.id : workOrderData.vehicle;
      
      // Include branch from work order if available
      if (workOrderData.branch) {
        submitData.branch = typeof workOrderData.branch === 'object' ? workOrderData.branch.id : workOrderData.branch;
      }
    }
    
    console.log("Submitting gate pass data:", submitData);
    createMutation.mutate(submitData);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/gatepass">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Create Gate Pass</h1>
          <p className="text-sm text-muted-foreground">Create a gate pass for vehicle pickup</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Work Order Selection</CardTitle>
            <CardDescription>Select the closed work order for this gate pass</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="work_order">Work Order *</Label>
              <Select
                value={workOrder?.toString() || ""}
                onValueChange={(value) => {
                  const woId = parseInt(value);
                  setSelectedWorkOrder(woId);
                  setValue("work_order", woId);
                }}
              >
                <SelectTrigger id="work_order" className={errors.work_order ? "border-red-500" : ""}>
                  <SelectValue placeholder="Select a closed work order" />
                </SelectTrigger>
                <SelectContent>
                  {workOrdersData?.results?.map((wo) => (
                    <SelectItem key={wo.id} value={wo.id.toString()}>
                      {wo.work_order_number} - {wo.customer_name} - {wo.vehicle_info}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.work_order && (
                <p className="text-xs text-red-500">{errors.work_order.message}</p>
              )}
            </div>

            {workOrderData && (
              <div className="bg-muted p-4 rounded-lg space-y-2 border border-border">
                <p className="text-sm font-semibold text-foreground mb-2">Work Order Details:</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Work Order Number</p>
                    <p className="text-sm font-medium text-foreground">{workOrderData.work_order_number || "N/A"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Customer</p>
                    <p className="text-sm font-medium text-foreground">{getCustomerName(workOrderData)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Vehicle</p>
                    <p className="text-sm font-medium text-foreground">{getVehicleInfo(workOrderData)}</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pickup Information</CardTitle>
            <CardDescription>Who is picking up the vehicle?</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="picked_up_by_customer"
                  checked={pickedUpByCustomer}
                  onChange={(e) => setValue("picked_up_by_customer", e.target.checked)}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                />
                <Label htmlFor="picked_up_by_customer" className="cursor-pointer">
                  Customer is picking up the vehicle
                </Label>
              </div>
            </div>

            {!pickedUpByCustomer && (
              <div className="space-y-4 border-t pt-4">
                <div className="space-y-2">
                  <Label htmlFor="pickup_person_name">
                    Pickup Person Name *
                  </Label>
                  <Input
                    id="pickup_person_name"
                    {...register("pickup_person_name")}
                    placeholder="Enter full name"
                    className={errors.pickup_person_name ? "border-red-500" : ""}
                  />
                  {errors.pickup_person_name && (
                    <p className="text-xs text-red-500">{errors.pickup_person_name.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pickup_person_relationship">Relationship to Customer</Label>
                  <Input
                    id="pickup_person_relationship"
                    {...register("pickup_person_relationship")}
                    placeholder="e.g., Brother, Employee, Friend"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="pickup_person_id_type">ID Type</Label>
                    <Select
                      value={watch("pickup_person_id_type") || ""}
                      onValueChange={(value) => setValue("pickup_person_id_type", value)}
                    >
                      <SelectTrigger id="pickup_person_id_type">
                        <SelectValue placeholder="Select ID type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="driver_license">Driver License</SelectItem>
                        <SelectItem value="national_id">National ID</SelectItem>
                        <SelectItem value="passport">Passport</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pickup_person_id_number">ID Number</Label>
                    <Input
                      id="pickup_person_id_number"
                      {...register("pickup_person_id_number")}
                      placeholder="Enter ID number"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pickup_person_phone">Phone Number</Label>
                  <Input
                    id="pickup_person_phone"
                    {...register("pickup_person_phone")}
                    placeholder="Enter phone number"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="pickup_notes">Additional Notes</Label>
              <Textarea
                id="pickup_notes"
                {...register("pickup_notes")}
                placeholder="Any additional notes about the pickup..."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {serverError && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded flex items-start gap-2">
            <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">Error</p>
              <p className="text-sm">{serverError}</p>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Link href="/gatepass">
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={isSubmitting || createMutation.isPending}>
            {isSubmitting || createMutation.isPending ? "Creating..." : "Create Gate Pass"}
          </Button>
        </div>
      </form>
    </div>
  );
}
