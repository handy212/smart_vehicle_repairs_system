"use client";

import { RefObject } from "react";
import { AlertCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PremiumIcons } from "@/components/ui/icons";
import {
  ServiceIntakeFields,
  type ServiceIntakeFieldsProps,
} from "@/components/workorders/ServiceIntakeFields";

export type RecentWorkOrderOption = {
  id: number;
  work_order_number: string;
  status: string;
  completed_at: string | null;
  customer_concerns: string;
  technician_name: string;
  branch_name: string;
  days_ago: number | null;
};

export interface NewWorkOrderServiceSectionProps extends ServiceIntakeFieldsProps {
  showAdvanced: boolean;
  onToggleAdvanced: () => void;
  advancedOptionsRef: RefObject<HTMLDivElement | null>;
  isWarrantyRework: boolean;
  onToggleWarrantyRework: () => void;
  vehicleId?: number;
  isLoadingRecentWorkOrders: boolean;
  recentWorkOrders: RecentWorkOrderOption[];
  selectedRelatedWorkOrderId: number | null;
  onSelectRelatedWorkOrder: (workOrder: RecentWorkOrderOption) => void;
  showWorkOrderSearch: boolean;
  onToggleWorkOrderSearch: () => void;
  workOrderSearchQuery: string;
  onWorkOrderSearchQueryChange: (value: string) => void;
  onClearWorkOrderSearch: () => void;
  warrantyReason: string;
  onWarrantyReasonChange: (value: string) => void;
  repeatVisitMatchCount: number;
  showRepeatVisitDialog: boolean;
}

