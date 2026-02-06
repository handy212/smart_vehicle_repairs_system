"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { vehiclesApi } from "@/lib/api/vehicles";
import { Button } from "@/components/ui/button";
import { ArrowLeft, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AxiosError } from "axios";
import { VehicleForm, VehicleFormData } from "@/components/vehicles/VehicleForm";

export default function NewVehiclePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const customerId = searchParams.get("customer");
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const createMutation = useMutation({
    mutationFn: (data: VehicleFormData | FormData) => vehiclesApi.create(data as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      if (customerId) {
        router.push(`/customers/${customerId}`);
      } else {
        router.push("/vehicles");
      }
    },
    onError: (error) => {
      console.error("Error creating vehicle:", error);
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
      payload = data;
    }

    await createMutation.mutateAsync(payload);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={customerId ? `/customers/${customerId}` : "/vehicles"}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">New Vehicle</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Register a new vehicle</p>
          </div>
        </div>
      </div>

      {serverError && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800 dark:text-red-300">{serverError}</p>
        </div>
      )}

      <VehicleForm
        customerId={customerId}
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending}
        mode="create"
        onCancel={() => router.back()}
        serverFieldErrors={fieldErrors}
      />
    </div>
  );
}