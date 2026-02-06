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

export default function NewInspectionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const vehicleId = searchParams.get("vehicle");
  const workOrderId = searchParams.get("work_order");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [serverError, setServerError] = useState<string | null>(null);
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
    onError: (error) => {
      if (error instanceof AxiosError && error.response?.data) {
        const errorData = error.response.data;

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
        if (errorMessage && errorMessage.includes('has an active work order') && errorMessage.includes('at')) {
          const branchMatch = errorMessage.match(/at ([^.]+)\./);
          const branchName = branchMatch ? branchMatch[1].trim() : 'another branch';
          setActiveWorkOrderBranch(branchName);
          setShowActiveWorkOrderDialog(true);
          return;
        }

        if (errorMessage) {
          setServerError(errorMessage);
        } else {
          setServerError("An error occurred. Check the form for details.");
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
      />
    </div>
  );
}
