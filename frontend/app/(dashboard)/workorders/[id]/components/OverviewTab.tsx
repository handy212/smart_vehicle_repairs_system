"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { User, Car, Calendar, AlertCircle, Link as LinkIcon, FileText, Edit2, Save, X, Sparkles, TrendingUp, ShieldCheck, Microscope } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { workordersApi } from "@/lib/api/workorders";
import { adminApi } from "@/lib/api/admin";
import { useToast } from "@/lib/hooks/useToast";

import { useCurrency } from "@/lib/hooks/useCurrency";
interface OverviewTabProps {

  workOrder: any;
  onStatusChange?: () => void;
}

export default function WorkOrderOverviewTab({
  workOrder, onStatusChange }: OverviewTabProps) {
  const { formatCurrency } = useCurrency();
  const estimateSummary = (workOrder as any).estimate_summary;
  const invoiceSummary = (workOrder as any).invoice_summary;
  const displayedEstimatedTotal = parseFloat(
    estimateSummary?.total || (workOrder as any).estimated_total || workOrder.total_cost || "0"
  );
  const [isEditingServiceCoordinator, setIsEditingServiceCoordinator] = useState(false);
  const [selectedServiceCoordinator, setSelectedServiceCoordinator] = useState<string>(() => {
    const sc = workOrder?.service_coordinator;
    if (!sc || sc === null) return "";
    if (typeof sc === "object" && "id" in sc) {
      return String(sc.id);
    }
    if (typeof sc === "number") {
      return String(sc);
    }
    return "";
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const workOrderId = workOrder?.id;

  // Fetch service coordinators
  const { data: serviceCoordinators } = useQuery({
    queryKey: ["service-coordinators"],
    queryFn: () => adminApi.users.serviceCoordinators(),
  });

  // Fetch AI Service Prediction
  const { data: prediction } = useQuery({
    queryKey: ["workorder-prediction", workOrderId],
    queryFn: () => workordersApi.predictService(workOrderId),
    enabled: !!workOrderId && !!workOrder?.vehicle?.id,
  });

  const serviceCoordinatorsList = serviceCoordinators || [];

  // Update service coordinator mutation
  const updateServiceCoordinatorMutation = useMutation({
    mutationFn: async (serviceCoordinatorId: number | null) => {
      if (!workOrderId) throw new Error("Work order ID is required");
      return workordersApi.update(workOrderId, {
        service_coordinator: serviceCoordinatorId || undefined
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workorder", workOrderId] });
      setIsEditingServiceCoordinator(false);
      toast({
        title: "Success",
        description: "Service Coordinator assigned successfully",
        variant: "success",
      });
      onStatusChange?.();
    },

    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.error || error.response?.data?.detail || "Failed to assign Service Coordinator",
        variant: "destructive",
      });
    },
  });

  const handleSaveServiceCoordinator = () => {
    const scId = selectedServiceCoordinator ? Number(selectedServiceCoordinator) : null;
    updateServiceCoordinatorMutation.mutate(scId);
  };

  const handleCancelEdit = () => {
    setSelectedServiceCoordinator(() => {
      const sc = workOrder?.service_coordinator;
      if (!sc || sc === null) return "";
      if (typeof sc === "object" && "id" in sc) {
        return String(sc.id);
      }
      if (typeof sc === "number") {
        return String(sc);
      }
      return "";
    });
    setIsEditingServiceCoordinator(false);
  };

  const getServiceCoordinatorName = () => {
    if (workOrder?.service_coordinator_name) return workOrder.service_coordinator_name;
    const sc = workOrder?.service_coordinator;
    if (!sc) return "Not assigned";
    if (typeof sc === "object" && sc !== null) {
      // Try full_name first, then fallback to first_name + last_name
      if (sc.full_name) return sc.full_name;
      if (sc.first_name || sc.last_name) {
        return `${sc.first_name || ''} ${sc.last_name || ''}`.trim() || "Not assigned";
      }
      return "Not assigned";
    }
    // If it's just an ID, try to find in the list

    const coordinator = serviceCoordinatorsList.find((c: any) => c.id === sc);
    if (coordinator) {
      // Try full_name first, then fallback to first_name + last_name
      if (coordinator.full_name) return coordinator.full_name;
      if (coordinator.first_name || coordinator.last_name) {
        return `${coordinator.first_name || ''} ${coordinator.last_name || ''}`.trim() || "Not assigned";
      }
    }
    return "Not assigned";
  };

  const canEditServiceCoordinator = workOrder?.status === "intake" || workOrder?.status === "draft" || workOrder?.status === "inspection";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left Column - Work Order Info */}
      <div className="lg:col-span-2 space-y-6">
        {/* Customer & Vehicle */}
        <Card>
          <CardHeader>
            <CardTitle>Customer & Vehicle</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Customer */}
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <User className="w-5 h-5 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-card-foreground">Customer</h3>
                </div>
                {workOrder.customer ? (
                  <>
                    <div>
                      {typeof workOrder.customer === "object" && workOrder.customer !== null ? (
                        <Link
                          href={`/customers/${workOrder.customer.id}`}
                          className="text-base font-medium text-primary transition-colors hover:text-primary/80"
                        >
                          {workOrder.customer.full_name || workOrder.customer_name || "View Customer"}
                        </Link>
                      ) : (
                        <Link
                          href={`/customers/${workOrder.customer}`}
                          className="text-base font-medium text-primary transition-colors hover:text-primary/80"
                        >
                          {workOrder.customer_name || "View Customer"}
                        </Link>
                      )}
                    </div>
                    {typeof workOrder.customer === "object" && workOrder.customer !== null && (
                      <div className="p-3 bg-muted rounded-md border border-border space-y-2">
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                          Customer Information
                        </div>
                        <div className="space-y-2 text-sm">
                          {workOrder.customer.phone && (
                            <div className="flex items-start">
                              <span className="font-medium text-card-foreground w-20 flex-shrink-0">Phone:</span>
                              <span className="text-foreground">{workOrder.customer.phone}</span>
                            </div>
                          )}
                          {workOrder.customer.email && (
                            <div className="flex items-start">
                              <span className="font-medium text-card-foreground w-20 flex-shrink-0">Email:</span>
                              <span className="text-foreground break-words">{workOrder.customer.email}</span>
                            </div>
                          )}
                          {workOrder.customer.customer_type && (
                            <div className="flex items-start">
                              <span className="font-medium text-card-foreground w-20 flex-shrink-0">Type:</span>
                              <span className="text-foreground capitalize">
                                {workOrder.customer.customer_type.replace('_', ' ')}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-foreground">{workOrder.customer_name || "-"}</p>
                )}
              </div>

              {/* Vehicle */}
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Car className="w-5 h-5 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-card-foreground">Vehicle</h3>
                </div>
                {workOrder.vehicle ? (
                  <>
                    <div>
                      {typeof workOrder.vehicle === "object" && workOrder.vehicle !== null ? (
                        <Link
                          href={`/vehicles/${workOrder.vehicle.id}`}
                          className="text-base font-medium text-primary transition-colors hover:text-primary/80"
                        >
                          {workOrder.vehicle.year} {workOrder.vehicle.make} {workOrder.vehicle.model}
                        </Link>
                      ) : (
                        <Link
                          href={`/vehicles/${workOrder.vehicle}`}
                          className="text-base font-medium text-primary transition-colors hover:text-primary/80"
                        >
                          {workOrder.vehicle_info || "View Vehicle"}
                        </Link>
                      )}
                    </div>
                    {typeof workOrder.vehicle === "object" && workOrder.vehicle !== null && (
                      <div className="p-3 bg-muted rounded-md border border-border space-y-2">
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                          Vehicle Info
                        </div>
                        <div className="space-y-2 text-sm">
                          <div className="flex items-start">
                            <span className="font-medium text-card-foreground w-24 flex-shrink-0">Make/Model:</span>
                            <span className="text-foreground">
                              {workOrder.vehicle.make} {workOrder.vehicle.model} {workOrder.vehicle.year}
                            </span>
                          </div>
                          {workOrder.vehicle.license_plate && (
                            <div className="flex items-start">
                              <span className="font-medium text-card-foreground w-24 flex-shrink-0">License:</span>
                              <span className="text-foreground">{workOrder.vehicle.license_plate}</span>
                            </div>
                          )}
                          {workOrder.vehicle.vin && (
                            <div className="flex items-start">
                              <span className="font-medium text-card-foreground w-24 flex-shrink-0">VIN:</span>
                              <span className="text-foreground font-mono text-xs break-all">{workOrder.vehicle.vin}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-foreground">{workOrder.vehicle_info || "-"}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>


        {/* Customer Concerns */}
        {workOrder.customer_concerns && (
          <Card>
            <CardHeader>
              <CardTitle>Customer Concerns</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-foreground whitespace-pre-wrap">
                {workOrder.customer_concerns}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Diagnosis Notes */}

        {(workOrder as any).diagnosis_notes && (
          <Card>
            <CardHeader>
              <CardTitle>Diagnosis Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-foreground whitespace-pre-wrap">

                {(workOrder as any).diagnosis_notes}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Special Instructions */}

        {(workOrder as any).special_instructions && (
          <Card>
            <CardHeader>
              <CardTitle>Special Instructions</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-foreground whitespace-pre-wrap">

                {(workOrder as any).special_instructions}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Related Work Orders / Warranty Rework */}

        {((workOrder as any).is_warranty_rework || (workOrder as any).related_work_order_detail || ((workOrder as any).rework_work_orders && (workOrder as any).rework_work_orders.length > 0)) && (
          <Card className="border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <AlertCircle className="w-5 h-5 text-primary" />
                <span>Related Work Orders</span>

                {(workOrder as any).is_warranty_rework && (
                  <Badge variant="warning" className="ml-2">Warranty Rework</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Original Work Order (if this is a rework) */}

              {(workOrder as any).related_work_order_detail && (
                <div className="rounded-md border border-primary/15 bg-primary/5 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <LinkIcon className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium text-foreground">
                        Original Work Order
                      </span>
                    </div>

                    <Link href={`/workorders/${(workOrder as any).related_work_order_detail.id}`}>
                      <Badge variant="secondary" className="cursor-pointer border border-primary/20 hover:bg-primary/10">
                        View
                      </Badge>
                    </Link>
                  </div>
                  <div className="space-y-1 text-sm">
                    <p className="font-mono text-foreground">

                      {(workOrder as any).related_work_order_detail.work_order_number}
                    </p>

                    {(workOrder as any).related_work_order_detail.completed_at && (
                      <p className="text-xs text-muted-foreground">

                        Completed: {format(new Date((workOrder as any).related_work_order_detail.completed_at), "MMM dd, yyyy")}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground capitalize">

                      Status: {(workOrder as any).related_work_order_detail.status.replace(/_/g, " ")}
                    </p>
                  </div>

                  {(workOrder as any).warranty_reason && (
                    <div className="mt-2 border-t border-primary/15 pt-2">
                      <p className="text-xs font-medium text-card-foreground mb-1">Warranty Reason:</p>
                      <p className="text-xs text-muted-foreground">

                        {(workOrder as any).warranty_reason}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Rework Work Orders (if this work order has been reworked) */}

              {(workOrder as any).rework_work_orders && (workOrder as any).rework_work_orders.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-card-foreground mb-2">

                    Subsequent Rework(s) ({((workOrder as any).rework_work_orders as any[]).length}):
                  </p>
                  <div className="space-y-2">

                    {((workOrder as any).rework_work_orders as any[]).map((rework: any) => (
                      <div key={rework.id} className="p-2 bg-muted rounded-md border border-border">
                        <div className="flex items-center justify-between">
                          <div>
                            <Link
                              href={`/workorders/${rework.id}`}
                              className="font-mono text-sm text-primary hover:underline"
                            >
                              {rework.work_order_number}
                            </Link>
                            <p className="text-xs text-muted-foreground">
                              Created: {format(new Date(rework.created_at), "MMM dd, yyyy")}
                            </p>
                          </div>
                          <Badge variant="secondary" className="text-xs capitalize">
                            {rework.status.replace(/_/g, " ")}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Right Column - Summary & Actions */}
      <div className="space-y-6">
        {/* Financial Summary */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Financial Summary</CardTitle>
              <div className="flex items-center gap-2">
                {estimateSummary?.id && (
                  <Link href={`/billing/estimates/${estimateSummary.id}`}>
                    <Button variant="ghost" size="sm" className="h-7 text-xs">
                      <FileText className="w-3 h-3 mr-1" />
                      Quote
                    </Button>
                  </Link>
                )}
                {invoiceSummary?.id && (
                  <Link href={`/billing/invoices/${invoiceSummary.id}`}>
                    <Button variant="ghost" size="sm" className="h-7 text-xs">
                      <FileText className="w-3 h-3 mr-1" />
                      Invoice
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {estimateSummary && (
              <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Stores Quote</p>
                    <p className="text-sm font-medium text-foreground">{estimateSummary.estimate_number}</p>
                  </div>
                  <Badge variant="outline" className="capitalize">
                    {estimateSummary.status.replace(/_/g, " ")}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Quoted Total</span>
                  <span className="font-semibold text-foreground">
                    {formatCurrency(parseFloat(estimateSummary.total || "0"))}
                  </span>
                </div>
              </div>
            )}

            {invoiceSummary && (
              <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Invoice</p>
                    <p className="text-sm font-medium text-foreground">{invoiceSummary.invoice_number}</p>
                  </div>
                  <Badge variant={invoiceSummary.status === "paid" ? "success" : "outline"} className="capitalize">
                    {invoiceSummary.status.replace(/_/g, " ")}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Total</span>
                    <span className="font-medium text-foreground">
                      {formatCurrency(parseFloat(invoiceSummary.total || "0"))}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Paid</span>
                    <span className="font-medium text-foreground">
                      {formatCurrency(parseFloat(invoiceSummary.amount_paid || "0"))}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Estimated Labor</span>
              <span className="text-sm font-medium text-foreground">

                {formatCurrency(parseFloat((workOrder as any).estimated_labor_cost || "0"))}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Estimated Parts</span>
              <span className="text-sm font-medium text-foreground">

                {formatCurrency(parseFloat((workOrder as any).estimated_parts_cost || "0"))}
              </span>
            </div>
            <div className="border-t border-border pt-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-card-foreground">Estimated Total</span>

                <span className={`text-lg font-bold ${displayedEstimatedTotal > 0
                  ? "text-foreground"
                  : "text-muted-foreground"
                  }`}>

                  {formatCurrency(displayedEstimatedTotal)}
                </span>
              </div>
            </div>

            {(workOrder as any).actual_total && parseFloat((workOrder as any).actual_total) > 0 && (
              <>
                <div className="border-t border-border pt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-card-foreground">Actual Labor</span>
                    <span className="text-sm font-medium text-foreground">

                      {formatCurrency(parseFloat((workOrder as any).actual_labor_cost || "0"))}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-card-foreground">Actual Parts</span>
                    <span className="text-sm font-medium text-foreground">

                      {formatCurrency(parseFloat((workOrder as any).actual_parts_cost || "0"))}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <span className="text-sm font-semibold text-foreground">Actual Total</span>
                    <span className="text-lg font-bold text-foreground">

                      {formatCurrency(parseFloat((workOrder as any).actual_total))}
                    </span>
                  </div>
                </div>

                {displayedEstimatedTotal > 0 && (
                  <div className="pt-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Variance</span>

                      <span className={`font-medium ${parseFloat((workOrder as any).actual_total) > displayedEstimatedTotal
                        ? "text-destructive dark:text-red-400"
                        : "text-success"
                        }`}>

                        {parseFloat((workOrder as any).actual_total) > displayedEstimatedTotal ? "+" : ""}

                        {formatCurrency(parseFloat((workOrder as any).actual_total) - displayedEstimatedTotal)}
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Work Order Info */}
        <Card>
          <CardHeader>
            <CardTitle>Work Order Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground">Work Order Number</p>
              <p className="text-sm font-mono">{workOrder.work_order_number}</p>
            </div>
            {workOrder.created_at && (
              <div>
                <p className="text-xs text-muted-foreground">Created</p>
                <p className="text-sm">
                  {format(new Date(workOrder.created_at), "MMM dd, yyyy 'at' h:mm a")}
                </p>
              </div>
            )}

            {(workOrder as any).estimated_completion && (
              <div>
                <p className="text-xs text-muted-foreground">Estimated Completion</p>
                <p className="text-sm">

                  {format(new Date((workOrder as any).estimated_completion), "MMM dd, yyyy 'at' h:mm a")}
                </p>
              </div>
            )}

            {(workOrder as any).primary_technician_name && (
              <div>
                <p className="text-xs text-muted-foreground">Primary Technician</p>

                <p className="text-sm">{(workOrder as any).primary_technician_name}</p>
              </div>
            )}

            {/* Service Coordinator */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground">
                  Service Coordinator {!workOrder?.service_coordinator && <span className="text-destructive">*</span>}
                </p>
                {canEditServiceCoordinator && !isEditingServiceCoordinator && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEditingServiceCoordinator(true)}
                    className="h-6 px-2 text-xs"
                  >
                    <Edit2 className="w-3 h-3 mr-1" />
                    Edit
                  </Button>
                )}
              </div>

              {isEditingServiceCoordinator ? (
                <div className="space-y-2">
                  <select
                    value={selectedServiceCoordinator}
                    onChange={(e) => setSelectedServiceCoordinator(e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-muted border-border text-foreground"
                  >
                    <option value="">Select Service Coordinator</option>

                    {serviceCoordinatorsList.map((coord: any) => (
                      <option key={coord.id} value={String(coord.id)}>
                        {coord.full_name || `${coord.first_name || ''} ${coord.last_name || ''}`.trim() || `User ${coord.id}`}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleSaveServiceCoordinator}
                      disabled={updateServiceCoordinatorMutation.isPending}
                      className="h-7 px-2 text-xs"
                    >
                      <Save className="w-3 h-3 mr-1" />
                      Save
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleCancelEdit}
                      disabled={updateServiceCoordinatorMutation.isPending}
                      className="h-7 px-2 text-xs"
                    >
                      <X className="w-3 h-3 mr-1" />
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <p className={`text-sm ${!workOrder?.service_coordinator ? "text-destructive font-medium" : ""}`}>
                  {getServiceCoordinatorName()}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* AI Predictive Maintenance Card */}
        {prediction && !prediction.message && (
          <Card className="border-purple-200 bg-purple-50/10 overflow-hidden">
            <div className="bg-purple-600 h-1 w-full" />
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center text-purple-900 group">
                  <Sparkles className="w-4 h-4 mr-2 text-primary group-hover:animate-pulse" />
                  Smart Health Prediction
                </CardTitle>
                <Badge variant="outline" className="bg-purple-100 text-purple-700 border-purple-200 text-[10px] uppercase font-bold tracking-wider">
                  AI-Powered
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-white rounded-lg border border-purple-100 shadow-sm">
                  <div className="flex items-center text-xs text-primary mb-1">
                    <Calendar className="w-3 h-3 mr-1" />
                    Projected Date
                  </div>
                  <p className="text-sm font-bold text-gray-900">
                    {prediction.predicted_date}
                  </p>
                </div>
                <div className="p-3 bg-white rounded-lg border border-purple-100 shadow-sm">
                  <div className="flex items-center text-xs text-primary mb-1">
                    <TrendingUp className="w-3 h-3 mr-1" />
                    Target Odometer
                  </div>
                  <p className="text-sm font-bold text-gray-900">
                    {prediction.predicted_odometer.toLocaleString()} km
                  </p>
                </div>
              </div>

              <div className="p-3 bg-white rounded-lg border border-purple-100 italic space-y-2">
                <div className="flex items-start gap-2">
                  <Microscope className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-purple-900 leading-relaxed">
                    {prediction.recommendation}
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-[10px] uppercase tracking-wider font-semibold text-primary">
                  <span>Prediction Confidence</span>
                  <span>{Math.round(prediction.confidence_score * 100)}%</span>
                </div>
                <div className="h-1.5 bg-purple-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-600 transition-all duration-1000"
                    style={{ width: `${prediction.confidence_score * 100}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-center pt-2">
                <p className="text-[10px] text-muted-foreground flex items-center">
                  <ShieldCheck className="w-3 h-3 mr-1 text-success" />
                  Verified by Vehicle Repair History Analysis
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div >
  );
}
