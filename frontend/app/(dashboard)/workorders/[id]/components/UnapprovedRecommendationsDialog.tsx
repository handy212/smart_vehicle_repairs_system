"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useQuery } from "@tanstack/react-query";
import { diagnosisApi } from "@/lib/api/diagnosis";
import { useCurrency } from "@/lib/hooks/useCurrency";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle, Printer } from "lucide-react";

interface UnapprovedRecommendationsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workOrderId: number;
  onPrintRecommendations: () => void;
}

export function UnapprovedRecommendationsDialog({
  open,
  onOpenChange,
  workOrderId,
  onPrintRecommendations,
}: UnapprovedRecommendationsDialogProps) {
  const { formatCurrency } = useCurrency();

  const { data: diagnosis, isLoading } = useQuery({
    queryKey: ["diagnosis", "workorder", workOrderId],
    queryFn: () => diagnosisApi.getByWorkOrder(workOrderId),
    enabled: open && !!workOrderId,
  });

  const unapprovedRecommendations =
    diagnosis?.repair_recommendations?.filter(
      (r: any) =>
        ["pending_approval", "deferred"].includes(r.approval_status) &&
        !r.converted_to_task_id
    ) || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <AlertTriangle className="h-5 w-5 text-primary" />
            Open vehicle recommendations
          </DialogTitle>
          <DialogDescription className="text-xs">
            These items were not completed in workshop and should follow the vehicle into future visits.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          {isLoading ? (
            <div className="py-6 text-center">
              <div className="mx-auto h-6 w-6 animate-spin rounded-full border-b-2 border-primary" />
            </div>
          ) : unapprovedRecommendations.length === 0 ? (
            <div className="py-6 text-center">
              <CheckCircle className="mx-auto mb-2 h-10 w-10 text-success" />
              <p className="font-medium text-foreground">All approved</p>
            </div>
          ) : (
            <div className="space-y-3">
              {unapprovedRecommendations.map((rec: any) => (
                <div
                  key={rec.id}
                  className="rounded-md border border-primary/15 bg-primary/5 p-3"
                >
                  <div className="mb-1.5 flex items-start justify-between">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-foreground">
                        {rec.description}
                      </span>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className="h-5 border-primary/20 px-1.5 py-0 text-[10px] text-primary"
                        >
                          {rec.priority_display || rec.priority}
                        </Badge>
                        <Badge variant="outline" className="h-5 px-1.5 py-0 text-[10px]">
                          {rec.recommendation_type_display || rec.recommendation_type}
                        </Badge>
                      </div>
                    </div>
                    {rec.estimated_total_cost && Number(rec.estimated_total_cost) > 0 && (
                      <span className="font-mono text-sm font-bold text-foreground">
                        {formatCurrency(Number(rec.estimated_total_cost))}
                      </span>
                    )}
                  </div>
                  {Array.isArray(rec.parts_needed) && rec.parts_needed.length > 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Parts:{" "}
                      {rec.parts_needed
                        .map((part: any) => `${part.part_name} x${part.quantity}`)
                        .join(", ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {unapprovedRecommendations.length > 0 && (
          <DialogFooter className="pt-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                onPrintRecommendations();
                onOpenChange(false);
              }}
            >
              <Printer className="mr-1.5 h-3.5 w-3.5" />
              Print follow-up list
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
