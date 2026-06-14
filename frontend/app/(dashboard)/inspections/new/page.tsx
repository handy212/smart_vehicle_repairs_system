"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { inspectionsApi } from "@/lib/api/inspections";
import { workordersApi } from "@/lib/api/workorders";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AxiosError } from "axios";
import { useToast } from "@/lib/hooks/useToast";
import { InspectionForm, InspectionFormData } from "@/components/inspections/InspectionForm";
import { getUserFacingError } from "@/lib/api/errors";

type ApiValidationData = Record<string, unknown> & {
  detail?: string;
  non_field_errors?: string | string[];
};

export default function NewInspectionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const vehicleId = searchParams.get("vehicle");
  const workOrderId = searchParams.get("work_order");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [serverError, setServerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showActiveWorkOrderDialog, setShowActiveWorkOrderDialog] = useState(false);
  const [activeWorkOrderBranch, setActiveWorkOrderBranch] = useState<string | null>(null);

  // Fetch work order if provided
  const { data: workOrder } = useQuery({
    queryKey: ["workorder", workOrderId],
    queryFn: () => workordersApi.get(parseInt(workOrderId!)),
    enabled: !!workOrderId,
  });

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
    onError: (error: unknown) => {
      if (process.env.NODE_ENV === 'development') {
        const debugError = error as { message?: string; response?: { status?: number; data?: unknown } };
        console.error("New inspection creation onError caught:", {
          message: debugError.message,
          status: debugError.response?.status,
          data: debugError.response?.data ? JSON.parse(JSON.stringify(debugError.response.data)) : null
        });
      }

      if (error instanceof AxiosError && error.response?.data) {
        const errorData = error.response.data as ApiValidationData;

        // Check for active work order at another branch error
        let errorMessage = '';
        if (errorData.non_field_errors) {
          errorMessage = Array.isArray(errorData.non_field_errors)
            ? errorData.non_field_errors[0]
            : errorData.non_field_errors;
        } else if (errorData.detail) {
          errorMessage = errorData.detail;
        } else if (typeof errorData === 'string') {
          errorMessage = errorData;
        }

        // Check if this is the active work order error
        if (errorMessage && typeof errorMessage === 'string' && errorMessage.includes('has an active work order') && errorMessage.includes('at')) {
          const branchMatch = errorMessage.match(/at ([^.]+)\./);
          const branchName = branchMatch ? branchMatch[1].trim() : 'another branch';
          setActiveWorkOrderBranch(branchName);
          setShowActiveWorkOrderDialog(true);
          return;
        }

        // Handle field-level errors
        const newFieldErrors: Record<string, string> = {};
        Object.keys(errorData).forEach((field) => {
          if (field !== 'non_field_errors' && field !== 'detail') {
            const fieldData = errorData[field];
            let fieldError = "";

            if (Array.isArray(fieldData)) {
              const first = fieldData[0];
              fieldError = typeof first === 'object' && first !== null ? JSON.stringify(first) : String(first);
            } else {
              fieldError = typeof fieldData === 'object' && fieldData !== null ? JSON.stringify(fieldData) : String(fieldData);
            }
            newFieldErrors[field] = fieldError;
          }
        });

        if (Object.keys(newFieldErrors).length > 0) {
          setFieldErrors(newFieldErrors);
          setServerError("Please correct the errors in the form below.");
        } else if (errorMessage) {
          setServerError(getUserFacingError(error, "We couldn't create this inspection. Please check the form and try again."));
        } else {
          setServerError("An error occurred. Check the form for details.");
        }
      } else {
        setServerError(getUserFacingError(error, "An unexpected error occurred. Please try again."));
      }
    },
  });

  const onSubmit = async (data: InspectionFormData) => {
    setServerError(null);
    setFieldErrors({});
    await createMutation.mutateAsync(data);
  };

  const initialData: Partial<InspectionFormData> = {
    vehicle: vehicleId ? parseInt(vehicleId) : (workOrder ? (typeof workOrder.vehicle === 'object' ? workOrder.vehicle.id : workOrder.vehicle as number) : undefined),
    work_order: workOrderId ? parseInt(workOrderId) : undefined,
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-12">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/inspections">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">New Inspection</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Create a new vehicle inspection
            </p>
          </div>
        </div>
      </div>

      <InspectionForm
        initialData={initialData}
        onSubmit={onSubmit}
        isSubmitting={createMutation.isPending}
        serverError={serverError}
        onCancel={() => router.push("/inspections")}
        activeWorkOrderBranch={activeWorkOrderBranch}
        showActiveWorkOrderDialog={showActiveWorkOrderDialog}
        setShowActiveWorkOrderDialog={setShowActiveWorkOrderDialog}
        workOrderData={workOrder}
        fieldErrors={fieldErrors}
      />
    </div>
  );
}
