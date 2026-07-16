"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
// eslint-disable-next-line @typescript-eslint/no-unused-vars 
import { inventoryApi, PurchaseOrder } from "@/lib/api/inventory";
import { adminApi } from "@/lib/api/admin";
import { authApi } from "@/lib/api/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
// eslint-disable-next-line @typescript-eslint/no-unused-vars 
import { ArrowLeft, Edit, CheckCircle, XCircle, Package, Printer, MoreVertical, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/lib/hooks/useToast";
import { canConvertPoToBill } from "@/lib/billing/ap-flow";
import { ApFlowHint } from "@/components/billing/ApFlowHint";
import { usePrint } from "@/lib/hooks/usePrint";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { useBranchStore } from "@/store/branchStore";
import { usePermissions } from "@/lib/hooks/usePermissions";
import ReceiveItemsDialog from "../components/ReceiveItemsDialog";
import PurchaseOrderItemsManager from "../components/PurchaseOrderItemsManager";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CircleDollarSign, Clock, Database, FileText, ReceiptText } from "lucide-react";
import { cn } from "@/lib/utils";
import { getUserFacingError } from "@/lib/api/errors";
import { useQuickBooksConnection } from "@/hooks/useQuickBooksConnection";
import { useQboEntitySync } from "@/hooks/useQboEntitySync";
import { QboSyncBadge } from "@/components/integrations/QboSyncBadge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function PurchaseOrderDetailPage() {
  const { formatCurrency } = useCurrency();
  const params = useParams();
  const router = useRouter();

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { openPrintWindow, isOpeningPrint } = usePrint();
  const id = parseInt(params.id as string);

  const [isSubmitDialogOpen, setIsSubmitDialogOpen] = useState(false);
  const [selectedApproverIds, setSelectedApproverIds] = useState<number[]>([]);

  const { data: purchaseOrder, isLoading } = useQuery({
    queryKey: ["purchase-order", id],
    queryFn: () => inventoryApi.getPurchaseOrder(id),
  });

  const { data: currentUser } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => authApi.getCurrentUser(),
  });

  const { activeBranchId } = useBranchStore();
  const isSubmitter = currentUser?.id === purchaseOrder?.created_by;
  const currentUserPendingApproval = purchaseOrder?.approvals?.some(
    (approval) => approval.approver === currentUser?.id && approval.status === "pending"
  );
  const { hasPermission } = usePermissions();
  const { isLinked: isQboConnected, isOperational: isQboCanSync, connectionIssue: qboConnectionIssue } = useQuickBooksConnection();
  const {
    isSyncing,
    isClearing,
    handleSync: handleQBOSync,
    handleClearMapping: handleQboClearMapping,
  } = useQboEntitySync({
    entityType: "purchase_order",
    objectId: id,
    queryKey: ["purchase-order", id],
    syncSuccessMessage: "Purchase order push to QuickBooks triggered. Status should update shortly.",
    syncErrorMessage: "Could not trigger purchase order sync with QuickBooks.",
  });
  const isPrivilegedApprover = hasPermission("approve_purchase_orders");
  const isLegacyApprover = currentUser?.id === purchaseOrder?.assigned_approver;
  const isApprover = Boolean(currentUserPendingApproval || isLegacyApprover || isPrivilegedApprover);
  const canApprove = isApprover && (!isSubmitter || isPrivilegedApprover);
  const purchaseOrderBranchId = typeof purchaseOrder?.branch === "object" ? purchaseOrder.branch?.id : purchaseOrder?.branch;
  const isBranchUser = activeBranchId === purchaseOrderBranchId;

  const { data: usersResponse } = useQuery({
    queryKey: ["users", "approvers"],
    queryFn: () => adminApi.users.list({ is_active: true }),
  });

  const approvers = usersResponse?.results || [];

  const submitForApprovalMutation = useMutation({
    mutationFn: (approverIds: number[]) => inventoryApi.submitPurchaseOrderForApproval(id, approverIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-order", id] });
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      setIsSubmitDialogOpen(false);
      setSelectedApproverIds([]);
      toast({
        title: "Success",
        description: "Purchase order submitted for approval",
      });
    },

    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: getUserFacingError(error, "Failed to submit purchase order for approval"),
        variant: "destructive",
      });
    },
  });

  const handleSubmitForApproval = () => {
    submitForApprovalMutation.mutate(selectedApproverIds);
  };

  const toggleApprover = (approverId: number, checked: boolean | string) => {
    setSelectedApproverIds((current) => {
      if (checked) {
        return current.includes(approverId) ? current : [...current, approverId];
      }
      return current.filter((idToKeep) => idToKeep !== approverId);
    });
  };

  const approveMutation = useMutation({
    mutationFn: () => inventoryApi.approvePurchaseOrder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-order", id] });
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast({
        title: "Success",
        description: "Purchase order approved",
      });
    },

    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: getUserFacingError(error, "Failed to approve purchase order"),
        variant: "destructive",
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (reason: string) => inventoryApi.rejectPurchaseOrder(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-order", id] });
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast({
        title: "Success",
        description: "Purchase order rejected",
      });
    },

    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: getUserFacingError(error, "Failed to reject purchase order"),
        variant: "destructive",
      });
    },
  });

  const confirmMutation = useMutation({
    mutationFn: () => inventoryApi.confirmPurchaseOrder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-order", id] });
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast({
        title: "Success",
        description: "Purchase order confirmed with supplier",
      });
    },

    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: getUserFacingError(error, "Failed to confirm purchase order"),
        variant: "destructive",
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => inventoryApi.cancelPurchaseOrder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-order", id] });
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast({
        title: "Success",
        description: "Purchase order cancelled successfully",
      });
    },

    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: getUserFacingError(error, "Failed to cancel purchase order"),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => inventoryApi.deletePurchaseOrder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast({
        title: "Purchase Order Deleted",
        description: "The purchase order was deleted successfully.",
      });
      router.push("/inventory/purchase-orders");
    },
    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: getUserFacingError(error, "Failed to delete purchase order"),
        variant: "destructive",
      });
    },
  });

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "draft":
        return "secondary";
      case "pending_approval":
        return "warning";
      case "approved":
        return "info";
      case "confirmed":
        return "success";
      case "received":
        return "success";
      case "partially_received":
        return "warning";
      case "cancelled":
        return "danger";
      case "rejected":
        return "danger";
      default:
        return "default";
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      draft: "Draft",
      pending_approval: "Pending Approval",
      approved: "Approved",
      confirmed: "Confirmed",
      received: "Received",
      partially_received: "Partially Received",
      rejected: "Rejected",
      cancelled: "Cancelled",
    };
    return labels[status] || status
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!purchaseOrder) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Purchase order not found.</p>
        <Link href="/inventory/purchase-orders">
          <Button className="mt-4" variant="secondary">
            Back to Purchase Orders
          </Button>
        </Link>
      </div>
    );
  }

  const supplier =
    typeof purchaseOrder.supplier === "object" && purchaseOrder.supplier !== null
      ? purchaseOrder.supplier
      : null;
  const canEditPurchaseOrder =
    (hasPermission("edit_purchase_orders") || hasPermission("manage_inventory")) &&
    purchaseOrder.status === "draft";
  const canReceiveItems =
    (hasPermission("receive_parts") || hasPermission("manage_inventory")) && isBranchUser;
  const canDeletePurchaseOrder =
    hasPermission("manage_inventory") &&
    ["draft", "rejected", "cancelled"].includes(purchaseOrder.status);

  return (
    <div className="space-y-6">
      <Dialog open={isSubmitDialogOpen} onOpenChange={setIsSubmitDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Submit for Approval</DialogTitle>
            <DialogDescription>
              Select every person who must approve this purchase order.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[320px] space-y-2 overflow-y-auto py-4">
            {approvers.map((user) => {
              const isCurrentUser = user.id === currentUser?.id;
              const isChecked = selectedApproverIds.includes(user.id);
              const displayName = user.full_name || user.username || user.email;

              return (
                <label
                  key={user.id}
                  className={cn(
                    "flex items-center gap-3 rounded border p-3 text-sm",
                    isCurrentUser ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-muted/40"
                  )}
                >
                  <Checkbox
                    checked={isChecked}
                    disabled={isCurrentUser}
                    onCheckedChange={(checked) => toggleApprover(user.id, checked)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{displayName}</span>
                    {user.email && <span className="block truncate text-xs text-muted-foreground">{user.email}</span>}
                  </span>
                  {isCurrentUser && <Badge variant="secondary">Submitter</Badge>}
                </label>
              );
            })}
            {approvers.length === 0 && (
              <p className="rounded border border-dashed p-4 text-sm text-muted-foreground">
                No active approvers found.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSubmitDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmitForApproval} disabled={submitForApprovalMutation.isPending || selectedApproverIds.length === 0}>
              {submitForApprovalMutation.isPending ? "Submitting..." : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Premium Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/inventory/purchase-orders">
            <Button variant="secondary" size="sm" className="h-8">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-foreground tracking-tight">
                PO: {purchaseOrder.po_number}
              </h1>
              <Badge variant={getStatusVariant(purchaseOrder.status) as any} className="text-[10px] px-2 py-0.5 font-bold uppercase tracking-wider">
                {getStatusLabel(purchaseOrder.status)}
              </Badge>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-muted-foreground font-medium">Supplier:</span>
              <Link href={`/inventory/suppliers/${supplier?.id}`} className="text-xs font-bold text-primary hover:underline">
                {supplier?.name || "N/A"}
              </Link>
              {supplier?.supplier_code && (
                <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1 rounded">
                  {supplier.supplier_code}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {purchaseOrder.items && purchaseOrder.items.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs font-bold"
              onClick={() => openPrintWindow({ documentType: 'purchase_order', documentId: id })}
              disabled={isOpeningPrint}
            >
              <Printer className="w-4 h-4 mr-2" />
              Print
            </Button>
          )}

          {purchaseOrder.items && purchaseOrder.items.length > 0 && canConvertPoToBill(purchaseOrder.status) && (
            <Link href={`/billing/bills/new?po=${id}`}>
              <Button variant="outline" size="sm" className="h-8 text-xs font-bold">
                <ReceiptText className="w-4 h-4 mr-2" />
                {purchaseOrder.status === "partially_received" ? "Bill Received Items" : "Convert to Bill"}
              </Button>
            </Link>
          )}

          {purchaseOrder.status === "draft" && (
            <>
              {canEditPurchaseOrder && (
                <Link href={`/inventory/purchase-orders/${id}/edit`}>
                  <Button variant="secondary" size="sm" className="h-8 text-xs font-bold">
                    <Edit className="w-4 h-4 mr-2" />
                    Edit
                  </Button>
                </Link>
              )}
              {purchaseOrder.items && purchaseOrder.items.length > 0 && isBranchUser && (
                <Button
                  size="sm"
                  className="h-8 text-xs font-bold"
                  onClick={() => setIsSubmitDialogOpen(true)}
                  disabled={submitForApprovalMutation.isPending}
                >
                  Submit Approval
                </Button>
              )}
            </>
          )}

          {purchaseOrder.status === "pending_approval" && canApprove && (
            <>
              <Button
                size="sm"
                className="h-8 text-xs font-bold bg-primary"
                onClick={() => { if (confirm("Approve this PO?")) approveMutation.mutate(); }}
                disabled={approveMutation.isPending || rejectMutation.isPending}
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="h-8 text-xs font-bold"
                onClick={() => {
                  const reason = prompt("Reason for rejecting this purchase order:");
                  if (reason?.trim()) rejectMutation.mutate(reason.trim());
                }}
                disabled={approveMutation.isPending || rejectMutation.isPending}
              >
                <XCircle className="w-4 h-4 mr-2" />
                Reject
              </Button>
            </>
          )}

          {purchaseOrder.status === "approved" && isBranchUser && (
            <Button
              size="sm"
              className="h-8 text-xs font-bold"
              onClick={() => { if (confirm("Confirm with supplier?")) confirmMutation.mutate(); }}
              disabled={confirmMutation.isPending}
            >
              Confirm Supplier
            </Button>
          )}

          {["confirmed", "partially_received"].includes(purchaseOrder.status) && canReceiveItems && (
            <ReceiveItemsDialog
              purchaseOrder={purchaseOrder}
              triggerLabel={purchaseOrder.status === 'partially_received' ? "Receive Remaining" : "Receive Items"}
            />
          )}

          {!["partially_received", "received", "cancelled", "rejected"].includes(purchaseOrder.status) && isBranchUser && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs font-bold border-destructive/30 text-destructive hover:bg-destructive/5"
              onClick={() => { if (confirm("Cancel this purchase order?")) cancelMutation.mutate(); }}
              disabled={cancelMutation.isPending}
            >
              <XCircle className="w-4 h-4 mr-2" />
              Cancel
            </Button>
          )}

          {(canEditPurchaseOrder || canDeletePurchaseOrder) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs font-bold">
                  <MoreVertical className="w-4 h-4 mr-2" />
                  Actions
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {canEditPurchaseOrder && (
                  <DropdownMenuItem onClick={() => router.push(`/inventory/purchase-orders/${id}/edit`)}>
                    <Edit className="mr-2 h-4 w-4" />
                    Edit purchase order
                  </DropdownMenuItem>
                )}
                {canDeletePurchaseOrder && (
                  <>
                    {canEditPurchaseOrder && <DropdownMenuSeparator />}
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => {
                        if (confirm(`Delete purchase order "${purchaseOrder.po_number}"?`)) {
                          deleteMutation.mutate();
                        }
                      }}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {deleteMutation.isPending ? "Deleting..." : "Delete purchase order"}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {purchaseOrder.status === "confirmed" ? (
        <ApFlowHint variant="po-receive-first" />
      ) : null}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-l-2 border-l-primary shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Financials</p>
                <h3 className="text-xl font-bold text-foreground">
                  {purchaseOrder.total ? formatCurrency(parseFloat(purchaseOrder.total)) : formatCurrency(0)}
                </h3>
                <p className="text-[10px] text-muted-foreground">Total order amount</p>
              </div>
              <CircleDollarSign className="h-6 w-6 text-primary/30" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-2 border-l-warning shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Due Date</p>
                <h3 className="text-xl font-bold text-foreground">
                  {purchaseOrder.due_date ? format(new Date(purchaseOrder.due_date), "MMM dd, yy") : "N/A"}
                </h3>
                <p className="text-[10px] text-muted-foreground">PO Expected due</p>
              </div>
              <Clock className="h-6 w-6 text-warning/30" />
            </div>
          </CardContent>
        </Card>

        {isQboConnected && (
          <Card className="border-l-2 border-l-success shadow-sm">
            <CardContent className="p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">QuickBooks</p>
                  <QboSyncBadge
                    status={purchaseOrder.qbo_sync_status}
                    error={purchaseOrder.qbo_sync_error}
                    connectionIssue={!isQboCanSync ? qboConnectionIssue : undefined}
                    onRetry={isQboCanSync ? handleQBOSync : undefined}
                    onClearMapping={isQboCanSync ? handleQboClearMapping : undefined}
                    isRetrying={isSyncing}
                    isClearing={isClearing}
                    compact
                    showLabel={false}
                  />
                </div>
                <Database className="h-6 w-6 shrink-0 text-success/30" />
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-l-2 border-l-info shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Order Date</p>
                <h3 className="text-xl font-bold text-foreground">
                  {purchaseOrder.order_date ? format(new Date(purchaseOrder.order_date), "MMM dd, yy") : "N/A"}
                </h3>
                <p className="text-[10px] text-muted-foreground">Creation timeline</p>
              </div>
              <FileText className="h-6 w-6 text-info/30" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="items" className="w-full">
        <TabsList className="w-full justify-start border-b rounded-none bg-transparent h-auto p-0 gap-6">
          <TabsTrigger 
            value="items" 
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-1 py-2 text-xs font-bold uppercase tracking-tight"
          >
            Order Items
          </TabsTrigger>
          <TabsTrigger 
            value="details" 
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-1 py-2 text-xs font-bold uppercase tracking-tight"
          >
            Tracking & Logistics
          </TabsTrigger>
          <TabsTrigger 
            value="notes" 
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-1 py-2 text-xs font-bold uppercase tracking-tight"
          >
            Notes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="pt-4">
          <Card className="shadow-sm border-muted/40 overflow-hidden">
            <CardHeader className="py-3 px-4 border-b bg-muted/20">
              <CardTitle className="text-xs font-bold uppercase tracking-wide">Procurement Items</CardTitle>
            </CardHeader>
            <div className="p-0">
              {purchaseOrder.status === 'draft' ? (
                <div className="p-4">
                  <PurchaseOrderItemsManager purchaseOrder={purchaseOrder} />
                </div>
              ) : (
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow className="h-8">
                      <TableHead className="text-[10px] font-bold px-4">PART DETAILS</TableHead>
                      <TableHead className="text-right text-[10px] font-bold">QTY</TableHead>
                      <TableHead className="text-right text-[10px] font-bold">RECV</TableHead>
                      <TableHead className="text-right text-[10px] font-bold">UNIT COST</TableHead>
                      <TableHead className="text-right text-[10px] font-bold px-4">TOTAL</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {purchaseOrder.items?.map((item) => (
                      <TableRow key={item.id} className="h-10 hover:bg-muted/10">
                        <TableCell className="px-4 py-1">
                          <div>
                            <p className="font-bold text-xs">{item.part_name || (typeof item.part === 'object' ? item.part.name : '-')}</p>
                            <p className="text-[10px] text-muted-foreground font-mono">
                              {item.part_number || (typeof item.part === 'object' ? item.part.part_number : '-')}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-bold text-xs">{item.quantity}</TableCell>
                        <TableCell className="text-right text-xs">
                          <span className={cn(item.quantity_received === item.quantity ? "text-success font-bold" : "text-warning")}>
                            {item.quantity_received || 0}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {item.unit_cost ? formatCurrency(parseFloat(item.unit_cost)) : "-"}
                        </TableCell>
                        <TableCell className="text-right font-bold text-xs px-4">
                          {item.total ? formatCurrency(parseFloat(item.total)) : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/10 font-bold border-t-2">
                       <TableCell colSpan={4} className="text-right text-xs uppercase tracking-wide px-4">Grand Total</TableCell>
                       <TableCell className="text-right text-sm px-4">
                         {purchaseOrder.total ? formatCurrency(parseFloat(purchaseOrder.total)) : formatCurrency(0)}
                       </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="details" className="pt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="shadow-sm border-muted/40">
              <CardHeader className="py-2 px-4 border-b bg-muted/20">
                <CardTitle className="text-xs font-bold uppercase tracking-wide">Financial Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-2">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{purchaseOrder.subtotal ? formatCurrency(parseFloat(purchaseOrder.subtotal)) : formatCurrency(0)}</span>
                </div>
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-muted-foreground">Tax</span>
                  <span>{purchaseOrder.tax ? formatCurrency(parseFloat(purchaseOrder.tax)) : formatCurrency(0)}</span>
                </div>
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-muted-foreground">Shipping</span>
                  <span>{purchaseOrder.shipping ? formatCurrency(parseFloat(purchaseOrder.shipping)) : formatCurrency(0)}</span>
                </div>
                <div className="border-t pt-2 flex justify-between text-sm font-bold">
                  <span>Total Amount</span>
                  <span className="text-primary">{purchaseOrder.total ? formatCurrency(parseFloat(purchaseOrder.total)) : formatCurrency(0)}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-muted/40">
              <CardHeader className="py-2 px-4 border-b bg-muted/20">
                <CardTitle className="text-xs font-bold uppercase tracking-wide">Audit & Tracking</CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground uppercase opacity-70">Created By</label>
                    <p className="text-xs font-semibold mt-0.5">{purchaseOrder.created_by_name || "System"}</p>
                    <p className="text-[9px] text-muted-foreground">{purchaseOrder.created_at ? format(new Date(purchaseOrder.created_at), "MMM dd, HH:mm") : "-"}</p>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground uppercase opacity-70">Approvals</label>
                    <p className="text-xs font-semibold mt-0.5">
                      {purchaseOrder.approval_progress?.total
                        ? `${purchaseOrder.approval_progress.approved}/${purchaseOrder.approval_progress.total} approved`
                        : purchaseOrder.assigned_approver_name || "Unassigned"}
                    </p>
                    <p className="text-[9px] text-muted-foreground">
                      {purchaseOrder.approved_at ? `Approved ${format(new Date(purchaseOrder.approved_at), "MMM dd")}` : "Awaiting approval"}
                    </p>
                  </div>
                </div>
                {purchaseOrder.approvals && purchaseOrder.approvals.length > 0 && (
                  <div className="space-y-2 border-t pt-3">
                    {purchaseOrder.approvals.map((approval) => (
                      <div key={approval.id} className="flex items-center justify-between gap-3 rounded border bg-muted/10 px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold">{approval.approver_name || approval.approver_email || `User ${approval.approver}`}</p>
                          <p className="text-[9px] text-muted-foreground">
                            {approval.approved_at
                              ? `Approved ${format(new Date(approval.approved_at), "MMM dd, HH:mm")}`
                              : approval.rejected_at
                                ? `Rejected ${format(new Date(approval.rejected_at), "MMM dd, HH:mm")}`
                                : "Waiting"}
                          </p>
                        </div>
                        <Badge
                          variant={
                            approval.status === "approved"
                              ? "success"
                              : approval.status === "rejected"
                                ? "danger"
                                : "warning"
                          }
                          className="shrink-0 text-[9px] uppercase"
                        >
                          {approval.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
                <div className="pt-2 border-t">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase opacity-70">Expected Delivery</label>
                  <p className="text-xs font-semibold mt-0.5 flex items-center gap-1">
                    <Clock className="h-3 w-3 text-warning" />
                    {purchaseOrder.expected_delivery_date ? format(new Date(purchaseOrder.expected_delivery_date), "MMMM dd, yyyy") : "Not scheduled"}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="notes" className="pt-4">
          <Card className="shadow-sm border-muted/40">
            <CardHeader className="py-3 px-4 border-b">
              <CardTitle className="text-xs font-bold uppercase tracking-wide flex items-center gap-2">
                <FileText className="h-3 w-3 text-primary" />
                Purchase Order Remarks
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              {purchaseOrder.notes ? (
                <div className="bg-muted/10 p-4 rounded border border-muted/30">
                  <p className="text-xs leading-relaxed whitespace-pre-wrap font-medium font-sans">{purchaseOrder.notes}</p>
                </div>
              ) : (
                <div className="text-center py-10 opacity-50">
                  <p className="text-[10px] font-bold uppercase tracking-wider">No specific remarks recorded for this order</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
