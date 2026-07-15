"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { gatepassApi } from "@/lib/api/gatepass";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Edit, CheckCircle, XCircle, FileText, User, Car, Calendar, Clock, Printer } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { useToast } from "@/lib/hooks/useToast";
import { usePrint } from "@/lib/hooks/usePrint";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useState } from "react";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { getUserFacingError } from "@/lib/api/errors";
import type { ComponentProps } from "react";

function getStatusVariant(status: string): ComponentProps<typeof Badge>["variant"] {
  switch (status) {
    case "pending":
      return "secondary";
    case "issued":
      return "default";
    case "completed":
      return "success";
    case "cancelled":
      return "danger";
    default:
      return "secondary";
  }
}

export default function GatePassDetailPage() {
  const params = useParams();
  const gatePassId = parseInt(params.id as string);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showIssueDialog, setShowIssueDialog] = useState(false);
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const { openPrintWindow, isOpeningPrint } = usePrint();

  const { data: gatePass, isLoading, error } = useQuery({
    queryKey: ["gatepass", gatePassId],
    queryFn: () => gatepassApi.get(gatePassId),
    enabled: !isNaN(gatePassId),
  });

  const issueMutation = useMutation({
    mutationFn: () => gatepassApi.issue(gatePassId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gatepass", gatePassId] });
      queryClient.invalidateQueries({ queryKey: ["gatepasses"] });
      toast({ title: "Success", description: "Gate pass issued successfully" });
      setShowIssueDialog(false);
    },

    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: getUserFacingError(error, "Failed to issue gate pass"),
        variant: "destructive",
      });
    },
  });

  const completeMutation = useMutation({
    mutationFn: () => gatepassApi.complete(gatePassId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gatepass", gatePassId] });
      queryClient.invalidateQueries({ queryKey: ["gatepasses"] });
      toast({ title: "Success", description: "Gate pass completed successfully" });
      setShowCompleteDialog(false);
    },

    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: getUserFacingError(error, "Failed to complete gate pass"),
        variant: "destructive",
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => gatepassApi.cancel(gatePassId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gatepass", gatePassId] });
      queryClient.invalidateQueries({ queryKey: ["gatepasses"] });
      toast({ title: "Success", description: "Gate pass cancelled successfully" });
      setShowCancelDialog(false);
    },

    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: getUserFacingError(error, "Failed to cancel gate pass"),
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Skeleton className="h-40 rounded-lg" />
          <Skeleton className="h-40 rounded-lg" />
        </div>
      </div>
    );
  }

  if (error || !gatePass) {
    return (
      <div className="bg-destructive/10 dark:bg-destructive/20 border border-destructive/20 dark:border-destructive/30 text-destructive dark:text-destructive px-4 py-3 rounded">
        Error loading gate pass. Please try again.
      </div>
    );
  }

  const workOrderId = typeof gatePass.work_order === 'object' ? gatePass.work_order.id : gatePass.work_order;
  // Robustly handle work order number
  const workOrderNumber = gatePass.work_order_number ||
    (typeof gatePass.work_order === 'object' ? gatePass.work_order.work_order_number : null) ||
    "N/A";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 print:hidden md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/gatepass">
            <Button variant="ghost" size="sm" className="hidden md:flex">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                {gatePass.gate_pass_number}
              </h1>

              <Badge variant={getStatusVariant(gatePass.status)} className="px-2 py-0.5 text-xs capitalize">
                {gatePass.status?.replace(/_/g, " ") || gatePass.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5" />
              Created {gatePass.created_at ? format(new Date(gatePass.created_at), "MMM dd, yyyy HH:mm") : "N/A"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Action Buttons for Desktop */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => openPrintWindow({ documentType: 'gate_pass', documentId: gatePass.id })} disabled={isOpeningPrint} className="hidden sm:inline-flex">
              <Printer className="w-4 h-4 mr-2" />
              {isOpeningPrint ? 'Opening...' : 'Print'}
            </Button>

            <PermissionGuard permission="change_gatepass">
              {gatePass.status !== 'completed' && gatePass.status !== 'cancelled' && (
                <Link href={`/gatepass/${gatePass.id}/edit`}>
                  <Button variant="outline" size="sm">
                    <Edit className="w-4 h-4 mr-2" />
                    Edit
                  </Button>
                </Link>
              )}
            </PermissionGuard>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 print:hidden lg:grid-cols-3">
        {/* Main Content (Left 2 columns) */}
        <div className="space-y-4 lg:col-span-2">

          {/* Work Order & Vehicle Info */}
          <Card className="border-border shadow-sm">
            <CardHeader className="px-4 py-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Details
              </CardTitle>
              <CardDescription className="text-xs">Associated work order and vehicle information</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 px-4 pb-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Work Order</p>
                <Link href={`/workorders/${workOrderId}`} className="flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
                  {workOrderNumber}
                  <ArrowLeft className="w-3 h-3 rotate-135" />
                </Link>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Customer</p>
                <p className="text-sm font-medium">{gatePass.customer_name || "N/A"}</p>
              </div>
              <div className="sm:col-span-2">
                <Separator className="my-1" />
                <p className="mb-1 mt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Vehicle</p>
                <div className="mt-1 flex items-start gap-2">
                  <div className="rounded-md border bg-muted/50 p-1.5">
                    <Car className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{gatePass.vehicle_info || "N/A"}</p>
                    {/* We could add VIN here if we had it easily available */}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Pickup Information */}
          <Card className="border-border shadow-sm">
            <CardHeader className="px-4 py-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <User className="h-4 w-4 text-muted-foreground" />
                Pickup Information
              </CardTitle>
              {/* <CardDescription>Details about who picked up the vehicle</CardDescription> */}
            </CardHeader>
            <CardContent className="space-y-3 px-4 pb-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Picked Up By</p>
                  <p className="text-sm font-medium text-foreground">
                    {gatePass.pickup_person_display || "N/A"}
                  </p>
                  {gatePass.picked_up_by_customer && (
                    <Badge variant="outline" className="mt-1 text-xs bg-muted/50 text-muted-foreground border-muted">
                      Customer
                    </Badge>
                  )}
                </div>

                {!gatePass.picked_up_by_customer && (
                  <>
                    {gatePass.pickup_person_relationship && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Relationship</p>
                        <p className="text-sm font-medium">{gatePass.pickup_person_relationship}</p>
                      </div>
                    )}
                    {gatePass.pickup_person_id_type && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">ID Type</p>
                        <p className="text-sm font-medium capitalize">{gatePass.pickup_person_id_type.replace(/_/g, " ")}</p>
                      </div>
                    )}
                    {gatePass.pickup_person_id_number && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">ID Number</p>
                        <p className="font-mono text-sm font-medium">{gatePass.pickup_person_id_number}</p>
                      </div>
                    )}
                    {gatePass.pickup_person_phone && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Phone</p>
                        <p className="text-sm font-medium">{gatePass.pickup_person_phone}</p>
                      </div>
                    )}
                  </>
                )}
              </div>

              {gatePass.pickup_notes && (
                <div className="mt-3 rounded-md border border-border bg-muted/40 p-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
                    <FileText className="w-3 h-3" /> Notes
                  </p>
                  <p className="text-sm text-card-foreground italic">&quot;{gatePass.pickup_notes}&quot;</p>
                </div>
              )}
            </CardContent>
          </Card>

        </div>

        {/* Sidebar (Right column) */}
        <div className="space-y-4">

          {/* Status & Timeline */}
          <Card className="h-fit shadow-sm">
            <CardHeader className="border-b bg-muted/30 px-4 py-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Clock className="w-4 h-4" />
                Timeline
              </CardTitle>
            </CardHeader>
            <CardContent className="relative px-4 py-4">
              <div className="absolute bottom-4 left-[21px] top-4 w-px bg-border"></div>
              <div className="relative space-y-4">
                <div className="flex items-start gap-3">
                  <div className="z-10 mt-1.5 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-background"></div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Created</p>
                    <p className="text-xs text-muted-foreground">
                      {gatePass.created_at ? format(new Date(gatePass.created_at), "MMM dd, yyyy HH:mm") : "N/A"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">By {gatePass.issued_by_name || "System"}</p>
                  </div>
                </div>

                {gatePass.issued_at && (
                  <div className="flex items-start gap-3">
                    <div className="z-10 mt-1.5 h-2.5 w-2.5 rounded-full bg-primary/80 ring-4 ring-background"></div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Issued</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(gatePass.issued_at), "MMM dd, yyyy HH:mm")}
                      </p>
                      {gatePass.authorized_by_name && (
                        <p className="text-xs text-muted-foreground mt-0.5">Auth: {gatePass.authorized_by_name}</p>
                      )}
                    </div>
                  </div>
                )}

                {gatePass.completed_at && (
                  <div className="flex items-start gap-3">
                    <div className="z-10 mt-1.5 h-2.5 w-2.5 rounded-full bg-success ring-4 ring-background"></div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Completed</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(gatePass.completed_at), "MMM dd, yyyy HH:mm")}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Actions Panel */}
          <Card className="border-border shadow-sm">
            <CardHeader className="px-4 py-3">
              <CardTitle className="text-sm font-semibold">Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 px-4 pb-4">
              {gatePass.status === "pending" && (
                <PermissionGuard permission="issue_gatepass">
                  <Button
                    onClick={() => setShowIssueDialog(true)}
                    className="w-full"
                    size="sm"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Issue Gate Pass
                  </Button>
                </PermissionGuard>
              )}

              {gatePass.status === "issued" && (
                <PermissionGuard permission="complete_gatepass">
                  <Button
                    onClick={() => setShowCompleteDialog(true)}
                    className="w-full bg-success hover:bg-success/90"
                    size="sm"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Complete (Picked Up)
                  </Button>
                </PermissionGuard>
              )}

              {gatePass.status !== "completed" && gatePass.status !== "cancelled" && (
                <PermissionGuard permission="change_gatepass">
                  <Button
                    onClick={() => setShowCancelDialog(true)}
                    className="w-full"
                    variant="destructive"
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Cancel Gate Pass
                  </Button>
                </PermissionGuard>
              )}

              {gatePass.status === "completed" && (
                <div className="rounded-md bg-success/10 p-3 text-center text-sm font-medium text-success">
                  <CheckCircle className="mx-auto mb-2 h-5 w-5 opacity-60" />
                  Gate pass completed. Vehicle has been picked up.
                </div>
              )}
            </CardContent>
          </Card>

        </div>
      </div>

      {/* Dialogs */}
      {/* Issue Dialog */}
      <Dialog open={showIssueDialog} onOpenChange={setShowIssueDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Issue Gate Pass</DialogTitle>
            <DialogDescription>
              Are you sure you want to issue this gate pass? This will mark it as issued.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowIssueDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => issueMutation.mutate()} disabled={issueMutation.isPending}>
              {issueMutation.isPending ? "Issuing..." : "Issue Gate Pass"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete Dialog */}
      <Dialog open={showCompleteDialog} onOpenChange={setShowCompleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete Gate Pass</DialogTitle>
            <DialogDescription>
              Confirm that the vehicle has been picked up. This will mark the gate pass as completed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCompleteDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => completeMutation.mutate()} disabled={completeMutation.isPending} className="bg-success hover:bg-success/90">
              {completeMutation.isPending ? "Completing..." : "Complete Gate Pass"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Gate Pass</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this gate pass? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending} variant="destructive">
              {cancelMutation.isPending ? "Cancelling..." : "Cancel Gate Pass"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Print View - Only visible when printing */}
      <div className="hidden print:block fixed inset-0 bg-card z-[9999] p-8">
        <div className="w-full border-2 border-border rounded-xl p-8 space-y-8">
          {/* Header */}
          <div className="flex justify-between items-start border-b-2 border-border pb-6">
            <div>
              <h1 className="text-4xl font-bold text-foreground tracking-tight">GATE PASS</h1>
              <p className="text-muted-foreground font-medium mt-1">Vehicle Release Authorization</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground uppercase font-bold tracking-wider">Pass Number</p>
              <p className="text-2xl font-mono font-bold text-foreground">{gatePass.gate_pass_number}</p>
            </div>
          </div>

          {/* Main Info Grid */}
          <div className="grid grid-cols-2 gap-x-12 gap-y-8">
            <div>
              <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-1">Customer</p>
              <p className="text-xl font-bold text-foreground">{gatePass.customer_name || "N/A"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-1">Date Issued</p>
              <p className="text-xl font-bold text-foreground">
                {gatePass.issued_at ? format(new Date(gatePass.issued_at), "MMM dd, yyyy HH:mm") : format(new Date(), "MMM dd, yyyy HH:mm")}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-1">Vehicle</p>
              <p className="text-xl font-bold text-foreground">{gatePass.vehicle_info || "N/A"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-1">Work Order Reference</p>
              <p className="text-xl font-bold text-foreground">{workOrderNumber}</p>
            </div>
          </div>

          <Separator className="bg-muted" />

          {/* Pickup Details */}
          <div>
            <p className="text-sm font-bold text-foreground uppercase tracking-widest border-b border-border pb-2 mb-4">Pickup Details</p>
            <div className="grid grid-cols-2 gap-8">
              <div>
                <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-1">Picked Up By</p>
                <p className="text-lg font-medium text-foreground">
                  {gatePass.pickup_person_display || "N/A"}
                  {gatePass.picked_up_by_customer && " (Customer)"}
                </p>
              </div>
              {!gatePass.picked_up_by_customer && gatePass.pickup_person_id_number && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-1">ID Number</p>
                  <p className="text-lg font-medium text-foreground">{gatePass.pickup_person_id_number}</p>
                </div>
              )}
            </div>
          </div>

          {/* Footer / Signatures */}
          <div className="mt-16 pt-8 border-t-2 border-border">
            <div className="grid grid-cols-3 gap-8">
              <div className="space-y-12">
                <div className="border-b border-border h-1"></div>
                <div>
                  <p className="font-bold text-foreground uppercase text-xs">Issued By</p>
                  <p className="text-sm text-muted-foreground">{gatePass.issued_by_name || "Authorized Staff"}</p>
                </div>
              </div>
              <div className="space-y-12">
                <div className="border-b border-border h-1"></div>
                <div>
                  <p className="font-bold text-foreground uppercase text-xs">Security Check</p>
                  <p className="text-sm text-muted-foreground">Signature & Date</p>
                </div>
              </div>
              <div className="space-y-12">
                <div className="border-b border-border h-1"></div>
                <div>
                  <p className="font-bold text-foreground uppercase text-xs">Receiver Signature</p>
                  <p className="text-sm text-muted-foreground">I confirm receipt of vehicle</p>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-8 text-center">
            <p className="text-xs text-muted-foreground font-mono">Generated on {format(new Date(), "PPpp")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
