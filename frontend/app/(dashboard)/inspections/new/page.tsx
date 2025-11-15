"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { inspectionsApi } from "@/lib/api/inspections";
import { vehiclesApi } from "@/lib/api/vehicles";
import { workordersApi } from "@/lib/api/workorders";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AxiosError } from "axios";
import { useToast } from "@/lib/hooks/useToast";

const inspectionSchema = z.object({
  vehicle: z.number().min(1, "Vehicle is required"),
  template: z.number().min(1, "Template is required"),
  work_order: z.number().optional(),
  inspection_date: z.string().min(1, "Inspection date is required"),
  odometer_reading: z.number().min(0).optional(),
  notes: z.string().optional(),
});

type InspectionFormData = z.infer<typeof inspectionSchema>;

export default function NewInspectionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const vehicleId = searchParams.get("vehicle");
  const workOrderId = searchParams.get("work_order");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [serverError, setServerError] = useState<string | null>(null);

  // Fetch templates
  const { data: templatesData } = useQuery({
    queryKey: ["inspection-templates", "active"],
    queryFn: () => inspectionsApi.templates.active(),
  });

  // Fetch vehicles
  const { data: vehiclesData } = useQuery({
    queryKey: ["vehicles", "list"],
    queryFn: () => vehiclesApi.list({ page: 1 }),
  });

  // Fetch work order if provided
  const { data: workOrder } = useQuery({
    queryKey: ["workorder", workOrderId],
    queryFn: () => workordersApi.get(parseInt(workOrderId!)),
    enabled: !!workOrderId,
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    setError,
    watch,
  } = useForm<InspectionFormData>({
    resolver: zodResolver(inspectionSchema),
    defaultValues: {
      inspection_date: new Date().toISOString().slice(0, 16),
      vehicle: vehicleId ? parseInt(vehicleId) : undefined,
      work_order: workOrderId ? parseInt(workOrderId) : undefined,
    },
  });

  const selectedVehicle = watch("vehicle");

  // Pre-fill vehicle from work order if available
  if (workOrder && !selectedVehicle) {
    const vehicleId = typeof workOrder.vehicle === 'object' ? workOrder.vehicle.id : workOrder.vehicle;
    if (vehicleId) {
      setValue("vehicle", vehicleId);
    }
  }

  const createMutation = useMutation({
    mutationFn: (data: InspectionFormData) => inspectionsApi.create(data),
    onSuccess: (inspection) => {
      queryClient.invalidateQueries({ queryKey: ["inspections"] });
      toast({
        title: "Success",
        description: "Inspection created successfully",
        variant: "success",
      });
      router.push(`/inspections/${inspection.id}`);
    },
    onError: (error) => {
      if (error instanceof AxiosError && error.response?.data) {
        const errorData = error.response.data;
        Object.keys(errorData).forEach((field) => {
          if (field !== "non_field_errors" && field !== "detail") {
            const fieldError = Array.isArray(errorData[field])
              ? errorData[field][0]
              : errorData[field];
            setError(field as keyof InspectionFormData, {
              type: "server",
              message: fieldError,
            });
          }
        });
        if (errorData.non_field_errors) {
          setServerError(
            Array.isArray(errorData.non_field_errors)
              ? errorData.non_field_errors[0]
              : errorData.non_field_errors
          );
        } else if (errorData.detail) {
          setServerError(errorData.detail);
        } else {
          setServerError("An error occurred while creating the inspection. Please check the form and try again.");
        }
      } else {
        setServerError("An unexpected error occurred. Please try again.");
      }
    },
  });

  const onSubmit = async (data: InspectionFormData) => {
    setServerError(null);
    await createMutation.mutateAsync(data);
  };

  const templates = templatesData || [];
  const vehicles = vehiclesData?.results || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Link href="/inspections">
          <Button variant="outline" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">New Inspection</h1>
          <p className="mt-1 text-sm text-gray-500">
            Create a new vehicle inspection
          </p>
        </div>
      </div>

      {serverError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2 text-red-800">
              <AlertCircle className="w-5 h-5" />
              <p className="font-medium">{serverError}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <form onSubmit={handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle>Inspection Details</CardTitle>
            <CardDescription>
              Select the vehicle and template for this inspection
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <label htmlFor="vehicle" className="block text-sm font-medium text-gray-700 mb-1">
                Vehicle <span className="text-red-500">*</span>
              </label>
              <select
                id="vehicle"
                {...register("vehicle", { valueAsNumber: true })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Select a vehicle</option>
                {vehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.year} {vehicle.make} {vehicle.model} - {vehicle.license_plate}
                  </option>
                ))}
              </select>
              {errors.vehicle && (
                <p className="text-red-500 text-xs mt-1">{errors.vehicle.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="template" className="block text-sm font-medium text-gray-700 mb-1">
                Template <span className="text-red-500">*</span>
              </label>
              <select
                id="template"
                {...register("template", { valueAsNumber: true })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Select a template</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                    {template.is_default && " (Default)"}
                  </option>
                ))}
              </select>
              {errors.template && (
                <p className="text-red-500 text-xs mt-1">{errors.template.message}</p>
              )}
              <p className="text-xs text-gray-500 mt-1">
                Don't see a template?{" "}
                <Link href="/inspections/templates" className="text-blue-600 hover:underline">
                  Manage templates
                </Link>
              </p>
            </div>

            <div>
              <label htmlFor="work_order" className="block text-sm font-medium text-gray-700 mb-1">
                Work Order (Optional)
              </label>
              <Input
                id="work_order"
                type="number"
                {...register("work_order", { valueAsNumber: true })}
                placeholder="Work order ID"
              />
              {errors.work_order && (
                <p className="text-red-500 text-xs mt-1">{errors.work_order.message}</p>
              )}
              {workOrder && (
                <p className="text-xs text-gray-500 mt-1">
                  Linked to work order: {(workOrder as any).wo_number || workOrder.id}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="inspection_date" className="block text-sm font-medium text-gray-700 mb-1">
                Inspection Date <span className="text-red-500">*</span>
              </label>
              <Input
                id="inspection_date"
                type="datetime-local"
                {...register("inspection_date")}
              />
              {errors.inspection_date && (
                <p className="text-red-500 text-xs mt-1">{errors.inspection_date.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="odometer_reading" className="block text-sm font-medium text-gray-700 mb-1">
                Odometer Reading (Optional)
              </label>
              <Input
                id="odometer_reading"
                type="number"
                {...register("odometer_reading", { valueAsNumber: true })}
                placeholder="Current mileage"
                min={0}
              />
              {errors.odometer_reading && (
                <p className="text-red-500 text-xs mt-1">{errors.odometer_reading.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
                Notes (Optional)
              </label>
              <Textarea
                id="notes"
                {...register("notes")}
                placeholder="Additional notes about this inspection"
                rows={3}
              />
              {errors.notes && (
                <p className="text-red-500 text-xs mt-1">{errors.notes.message}</p>
              )}
            </div>

            <div className="flex justify-end space-x-2 pt-4">
              <Link href="/inspections">
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Creating..." : "Create Inspection"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}

