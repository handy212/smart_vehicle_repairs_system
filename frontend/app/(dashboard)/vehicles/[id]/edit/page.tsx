"use client";

import { useRouter, useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { vehiclesApi, Vehicle } from "@/lib/api/vehicles";
import { Button } from "@/components/ui/button";
import { ArrowLeft, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AxiosError } from "axios";
import { VehicleForm, VehicleFormData } from "@/components/vehicles/VehicleForm";

export default function EditVehiclePage() {
  const router = useRouter();
  const params = useParams();
  const vehicleId = parseInt(params.id as string);
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const { data: vehicle, isLoading } = useQuery<Vehicle>({
    queryKey: ["vehicle", vehicleId],
    queryFn: () => vehiclesApi.get(vehicleId),
  });

  const updateMutation = useMutation({

    mutationFn: ({ id, data }: { id: number; data: FormData | VehicleFormData }) => vehiclesApi.update(id, data as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicle", vehicleId] });
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      router.push(`/vehicles/${vehicleId}`);
    },
    onError: (error) => {
      console.error("Error updating vehicle:", error);
      setFieldErrors({});

      if (error instanceof AxiosError && error.response?.data) {
        const errorData = error.response.data;

        // Extract field-level errors
        const extractedFieldErrors: Record<string, string> = {};
        let hasFieldErrors = false;

        Object.keys(errorData).forEach((field) => {
          if (field !== 'non_field_errors' && field !== 'detail') {
            const fieldError = Array.isArray(errorData[field])
              ? errorData[field][0]
              : errorData[field];
            if (fieldError) {
              extractedFieldErrors[field] = fieldError;
              hasFieldErrors = true;
            }
          }
        });

        if (hasFieldErrors) {
          setFieldErrors(extractedFieldErrors);
          // Show a summary message
          const fieldNames = Object.keys(extractedFieldErrors);
          const fieldLabels: Record<string, string> = {
            vin: 'VIN',
            license_plate: 'License Plate',
            owner: 'Owner',
            year: 'Year',
            make: 'Make',
            model: 'Model',
          };
          const labels = fieldNames.map(f => fieldLabels[f] || f).join(', ');
          setServerError(`Please fix the following field(s): ${labels}`);
        } else if (errorData.non_field_errors) {
          setServerError(Array.isArray(errorData.non_field_errors) ? errorData.non_field_errors[0] : errorData.non_field_errors);
        } else if (typeof errorData === 'string') {
          setServerError(errorData);
        } else if (errorData.detail) {
          setServerError(errorData.detail);
        } else {
          setServerError("An error occurred. Please check the form details.");
        }
      } else {
        setServerError("An unexpected error occurred. Please try again.");
      }
    }
  });

  const handleSubmit = async (data: VehicleFormData, imageFile: File | null) => {
    setServerError(null);
    let payload: VehicleFormData | FormData;

    if (imageFile) {
      const formData = new FormData();
      Object.keys(data).forEach((key) => {
        const value = data[key as keyof VehicleFormData];
        if (value !== undefined && value !== null) {
          formData.append(key, value.toString());
        }
      });
      formData.append('image', imageFile);
      payload = formData;
    } else {
      // Logic: if vehicle has image but form data image is missing/null, it might imply deletion if we explicitly cleared it?
      // Currently backend likely ignores missing image field, so this preserves existing image.
      payload = data;
    }

    await updateMutation.mutateAsync({ id: vehicleId, data: payload });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary dark:border-orange-400"></div>
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="space-y-4">
        <Link href="/vehicles">
          <Button variant="secondary">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>
        <div className="p-6 bg-card rounded-lg shadow-sm border border-border">
          <p className="text-destructive dark:text-red-400">Vehicle not found.</p>
        </div>
      </div>
    );
  }

  // Map backend data to form data
  const initialData: Partial<VehicleFormData> & { image?: string | null } = {
    vin: vehicle.vin || "",
    make: vehicle.make || "",
    model: vehicle.model || "",
    year: vehicle.year || new Date().getFullYear(),
    license_plate: vehicle.license_plate || "",
    exterior_color: vehicle.exterior_color || "",
    current_mileage: vehicle.current_mileage || 0,

    engine_type: (vehicle.engine_type as any) || "gasoline",
    owner: typeof vehicle.owner === 'object' && vehicle.owner !== null ? vehicle.owner.id : (vehicle.owner || 0),

    status: (vehicle.status as any) || "active",

    vehicle_type: (vehicle.vehicle_type as any) || "saloon",
    image: vehicle.image,
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/vehicles/${vehicleId}`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Edit Vehicle</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {vehicle.make} {vehicle.model} {vehicle.year}
            </p>
          </div>
        </div>
      </div>

      {serverError && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/10 dark:bg-red-900/20 border border-destructive/20 dark:border-red-800">
          <AlertCircle className="w-5 h-5 text-destructive dark:text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-destructive dark:text-red-300">{serverError}</p>
        </div>
      )}

      <VehicleForm
        initialData={initialData}
        onSubmit={handleSubmit}
        isSubmitting={updateMutation.isPending}
        mode="edit"
        onCancel={() => router.back()}
        serverFieldErrors={fieldErrors}
      />
    </div>
  );
}