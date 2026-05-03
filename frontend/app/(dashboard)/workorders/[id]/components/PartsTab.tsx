"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { workOrderPartsApi, WorkOrderPart } from "@/lib/api/workorder-parts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AlertTriangle, ExternalLink, Plus, CheckCircle2, MoreVertical, Package, Undo2 } from "lucide-react";
import Link from "next/link";
import AddPartDialog from "./AddPartDialog";

import { useCurrency } from "@/lib/hooks/useCurrency";
interface PartsTabProps {
  workOrderId: number;
  workOrder?: {
    status?: string;
  };
  parts: WorkOrderPart[];
  onRefresh: () => void;
}

export default function WorkOrderPartsTab({
  workOrderId, workOrder, parts, onRefresh }: PartsTabProps) {
  const { formatCurrency } = useCurrency();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [returningPart, setReturningPart] = useState<WorkOrderPart | null>(null);
  const [returnReason, setReturnReason] = useState("");

  const getStatusVariant = (status: string): BadgeProps["variant"] => {
    switch (status) {
      case "installed":
        return "success";
      case "ready":
      case "received":
        return "info";
      case "pending":
      case "po_created":
      case "awaiting_stock":
        return "warning";
      case "returned":
        return "secondary";
      default:
        return "default";
    }
  };

  const postApprovalStatuses = ["approved", "in_progress", "paused"];
  const lockedStatuses = ["quality_check", "completed", "invoiced", "closed"];
  const currentStatus = workOrder?.status || "";
  const addingPartRequiresApproval = postApprovalStatuses.includes(currentStatus);
  const canAddPart = !lockedStatuses.includes(currentStatus);

  const getFlowBadge = (part: WorkOrderPart): { label: string; variant: BadgeProps["variant"] } => {
    if (part.status === "installed") return { label: "Installed", variant: "success" };
    if (part.status === "returned") return { label: "Returned", variant: "secondary" };
    if (part.status === "ready") return { label: "Ready for Install", variant: "success" };
    if (part.status === "received") return { label: "Received by Stores", variant: "info" };
    if (part.status === "awaiting_stock") return { label: "Awaiting Stock", variant: "warning" };
    if (part.status === "po_created") return { label: "PO Created", variant: "info" };
    if (!part.approved_by) return { label: "Awaiting Stores Approval", variant: "warning" };
    if (["additional_work_found", "awaiting_approval"].includes(currentStatus)) {
      return { label: "Awaiting Customer", variant: "warning" };
    }
    return { label: "Awaiting Stores", variant: "warning" };
  };

  const markInstalledMutation = useMutation({
    mutationFn: (partId: number) => workOrderPartsApi.markInstalled(partId),
    onSuccess: () => {
      onRefresh();
    },
  });

  const markReturnedMutation = useMutation({
    mutationFn: ({ partId, reason }: { partId: number; reason: string }) =>
      workOrderPartsApi.markReturned(partId, reason),
    onSuccess: () => {
      onRefresh();
    },
  });

  const totalPartsCost = parts.reduce((sum, part) => {
    return sum + parseFloat(part.total_cost || "0");
  }, 0);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between px-4 py-3">
          <div>
            <CardTitle className="text-base">Parts & Materials</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {parts.length > 0 ? (
                <>Total Cost: {formatCurrency(totalPartsCost)} • {parts.length} {parts.length === 1 ? 'part' : 'parts'}</>
              ) : (
                <>No parts added yet</>
              )}
            </p>
          </div>
          <Button size="sm" onClick={() => setShowAddDialog(true)} disabled={!canAddPart}>
            <Plus className="w-4 h-4 mr-2" />
            {addingPartRequiresApproval ? "Add Extra Part" : "Add Part"}
          </Button>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {addingPartRequiresApproval && (
            <div className="mb-3 flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <p className="text-sm">
                Adding a part now will mark the work order as additional work and require customer approval before repairs continue.
              </p>
            </div>
          )}
          {!canAddPart && (
            <div className="mb-3 rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground">
              Parts cannot be added at this stage. Return the work order to repairs or create a new work order.
            </div>
          )}
          {parts.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-12 h-12 text-gray-300 text-muted-foreground mx-auto mb-4" />
              <p className="text-sm font-medium text-foreground mb-1">
                No parts added yet
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                Add parts and materials as they are used in the repair work.
              </p>
              <Button onClick={() => setShowAddDialog(true)} variant="secondary" disabled={!canAddPart}>
                <Plus className="w-4 h-4 mr-2" />
                Add First Part
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[96px]">Req. #</TableHead>
                  <TableHead className="min-w-[240px]">Part Details</TableHead>
                  <TableHead className="min-w-[140px]">Requested By</TableHead>
                  <TableHead className="w-[72px]">Qty</TableHead>
                  <TableHead className="min-w-[104px]">Unit Cost</TableHead>
                  <TableHead className="min-w-[112px]">Total Cost</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Flow</TableHead>
                  <TableHead className="w-[64px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parts.map((part) => {
                  const flowBadge = getFlowBadge(part);
                  const hasActions = ["ready", "received"].includes(part.status)
                    || !["installed", "returned"].includes(part.status)
                    || ["draft", "pending", "po_created", "awaiting_stock"].includes(part.status);

                  return (
                    <TableRow key={part.id}>
                      <TableCell className="py-3 font-mono text-xs text-muted-foreground">
                        {part.requisition_number || "-"}
                      </TableCell>
                      <TableCell className="py-3">
                          <div>
                            <div className="font-medium leading-snug">{part.part_name}</div>
                            <div className="text-xs text-muted-foreground font-mono">{part.part_number}</div>
                            {part.description && (
                              <div className="mt-0.5 max-w-[260px] truncate text-xs text-muted-foreground">{part.description}</div>
                            )}
                            {part.resolution_notes && (
                              <div className="mt-1 max-w-[260px] truncate text-xs text-amber-700">
                                Return note: {part.resolution_notes}
                              </div>
                            )}
                          </div>
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="text-sm">
                          {part.requested_by_name || "Unknown"}
                        </div>
                      </TableCell>
                      <TableCell className="py-3">{part.quantity}</TableCell>
                      <TableCell className="py-3">{formatCurrency(parseFloat(part.unit_cost || "0"))}</TableCell>
                      <TableCell className="py-3 font-medium">
                        {formatCurrency(parseFloat(part.total_cost || "0"))}
                      </TableCell>
                      <TableCell className="py-3">
                        <Badge variant={getStatusVariant(part.status)}>
                          {part.status?.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3">
                        <Badge variant={flowBadge.variant} className="text-[10px]">
                          {flowBadge.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Open part actions">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {(part.status === "ready" || part.status === "received") && (
                              <DropdownMenuItem
                                onClick={() => markInstalledMutation.mutate(part.id)}
                                disabled={markInstalledMutation.isPending}
                              >
                                <CheckCircle2 className="mr-2 h-4 w-4" />
                                Mark Installed
                              </DropdownMenuItem>
                            )}
                            {!["installed", "returned"].includes(part.status) && (
                              <DropdownMenuItem
                                onClick={() => {
                                  setReturningPart(part);
                                  setReturnReason(part.resolution_notes || "");
                                }}
                                disabled={markReturnedMutation.isPending}
                              >
                                <Undo2 className="mr-2 h-4 w-4" />
                                Mark Returned
                              </DropdownMenuItem>
                            )}
                            {["draft", "pending", "po_created", "awaiting_stock"].includes(part.status) && (
                              <DropdownMenuItem asChild>
                                <Link href={`/inventory/parts-requests?work_order=${workOrderId}`}>
                                  <ExternalLink className="mr-2 h-4 w-4" />
                                  Review in Stores
                                </Link>
                              </DropdownMenuItem>
                            )}
                            {!hasActions && (
                              <DropdownMenuItem disabled>No actions available</DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {showAddDialog && (
        <AddPartDialog
          workOrderId={workOrderId}
          workOrderStatus={currentStatus}
          open={showAddDialog}
          onClose={() => setShowAddDialog(false)}
          onSuccess={() => {
            setShowAddDialog(false);
            onRefresh();
          }}
        />
      )}

      <Dialog
        open={!!returningPart}
        onOpenChange={(open) => {
          if (!open) {
            setReturningPart(null);
            setReturnReason("");
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Return Part to Stores</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Explain why <span className="font-medium text-foreground">{returningPart?.part_name}</span> was not used.
              This note is required before quality check and completion.
            </p>
            <Textarea
              value={returnReason}
              onChange={(event) => setReturnReason(event.target.value)}
              rows={4}
              placeholder="Example: Ordered for inspection, but the original part tested good and was kept in service."
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setReturningPart(null);
                setReturnReason("");
              }}
              disabled={markReturnedMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!returningPart || !returnReason.trim()) return;
                markReturnedMutation.mutate(
                  { partId: returningPart.id, reason: returnReason.trim() },
                  {
                    onSuccess: () => {
                      setReturningPart(null);
                      setReturnReason("");
                    },
                  }
                );
              }}
              disabled={markReturnedMutation.isPending || !returnReason.trim()}
            >
              Confirm Return
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
