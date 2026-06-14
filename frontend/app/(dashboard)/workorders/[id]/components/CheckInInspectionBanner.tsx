"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { inspectionsApi } from "@/lib/api/inspections";
import { workordersApi, WorkOrder } from "@/lib/api/workorders";
import { CreateInspectionForm } from "./forms/CreateInspectionForm";
import { useToast } from "@/lib/hooks/useToast";
import { getUserFacingError } from "@/lib/api/errors";

interface CheckInInspectionBannerProps {
  workOrder: WorkOrder;
  workOrderId: number;
  onStatusChange?: () => void;
}

export function CheckInInspectionBanner({
  workOrder,
  workOrderId,
  onStatusChange,
}: CheckInInspectionBannerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [dismissed, setDismissed] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const fromCheckIn = searchParams.get("from") === "check-in";

  useEffect(() => {
    if (fromCheckIn) {
      setDismissed(false);
    }
  }, [fromCheckIn, workOrderId]);

  const { data: inspectionsData } = useQuery({
    queryKey: ["inspections", "workorder", workOrderId],
    queryFn: () => inspectionsApi.list({ work_order: workOrderId }),
    enabled: !!workOrderId,
  });

  const hasInspection = (inspectionsData?.results?.length ?? 0) > 0;
  const needsInspection =
    !workOrder.has_completed_inspection &&
    ["draft", "inspection"].includes(workOrder.status);

  const visible =
    !dismissed &&
    needsInspection &&
    (fromCheckIn || (!hasInspection && workOrder.status === "draft"));

  const createInspectionMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => inspectionsApi.create(data),
    onSuccess: async (inspection) => {
      const inspectionId = inspection?.id;
      if (!inspectionId) {
        toast({
          title: "Inspection created",
          description: "Open the inspections list to continue.",
          variant: "warning",
        });
        setShowDialog(false);
        return;
      }

      try {
        await workordersApi.updateStatus(workOrderId, "inspection");
      } catch {
        // Still navigate — inspection exists
      }

      queryClient.invalidateQueries({ queryKey: ["workorder", workOrderId] });
      queryClient.invalidateQueries({ queryKey: ["inspections", "workorder", workOrderId] });
      setShowDialog(false);
      onStatusChange?.();

      toast({
        title: "Inspection started",
        description: "Complete the inspection checklist to unlock the work order.",
        variant: "success",
      });

      router.push(`/inspections/${inspectionId}/perform`);
    },
    onError: (error: unknown) => {
      toast({
        title: "Could not start inspection",
        description: getUserFacingError(error, "Please try again."),
        variant: "destructive",
      });
    },
  });

  const handleDismiss = () => {
    setDismissed(true);
    if (fromCheckIn) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("from");
      const qs = params.toString();
      router.replace(`/workorders/${workOrderId}${qs ? `?${qs}` : ""}`, { scroll: false });
    }
  };

  if (!visible) return null;

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
        <div className="flex min-w-0 items-start gap-3">
          <ClipboardCheck className="h-5 w-5 shrink-0 text-primary mt-0.5" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              {fromCheckIn ? "Check-in complete — start inspection" : "Initial inspection required"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Create and perform the intake inspection before moving this work order forward.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" onClick={() => setShowDialog(true)}>
            Start inspection
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            aria-label="Dismiss inspection prompt"
            onClick={handleDismiss}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Start initial inspection</DialogTitle>
            <DialogDescription>
              Select a template and confirm odometer reading for this check-in.
            </DialogDescription>
          </DialogHeader>
          <CreateInspectionForm
            workOrder={workOrder}
            fieldErrors={fieldErrors}
            isSubmitting={createInspectionMutation.isPending}
            onCancel={() => setShowDialog(false)}
            onSubmit={(data) => {
              setFieldErrors({});
              createInspectionMutation.mutate(data);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
