"use client";

import { AlertCircle, AlertTriangle, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type RepeatVisitMatch = {
  work_order_id: number;
  work_order_number: string;
  completed_at: string;
  days_ago: number;
  customer_concerns: string;
  similarity: number;
  technician: string;
  branch_name: string;
};

export type UnapprovedRecommendation = {
  id: number;
  work_order_id: number;
  work_order_number: string;
  work_order_completed_at?: string | null;
  priority: string;
  priority_display: string;
  recommendation_type_display: string;
  approval_status_display: string;
  description: string;
  parts_needed?: unknown[];
};

export type UnapprovedRecommendationsData = {
  count: number;
  recommendations: UnapprovedRecommendation[];
};

export interface NewWorkOrderDialogsProps {
  showActiveWorkOrderDialog: boolean;
  onActiveWorkOrderDialogChange: (open: boolean) => void;
  activeWorkOrderBranch: string | null;
  showRepeatVisitDialog: boolean;
  onRepeatVisitDialogChange: (open: boolean) => void;
  repeatVisitMatches: RepeatVisitMatch[];
  selectedRelatedWorkOrderId: number | null;
  onSelectRelatedWorkOrderId: (workOrderId: number) => void;
  isWarrantyRework: boolean;
  onWarrantyReworkChange: (checked: boolean) => void;
  onRepeatVisitContinueAnyway: () => void;
  showUnapprovedRecommendationsDialog: boolean;
  onUnapprovedRecommendationsDialogChange: (open: boolean) => void;
  unapprovedRecommendationsData?: UnapprovedRecommendationsData | null;
  acknowledgedUnapproved: boolean;
  onAcknowledgedUnapprovedChange: (checked: boolean) => void;
  onUnapprovedRecommendationsCancel: () => void;
  onUnapprovedRecommendationsProceed: () => void;
}

export function NewWorkOrderDialogs({
  showActiveWorkOrderDialog,
  onActiveWorkOrderDialogChange,
  activeWorkOrderBranch,
  showRepeatVisitDialog,
  onRepeatVisitDialogChange,
  repeatVisitMatches,
  selectedRelatedWorkOrderId,
  onSelectRelatedWorkOrderId,
  isWarrantyRework,
  onWarrantyReworkChange,
  onRepeatVisitContinueAnyway,
  showUnapprovedRecommendationsDialog,
  onUnapprovedRecommendationsDialogChange,
  unapprovedRecommendationsData,
  acknowledgedUnapproved,
  onAcknowledgedUnapprovedChange,
  onUnapprovedRecommendationsCancel,
  onUnapprovedRecommendationsProceed,
}: NewWorkOrderDialogsProps) {
  const recommendationsByWorkOrder = (unapprovedRecommendationsData?.recommendations ?? []).reduce<
    Record<
      number,
      {
        work_order_number: string;
        work_order_completed_at?: string | null;
        recommendations: UnapprovedRecommendation[];
      }
    >
  >((acc, rec) => {
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
  }, {});

  return (
    <>
      <Dialog open={showActiveWorkOrderDialog} onOpenChange={onActiveWorkOrderDialogChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2 text-destructive dark:text-destructive">
              <AlertCircle className="w-5 h-5" />
              <span>Active Work Order Detected</span>
            </DialogTitle>
            <DialogDescription className="pt-4">
              The selected vehicle has an open work order at{" "}
              <strong>{activeWorkOrderBranch || "another branch"}</strong>. Please close it before creating a
              new one.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => onActiveWorkOrderDialogChange(false)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRepeatVisitDialog} onOpenChange={onRepeatVisitDialogChange}>
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
                <h4 className="font-semibold text-sm text-foreground">Previous Work Order(s):</h4>
                {repeatVisitMatches.map((match) => (
                  <Card key={match.work_order_id} className="border-primary/15">
                    <CardContent className="pt-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-sm">
                              Work Order: <strong>{match.work_order_number}</strong>
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Completed {match.days_ago} day{match.days_ago !== 1 ? "s" : ""} ago
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-medium text-primary">
                              {Math.round(match.similarity * 100)}% similar
                            </p>
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground space-y-1">
                          <p>
                            <strong>Branch:</strong> {match.branch_name}
                          </p>
                          <p>
                            <strong>Technician:</strong> {match.technician}
                          </p>
                          <p>
                            <strong>Previous Concerns:</strong> {match.customer_concerns.substring(0, 150)}
                            {match.customer_concerns.length > 150 ? "..." : ""}
                          </p>
                        </div>
                        <div className="pt-2">
                          <label className="flex items-center space-x-2 cursor-pointer">
                            <input
                              type="radio"
                              name="related_work_order"
                              checked={selectedRelatedWorkOrderId === match.work_order_id}
                              onChange={() => onSelectRelatedWorkOrderId(match.work_order_id)}
                              className="w-4 h-4 text-primary"
                            />
                            <span className="text-sm text-card-foreground">Link this work order as related</span>
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
                  onChange={(e) => onWarrantyReworkChange(e.target.checked)}
                  className="w-4 h-4 text-primary rounded"
                />
                <span className="text-sm font-medium text-foreground">Mark as warranty/rework case</span>
              </label>
              <p className="text-xs text-muted-foreground mt-1 ml-6">
                This will flag the work order as a warranty case and link it to the previous work order.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={onRepeatVisitContinueAnyway}>
              Continue Anyway
            </Button>
            <Button onClick={() => onRepeatVisitDialogChange(false)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showUnapprovedRecommendationsDialog}
        onOpenChange={onUnapprovedRecommendationsDialogChange}
      >
        <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <AlertTriangle className="w-5 h-5 text-primary" />
              Open Vehicle Recommendations Found
            </DialogTitle>
            <DialogDescription className="text-sm">
              This vehicle has {unapprovedRecommendationsData?.count || 0} pending or deferred recommendation
              {unapprovedRecommendationsData?.count !== 1 ? "s" : ""} from previous work orders. Please review
              and acknowledge before proceeding.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {unapprovedRecommendationsData && unapprovedRecommendationsData.count > 0 ? (
              <div className="space-y-4">
                {Object.entries(recommendationsByWorkOrder).map(([woId, group]) => (
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
                      {group.recommendations.map((rec) => (
                        <div key={rec.id} className="rounded border-l-4 border-l-primary bg-card p-3">
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
                              <Badge variant="outline" className="text-xs capitalize">
                                {rec.approval_status_display}
                              </Badge>
                            </div>
                          </div>
                          <p className="text-sm text-card-foreground mt-2">{rec.description}</p>
                          {Array.isArray(rec.parts_needed) && rec.parts_needed.length > 0 && (
                            <p className="mt-2 text-xs text-muted-foreground">
                              Parts listed: {rec.parts_needed.length}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6">
                <CheckCircle className="w-10 h-10 mx-auto text-success mb-2" />
                <p className="font-medium text-foreground">No Open Recommendations</p>
              </div>
            )}
          </div>

          {unapprovedRecommendationsData && unapprovedRecommendationsData.count > 0 && (
            <DialogFooter className="flex-col sm:flex-row gap-3">
              <label className="flex items-center space-x-2 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={acknowledgedUnapproved}
                  onChange={(e) => onAcknowledgedUnapprovedChange(e.target.checked)}
                  className="w-4 h-4 text-primary rounded border-border focus:ring-primary"
                />
                <span className="text-card-foreground">
                  I acknowledge these open vehicle recommendations and wish to proceed
                </span>
              </label>
              <div className="flex gap-2 w-full sm:w-auto">
                <Button
                  variant="outline"
                  onClick={onUnapprovedRecommendationsCancel}
                  className="flex-1 sm:flex-none"
                >
                  Cancel
                </Button>
                <Button
                  onClick={onUnapprovedRecommendationsProceed}
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
    </>
  );
}