export function NewWorkOrderServiceSection({
  showAdvanced,
  onToggleAdvanced,
  advancedOptionsRef,
  isWarrantyRework,
  onToggleWarrantyRework,
  vehicleId,
  isLoadingRecentWorkOrders,
  recentWorkOrders,
  selectedRelatedWorkOrderId,
  onSelectRelatedWorkOrder,
  showWorkOrderSearch,
  onToggleWorkOrderSearch,
  workOrderSearchQuery,
  onWorkOrderSearchQueryChange,
  onClearWorkOrderSearch,
  warrantyReason,
  onWarrantyReasonChange,
  repeatVisitMatchCount,
  showRepeatVisitDialog,
  concernsFooter,
  ...serviceIntakeProps
}: NewWorkOrderServiceSectionProps) {
  const repeatVisitFooter =
    repeatVisitMatchCount > 0 && !showRepeatVisitDialog ? (
      <div className="rounded-md border border-primary/15 bg-primary/5 p-3">
        <p className="text-sm text-primary">
          <AlertCircle className="mr-1 inline h-4 w-4" />
          Similar concerns detected from recent work order(s). Check the alert dialog for details.
        </p>
      </div>
    ) : null;

  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border/40 bg-muted/30 pb-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <PremiumIcons.FileText className="h-5 w-5 text-primary/80" />
                Service & request
              </CardTitle>
              <CardDescription>
                Job type, package if needed, customer concerns, and intake reading
              </CardDescription>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs w-fit"
                onClick={onToggleAdvanced}
              >
                {showAdvanced ? "Hide return / rework options" : "Show return / rework options"}
              </Button>
              <p className="max-w-[16rem] text-right text-[11px] text-muted-foreground">
                Optional: link this job to a previous visit for warranty or rework.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ServiceIntakeFields
            {...serviceIntakeProps}
            concernsFooter={concernsFooter ?? repeatVisitFooter}
          />
        </CardContent>
      </Card>

      {showAdvanced && (
        <div ref={advancedOptionsRef}>
          <Card
            className={`border overflow-hidden transition-colors ${isWarrantyRework ? "border-primary/30" : "border-border"}`}
          >
            <div className="border-b border-border/60 px-4 py-2 bg-muted/30">
              <p className="text-xs text-muted-foreground">
                Return / rework options — turn on below only when this visit is related to a previous job.
              </p>
            </div>
            <button
              type="button"
              className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${isWarrantyRework ? "bg-primary/5" : "hover:bg-muted/40"}`}
              onClick={onToggleWarrantyRework}
            >
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isWarrantyRework ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
              >
                <AlertCircle className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${isWarrantyRework ? "text-primary" : "text-foreground"}`}>
                  Return / rework job
                </p>
                <p className="text-xs text-muted-foreground">
                  {isWarrantyRework
                    ? "Link this job to a previous work order"
                    : "Optional — for warranty or repeat visits"}
                </p>
              </div>
              <span
                className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border transition-colors ${isWarrantyRework ? "border-primary bg-primary" : "border-border bg-muted"}`}
                aria-hidden
              >
                <span
                  className={`inline-block h-5 w-5 rounded-full border border-border bg-card shadow-sm transition-transform mt-0.5 ${isWarrantyRework ? "translate-x-5" : "translate-x-0.5"}`}
                />
              </span>
            </button>

            {isWarrantyRework && (
              <CardContent className="space-y-4 border-t border-border/60 pt-4 pb-4">
                {!vehicleId ? (
                  <p className="text-sm text-muted-foreground rounded-md bg-muted/50 px-3 py-2">
                    Select a vehicle above to see recent jobs.
                  </p>
                ) : (
                  <>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <label className="text-sm font-medium text-foreground">Previous job</label>
                      {selectedRelatedWorkOrderId && (
                        <button
                          type="button"
                          onClick={onToggleWorkOrderSearch}
                          className="text-xs font-medium text-primary hover:underline w-fit"
                        >
                          Search by ID
                        </button>
                      )}
                    </div>

                    {isLoadingRecentWorkOrders ? (
                      <div className="flex items-center justify-center gap-2 rounded-lg bg-muted/50 py-6 text-sm text-muted-foreground">
                        <PremiumIcons.Spinner className="h-4 w-4 animate-spin" />
                        Loading history…
                      </div>
                    ) : recentWorkOrders.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-52 overflow-y-auto">
                        {recentWorkOrders.map((wo) => (
                          <button
                            key={wo.id}
                            type="button"
                            onClick={() => onSelectRelatedWorkOrder(wo)}
                            className={`rounded-lg border p-3 text-left transition-all hover:shadow-sm ${
                              selectedRelatedWorkOrderId === wo.id
                                ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                                : "border-border bg-card hover:border-primary/30"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <span className="font-semibold text-sm text-foreground">
                                {wo.work_order_number}
                              </span>
                              <span className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">
                                {wo.days_ago !== null ? `${wo.days_ago}d` : "—"}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {wo.customer_concerns || "No description"}
                            </p>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-border py-5 text-center">
                        <p className="text-sm text-muted-foreground">No recent jobs for this vehicle.</p>
                        <Button
                          type="button"
                          variant="link"
                          size="sm"
                          className="mt-1 h-auto p-0"
                          onClick={onToggleWorkOrderSearch}
                        >
                          Search by work order ID
                        </Button>
                      </div>
                    )}

                    {(showWorkOrderSearch || (!recentWorkOrders.length && !isLoadingRecentWorkOrders)) && (
                      <div className="flex gap-2 max-w-md">
                        <Input
                          type="text"
                          placeholder="Work order number…"
                          value={workOrderSearchQuery}
                          onChange={(e) => onWorkOrderSearchQueryChange(e.target.value)}
                        />
                        {showWorkOrderSearch && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="shrink-0"
                            onClick={onClearWorkOrderSearch}
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    )}

                    {selectedRelatedWorkOrderId && (
                      <div className="space-y-1.5 max-w-2xl">
                        <label htmlFor="warranty_reason" className="text-sm font-medium text-foreground">
                          Reason for rework <span className="text-destructive">*</span>
                        </label>
                        <Textarea
                          id="warranty_reason"
                          value={warrantyReason}
                          onChange={(e) => onWarrantyReasonChange(e.target.value)}
                          placeholder="e.g. Issue persisted, part failure"
                          rows={2}
                          className={`resize-none ${!warrantyReason.trim() ? "border-primary/50 focus-visible:ring-primary/30" : ""}`}
                        />
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
