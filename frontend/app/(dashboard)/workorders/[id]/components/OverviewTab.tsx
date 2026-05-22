"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  User,
  Car,
  AlertCircle,
  Link as LinkIcon,
  FileText,
  Edit2,
  Save,
  X,
  Phone,
  Gauge,
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { workordersApi, type WorkOrder } from "@/lib/api/workorders";
import { adminApi } from "@/lib/api/admin";
import { useToast } from "@/lib/hooks/useToast";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { EstimatedNextServiceCallout } from "./EstimatedNextServiceCallout";
import {
  canCreateWorkOrderInvoice,
  getInvoicePaymentDisplay,
} from "@/lib/workorders/invoiceSummaryDisplay";

interface OverviewTabProps {
  workOrder: any;
  onStatusChange?: () => void;
}

function SummaryItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-[120px] flex-1">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-0.5 text-sm text-foreground">{children}</div>
    </div>
  );
}

export default function WorkOrderOverviewTab({
  workOrder,
  onStatusChange,
}: OverviewTabProps) {
  const { formatCurrency } = useCurrency();
  const workOrderId = workOrder?.id;
  const { data: workOrderFresh } = useQuery({
    queryKey: ["workorder", workOrderId],
    queryFn: () => workordersApi.get(workOrderId!),
    enabled: !!workOrderId,
    initialData: workOrder,
    refetchOnWindowFocus: true,
  });
  const wo = workOrderFresh ?? workOrder;
  const estimateSummary = wo.estimate_summary;
  const invoiceSummary = wo.invoice_summary;
  const canCreateInvoice = canCreateWorkOrderInvoice(wo);
  const relatedInvoices: NonNullable<WorkOrder["related_invoices"]> = wo.related_invoices ?? [];
  const invoicePayment = getInvoicePaymentDisplay(invoiceSummary, wo.status);
  const displayedEstimatedTotal = parseFloat(wo.estimated_total || "0");
  const [isEditingServiceCoordinator, setIsEditingServiceCoordinator] = useState(false);
  const [selectedServiceCoordinator, setSelectedServiceCoordinator] = useState<string>(() => {
    const sc = workOrder?.service_coordinator;
    if (!sc || sc === null) return "";
    if (typeof sc === "object" && "id" in sc) return String(sc.id);
    if (typeof sc === "number") return String(sc);
    return "";
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: serviceCoordinators } = useQuery({
    queryKey: ["service-coordinators"],
    queryFn: () => adminApi.users.serviceCoordinators(),
  });

  const serviceCoordinatorsList = serviceCoordinators || [];

  const hasVehicle =
    workOrder?.vehicle != null &&
    workOrder?.vehicle !== "" &&
    (typeof workOrder.vehicle === "object" ? !!workOrder.vehicle.id : true);

  const updateServiceCoordinatorMutation = useMutation({
    mutationFn: async (serviceCoordinatorId: number | null) => {
      if (!workOrderId) throw new Error("Work order ID is required");
      return workordersApi.update(workOrderId, {
        service_coordinator: serviceCoordinatorId || undefined,
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
        description:
          error.response?.data?.error ||
          error.response?.data?.detail ||
          "Failed to assign Service Coordinator",
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
      if (typeof sc === "object" && "id" in sc) return String(sc.id);
      if (typeof sc === "number") return String(sc);
      return "";
    });
    setIsEditingServiceCoordinator(false);
  };

  const getServiceCoordinatorName = () => {
    if (workOrder?.service_coordinator_name) return workOrder.service_coordinator_name;
    const sc = workOrder?.service_coordinator;
    if (!sc) return "Not assigned";
    if (typeof sc === "object" && sc !== null) {
      if (sc.full_name) return sc.full_name;
      if (sc.first_name || sc.last_name) {
        return `${sc.first_name || ""} ${sc.last_name || ""}`.trim() || "Not assigned";
      }
      return "Not assigned";
    }
    const coordinator = serviceCoordinatorsList.find((c: any) => c.id === sc);
    if (coordinator) {
      if (coordinator.full_name) return coordinator.full_name;
      if (coordinator.first_name || coordinator.last_name) {
        return `${coordinator.first_name || ""} ${coordinator.last_name || ""}`.trim() ||
          "Not assigned";
      }
    }
    return "Not assigned";
  };

  const canEditServiceCoordinator =
    workOrder?.status === "intake" ||
    workOrder?.status === "draft" ||
    workOrder?.status === "inspection";

  const customerId =
    typeof workOrder.customer === "object"
      ? workOrder.customer?.id
      : workOrder.customer;
  const vehicleId =
    typeof workOrder.vehicle === "object" ? workOrder.vehicle?.id : workOrder.vehicle;
  const customerPhone =
    typeof workOrder.customer === "object" ? workOrder.customer?.phone : null;
  const vehiclePlate =
    typeof workOrder.vehicle === "object" ? workOrder.vehicle?.license_plate : null;
  const vehicleVin =
    typeof workOrder.vehicle === "object" ? workOrder.vehicle?.vin : null;

  const hasRelatedWork =
    workOrder.is_warranty_rework ||
    workOrder.related_work_order_detail ||
    (workOrder.rework_work_orders && workOrder.rework_work_orders.length > 0);

  const actualTotal = parseFloat(workOrder.actual_total || "0");
  const variance =
    actualTotal > 0 && displayedEstimatedTotal > 0
      ? actualTotal - displayedEstimatedTotal
      : null;

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <Card className="border-border shadow-sm">
        <CardContent className="flex flex-wrap gap-4 px-4 py-3">
          <SummaryItem label="Customer">
            {customerId ? (
              <Link href={`/customers/${customerId}`} className="font-medium text-primary hover:underline">
                {workOrder.customer_name ||
                  (typeof workOrder.customer === "object"
                    ? workOrder.customer.full_name
                    : "View customer")}
              </Link>
            ) : (
              <span>{workOrder.customer_name || "—"}</span>
            )}
          </SummaryItem>
          <SummaryItem label="Phone">
            <span className="flex items-center gap-1">
              {customerPhone ? (
                <>
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  {customerPhone}
                </>
              ) : (
                "—"
              )}
            </span>
          </SummaryItem>
          <SummaryItem label="Vehicle">
            {vehicleId ? (
              <Link href={`/vehicles/${vehicleId}`} className="font-medium text-primary hover:underline">
                {workOrder.vehicle_info ||
                  (typeof workOrder.vehicle === "object"
                    ? `${workOrder.vehicle.year} ${workOrder.vehicle.make} ${workOrder.vehicle.model}`
                    : "View vehicle")}
              </Link>
            ) : (
              <span>{workOrder.vehicle_info || "—"}</span>
            )}
          </SummaryItem>
          <SummaryItem label="Plate / VIN">
            <span className="font-mono text-xs">
              {[vehiclePlate, vehicleVin].filter(Boolean).join(" · ") || "—"}
            </span>
          </SummaryItem>
          <SummaryItem label="Odometer">
            <span className="flex items-center gap-1">
              <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
              {workOrder.odometer_in != null ? `${Number(workOrder.odometer_in).toLocaleString()} in` : "—"}
              {workOrder.odometer_out != null && (
                <span className="text-muted-foreground">
                  {" "}
                  / {Number(workOrder.odometer_out).toLocaleString()} out
                </span>
              )}
            </span>
          </SummaryItem>
          <SummaryItem label="Coordinator">
            <span className={!workOrder?.service_coordinator ? "text-destructive" : ""}>
              {getServiceCoordinatorName()}
            </span>
          </SummaryItem>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-4">
          {/* Customer & vehicle — definition list */}
          <Card>
            <CardHeader className="px-4 py-3">
              <CardTitle className="text-sm font-semibold">Customer & vehicle</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted-foreground">Customer</dt>
                  <dd className="mt-0.5 font-medium">
                    {customerId ? (
                      <Link href={`/customers/${customerId}`} className="text-primary hover:underline">
                        {workOrder.customer_name || "View customer"}
                      </Link>
                    ) : (
                      workOrder.customer_name || "—"
                    )}
                  </dd>
                </div>
                {customerPhone && (
                  <div>
                    <dt className="text-xs text-muted-foreground">Phone</dt>
                    <dd className="mt-0.5">{customerPhone}</dd>
                  </div>
                )}
                {typeof workOrder.customer === "object" && workOrder.customer?.email && (
                  <div>
                    <dt className="text-xs text-muted-foreground">Email</dt>
                    <dd className="mt-0.5 break-all">{workOrder.customer.email}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-xs text-muted-foreground">Vehicle</dt>
                  <dd className="mt-0.5 font-medium">
                    {vehicleId ? (
                      <Link href={`/vehicles/${vehicleId}`} className="text-primary hover:underline">
                        {workOrder.vehicle_info || "View vehicle"}
                      </Link>
                    ) : (
                      workOrder.vehicle_info || "—"
                    )}
                  </dd>
                </div>
                {vehiclePlate && (
                  <div>
                    <dt className="text-xs text-muted-foreground">License</dt>
                    <dd className="mt-0.5">{vehiclePlate}</dd>
                  </div>
                )}
                {vehicleVin && (
                  <div>
                    <dt className="text-xs text-muted-foreground">VIN</dt>
                    <dd className="mt-0.5 font-mono text-xs break-all">{vehicleVin}</dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>

          {/* Job details accordion */}
          <Card>
            <CardHeader className="px-4 py-3">
              <CardTitle className="text-sm font-semibold">Job details</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <Accordion type="multiple" defaultValue={["concerns"]} className="w-full">
                <AccordionItem value="concerns" className="border-b-0">
                  <AccordionTrigger className="py-2 text-sm hover:no-underline">
                    Customer concerns
                  </AccordionTrigger>
                  <AccordionContent>
                    <p className="whitespace-pre-wrap text-sm text-foreground">
                      {workOrder.customer_concerns || "No concerns recorded."}
                    </p>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="diagnosis" className="border-b-0">
                  <AccordionTrigger className="py-2 text-sm hover:no-underline">
                    Diagnosis notes
                  </AccordionTrigger>
                  <AccordionContent>
                    <p className="whitespace-pre-wrap text-sm text-foreground">
                      {workOrder.diagnosis_notes || "No diagnosis notes yet."}
                    </p>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="instructions" className="border-b-0">
                  <AccordionTrigger className="py-2 text-sm hover:no-underline">
                    Special instructions
                  </AccordionTrigger>
                  <AccordionContent>
                    <p className="whitespace-pre-wrap text-sm text-foreground">
                      {workOrder.special_instructions || "None."}
                    </p>
                  </AccordionContent>
                </AccordionItem>
                {hasRelatedWork && (
                  <AccordionItem value="related">
                    <AccordionTrigger className="py-2 text-sm hover:no-underline">
                      Related / warranty rework
                      {workOrder.is_warranty_rework && (
                        <Badge variant="warning" className="ml-2 h-5 text-[10px]">
                          Warranty
                        </Badge>
                      )}
                    </AccordionTrigger>
                    <AccordionContent className="space-y-3">
                      {workOrder.related_work_order_detail && (
                        <div className="rounded-md border border-primary/15 bg-primary/5 p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <span className="flex items-center gap-2 text-sm font-medium">
                              <LinkIcon className="h-4 w-4 text-primary" />
                              Original work order
                            </span>
                            <Link href={`/workorders/${workOrder.related_work_order_detail.id}`}>
                              <Badge variant="secondary" className="cursor-pointer text-xs">
                                View
                              </Badge>
                            </Link>
                          </div>
                          <p className="font-mono text-sm">
                            {workOrder.related_work_order_detail.work_order_number}
                          </p>
                          {workOrder.related_work_order_detail.completed_at && (
                            <p className="text-xs text-muted-foreground">
                              Completed:{" "}
                              {format(
                                new Date(workOrder.related_work_order_detail.completed_at),
                                "MMM dd, yyyy"
                              )}
                            </p>
                          )}
                          {workOrder.warranty_reason && (
                            <p className="mt-2 border-t border-primary/15 pt-2 text-xs text-muted-foreground">
                              {workOrder.warranty_reason}
                            </p>
                          )}
                        </div>
                      )}
                      {workOrder.rework_work_orders?.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">
                            Subsequent rework ({workOrder.rework_work_orders.length})
                          </p>
                          {workOrder.rework_work_orders.map((rework: any) => (
                            <div
                              key={rework.id}
                              className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2"
                            >
                              <div>
                                <Link
                                  href={`/workorders/${rework.id}`}
                                  className="font-mono text-sm text-primary hover:underline"
                                >
                                  {rework.work_order_number}
                                </Link>
                                <p className="text-xs text-muted-foreground">
                                  {format(new Date(rework.created_at), "MMM dd, yyyy")}
                                </p>
                              </div>
                              <Badge variant="secondary" className="text-xs capitalize">
                                {rework.status.replace(/_/g, " ")}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                )}
              </Accordion>
            </CardContent>
          </Card>
        </div>

        {/* Right rail */}
        <div className="space-y-4 lg:w-72">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 px-4 py-3">
              <CardTitle className="text-sm font-semibold">Financial</CardTitle>
              <div className="flex gap-1">
                {estimateSummary?.id && (
                  <Link href={`/billing/estimates/${estimateSummary.id}`}>
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Quote">
                      <FileText className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                )}
                {invoiceSummary?.id ? (
                  <Link href={`/billing/invoices/${invoiceSummary.id}`}>
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Invoice">
                      <FileText className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                ) : canCreateInvoice ? (
                  <Link href={`/billing/invoices/new?work_order=${workOrderId}`}>
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-primary">
                      <FileText className="w-3 h-3 mr-1" />
                      Create Invoice
                    </Button>
                  </Link>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-2 px-4 pb-4 pt-0 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Estimated</span>
                <span className="font-medium">{formatCurrency(displayedEstimatedTotal)}</span>
              </div>
              {actualTotal > 0 && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Actual</span>
                    <span className="font-medium">{formatCurrency(actualTotal)}</span>
                  </div>
                  {variance !== null && (
                    <div className="flex justify-between border-t border-border pt-2 text-xs">
                      <span className="text-muted-foreground">Variance</span>
                      <span
                        className={
                          variance > 0 ? "font-medium text-destructive" : "font-medium text-success"
                        }
                      >
                        {variance > 0 ? "+" : ""}
                        {formatCurrency(variance)}
                      </span>
                    </div>
                  )}
                </>
              )}
              {estimateSummary && (
                <p className="text-xs text-muted-foreground">
                  Quote {estimateSummary.estimate_number} ·{" "}
                  {formatCurrency(parseFloat(estimateSummary.total || "0"))}
                </p>
              )}
              {invoiceSummary?.id && (
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p>
                    Invoice{" "}
                    <Link
                      href={`/billing/invoices/${invoiceSummary.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {invoiceSummary.invoice_number}
                    </Link>
                    {" · "}
                    {formatCurrency(parseFloat(invoiceSummary.total || "0"))}
                  </p>
                  {invoicePayment ? (
                    <p>
                      <Badge variant={invoicePayment.badgeVariant} className="mr-1 text-[10px]">
                        {invoicePayment.paymentLabel}
                      </Badge>
                      <span className="capitalize">Document: {invoicePayment.documentStatus}</span>
                    </p>
                  ) : null}
                  {invoiceSummary.amount_paid != null && parseFloat(invoiceSummary.amount_paid) > 0 ? (
                    <p>
                      Paid {formatCurrency(parseFloat(invoiceSummary.amount_paid))}
                      {invoiceSummary.amount_due != null &&
                      parseFloat(invoiceSummary.amount_due) > 0.01 ? (
                        <> · Due {formatCurrency(parseFloat(invoiceSummary.amount_due))}</>
                      ) : null}
                    </p>
                  ) : null}
                  {wo.status !== "invoiced" && wo.status !== "closed" ? (
                    <p>
                      Work order is still <span className="capitalize">{wo.status.replace(/_/g, " ")}</span>
                      {invoicePayment?.paymentLabel.startsWith("Paid")
                        ? " — when payment is complete, status should move to Invoiced automatically."
                        : invoicePayment?.canMarkWorkOrderInvoiced
                          ? " — paying in full auto-marks Invoiced, or use Mark work order invoiced after issuing."
                          : invoicePayment?.markBlockedReason
                            ? ` — ${invoicePayment.markBlockedReason}`
                            : null}
                    </p>
                  ) : null}
                </div>
              )}
              {relatedInvoices.length > 0 && (
                <div className="border-t border-border pt-2 space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Invoice history
                  </p>
                  {relatedInvoices.map((inv) => (
                    <p key={inv.id} className="text-xs text-muted-foreground">
                      <Link
                        href={`/billing/invoices/${inv.id}`}
                        className="text-primary hover:underline"
                      >
                        {inv.invoice_number}
                      </Link>
                      {" · "}
                      {formatCurrency(parseFloat(inv.total || "0"))}
                      <span className="ml-1 capitalize">({inv.status.replace(/_/g, " ")})</span>
                    </p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="px-4 py-3">
              <CardTitle className="text-sm font-semibold">Assignment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 px-4 pb-4 pt-0 text-sm">
              {workOrder.primary_technician_name && (
                <div>
                  <p className="text-xs text-muted-foreground">Technician</p>
                  <p>{workOrder.primary_technician_name}</p>
                </div>
              )}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Coordinator {!workOrder?.service_coordinator && "*"}
                  </p>
                  {canEditServiceCoordinator && !isEditingServiceCoordinator && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsEditingServiceCoordinator(true)}
                      className="h-6 px-2 text-xs"
                    >
                      <Edit2 className="mr-1 h-3 w-3" />
                      Edit
                    </Button>
                  )}
                </div>
                {isEditingServiceCoordinator ? (
                  <div className="space-y-2">
                    <select
                      value={selectedServiceCoordinator}
                      onChange={(e) => setSelectedServiceCoordinator(e.target.value)}
                      className="w-full rounded-md border border-border bg-muted px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="">Select coordinator</option>
                      {serviceCoordinatorsList.map((coord: any) => (
                        <option key={coord.id} value={String(coord.id)}>
                          {coord.full_name ||
                            `${coord.first_name || ""} ${coord.last_name || ""}`.trim()}
                        </option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        onClick={handleSaveServiceCoordinator}
                        disabled={updateServiceCoordinatorMutation.isPending}
                      >
                        <Save className="mr-1 h-3 w-3" />
                        Save
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={handleCancelEdit}
                        disabled={updateServiceCoordinatorMutation.isPending}
                      >
                        <X className="mr-1 h-3 w-3" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className={!workOrder?.service_coordinator ? "font-medium text-destructive" : ""}>
                    {getServiceCoordinatorName()}
                  </p>
                )}
              </div>
              {workOrder.created_at && (
                <div>
                  <p className="text-xs text-muted-foreground">Created</p>
                  <p>{format(new Date(workOrder.created_at), "MMM dd, yyyy")}</p>
                </div>
              )}
              {workOrder.estimated_completion && (
                <div>
                  <p className="text-xs text-muted-foreground">Est. completion</p>
                  <p>
                    {format(new Date(workOrder.estimated_completion), "MMM dd, yyyy")}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {workOrderId ? (
            <EstimatedNextServiceCallout workOrderId={workOrderId} hasVehicle={hasVehicle} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
