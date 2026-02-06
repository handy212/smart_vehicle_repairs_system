"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { inventoryApi, PurchaseOrder } from "@/lib/api/inventory";
import { adminApi } from "@/lib/api/admin";
import { authApi } from "@/lib/api/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Edit, CheckCircle, XCircle, Package, Printer } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/lib/hooks/useToast";
import { usePrint } from "@/lib/hooks/usePrint";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { useBranchStore } from "@/store/branchStore";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function PurchaseOrderDetailPage() {
  const { formatCurrency } = useCurrency();
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { downloadPDF, isDownloading } = usePrint();
  const id = parseInt(params.id as string);

  const [isSubmitDialogOpen, setIsSubmitDialogOpen] = useState(false);
  const [selectedApprover, setSelectedApprover] = useState<string>("");

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
  const isApprover = currentUser?.id === purchaseOrder?.assigned_approver || currentUser?.role === "admin";
  const canApprove = isApprover && !isSubmitter;
  const isBranchUser = activeBranchId === purchaseOrder?.branch;

  const { data: usersResponse } = useQuery({
    queryKey: ["users", "approvers"],
    queryFn: () => adminApi.users.list({ is_active: true }),
  });

  const approvers = usersResponse?.results || [];

  const submitForApprovalMutation = useMutation({
    mutationFn: (approverId?: number) => inventoryApi.submitPurchaseOrderForApproval(id, approverId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-order", id] });
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      setIsSubmitDialogOpen(false);
      toast({
        title: "Success",
        description: "Purchase order submitted for approval",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.error || error.response?.data?.detail || "Failed to submit purchase order for approval",
        variant: "destructive",
      });
    },
  });

  const handleSubmitForApproval = () => {
    const approverId = selectedApprover ? parseInt(selectedApprover) : undefined;
    submitForApprovalMutation.mutate(approverId);
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
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.error || error.response?.data?.detail || "Failed to approve purchase order",
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
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.error || error.response?.data?.detail || "Failed to confirm purchase order",
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
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to cancel purchase order",
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

  return (
    <div className="space-y-6">
      <Dialog open={isSubmitDialogOpen} onOpenChange={setIsSubmitDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Submit for Approval</DialogTitle>
            <DialogDescription>
              Select an approver for this purchase order.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="approver" className="text-right text-sm font-medium">
                Approver
              </label>
              <Select value={selectedApprover} onValueChange={setSelectedApprover}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select approver" />
                </SelectTrigger>
                <SelectContent>
                  {approvers.map((user) => (
                    <SelectItem key={user.id} value={user.id.toString()}>
                      {user.full_name || user.username || user.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSubmitDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmitForApproval} disabled={submitForApprovalMutation.isPending}>
              {submitForApprovalMutation.isPending ? "Submitting..." : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Page Header */}
      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-1">
              <Link href="/inventory" className="hover:text-foreground transition-colors">Inventory</Link>
              <span>/</span>
              <Link href="/inventory/purchase-orders" className="hover:text-foreground transition-colors">Purchase Orders</Link>
              <span>/</span>
              <span className="text-foreground font-medium">{purchaseOrder.po_number}</span>
            </div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">Purchase Order</h1>
          </div>

          <div className="flex items-center space-x-2">
            {purchaseOrder.items && purchaseOrder.items.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                onClick={() => downloadPDF({
                  documentType: 'purchase_order',
                  documentId: id,
                  documentNumber: purchaseOrder.po_number
                })}
                disabled={isDownloading}
              >
                <Printer className="w-4 h-4 mr-2" />
                {isDownloading ? 'Printing...' : 'Print'}
              </Button>
            )}
            {purchaseOrder.status === "draft" && (
              <>
                <Link href={`/inventory/purchase-orders/${id}/edit`}>
                  <Button variant="secondary" size="sm" className="h-9">
                    <Edit className="w-4 h-4 mr-2" />
                    Edit
                  </Button>
                </Link>
                {purchaseOrder.items && purchaseOrder.items.length > 0 && isBranchUser && (
                  <Button
                    size="sm"
                    className="h-9"
                    onClick={() => {
                      const invalidItems = purchaseOrder.items?.filter(
                        (item) => !item.quantity || item.quantity <= 0
                      );

                      if (invalidItems && invalidItems.length > 0) {
                        toast({
                          title: "Error",
                          description: "All items must have a quantity greater than zero.",
                          variant: "destructive",
                        });
                        return;
                      }

                      setIsSubmitDialogOpen(true);
                    }}
                    disabled={submitForApprovalMutation.isPending}
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Submit for Approval
                  </Button>
                )}
              </>
            )}
            {purchaseOrder.status === "pending_approval" && canApprove && (
              <Button
                size="sm"
                className="h-9"
                onClick={() => {
                  if (confirm("Approve this purchase order? It will be ready to send to supplier.")) {
                    approveMutation.mutate();
                  }
                }}
                disabled={approveMutation.isPending}
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Approve
              </Button>
            )}
            {purchaseOrder.status === "approved" && isBranchUser && (
              <Button
                size="sm"
                className="h-9"
                onClick={() => {
                  if (confirm("Confirm with supplier (via phone)? This will mark the PO as confirmed and ready for receiving.")) {
                    confirmMutation.mutate();
                  }
                }}
                disabled={confirmMutation.isPending}
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Confirm with Supplier
              </Button>
            )}
            {["confirmed", "partially_received"].includes(purchaseOrder.status) && isBranchUser && (
              <ReceiveItemsDialog
                purchaseOrder={purchaseOrder}
                key={purchaseOrder.status}
                triggerLabel={purchaseOrder.status === 'partially_received' ? "Receive Remaining" : "Receive Items"}
              />
            )}
            {["draft", "pending_approval", "approved", "confirmed"].includes(purchaseOrder.status) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={() => {
                  if (confirm("Cancel this purchase order?")) {
                    cancelMutation.mutate();
                  }
                }}
                disabled={cancelMutation.isPending}
              >
                <XCircle className="w-4 h-4 mr-2" />
                Cancel
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Summary Widgets */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-4 flex flex-col gap-1 shadow-none border rounded-lg bg-muted/50">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</label>
          <div className="flex items-center justify-between">
            <span className="text-xl font-bold text-foreground">
              <Badge variant={getStatusVariant(purchaseOrder.status) as any} className="text-[10px] px-2 py-0.5 font-medium border shadow-none bg-transparent m-0 p-0 h-auto">
                {getStatusLabel(purchaseOrder.status)}
              </Badge>
            </span>
          </div>
        </div>
        <div className="p-4 flex flex-col gap-1 shadow-none border rounded-lg bg-muted/50">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Amount</label>
          <div className="flex items-center justify-between">
            <span className="text-xl font-bold text-foreground">
              {purchaseOrder.total ? `${formatCurrency(parseFloat(purchaseOrder.total))}` : "$0.00"}
            </span>
          </div>
        </div>
        <div className="p-4 flex flex-col gap-1 shadow-none border rounded-lg bg-muted/50">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Supplier</label>
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-sm font-bold text-foreground truncate">
                {supplier?.name || "N/A"}
              </span>
              {supplier?.supplier_code && (
                <span className="text-xs text-muted-foreground font-mono">{supplier.supplier_code}</span>
              )}
            </div>
          </div>
        </div>
        <div className="p-4 flex flex-col gap-1 shadow-none border rounded-lg bg-muted/50">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Dates</label>
          <div className="flex flex-col">
            <span className="text-xs text-card-foreground">
              Ord: {purchaseOrder.order_date ? format(new Date(purchaseOrder.order_date), "MMM dd") : "-"}
            </span>
            <span className="text-xs text-card-foreground">
              Exp: {purchaseOrder.expected_delivery_date ? format(new Date(purchaseOrder.expected_delivery_date), "MMM dd") : "-"}
            </span>
          </div>
        </div>
      </div>

      {canApprove && purchaseOrder.status === "pending_approval" && (
        <Card className="border-primary/20 bg-primary/5 shadow-md">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">Decision Required</h3>
                <p className="text-xs text-muted-foreground">You are the assigned approver for this purchase order. Please review and take action.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="text-red-600 border-red-200 hover:bg-red-50"
                onClick={() => {
                  if (confirm("Reject this purchase order?")) {
                    cancelMutation.mutate();
                  }
                }}
                disabled={cancelMutation.isPending}
              >
                Reject Order
              </Button>
              <Button
                size="sm"
                className="bg-primary hover:bg-primary/90"
                onClick={() => {
                  if (confirm("Approve this purchase order?")) {
                    approveMutation.mutate();
                  }
                }}
                disabled={approveMutation.isPending}
              >
                {approveMutation.isPending && <CheckCircle className="w-4 h-4 mr-2 animate-spin" />}
                Approve Purchase
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isSubmitter && purchaseOrder.status === "pending_approval" && (
        <Card className="border-yellow-200 bg-warning/10 shadow-sm mb-6">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center text-yellow-600">
              <Package className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-medium text-yellow-800">Awaiting Approval</p>
              <p className="text-xs text-yellow-700">This purchase order is currently pending approval. You cannot approve orders you created yourself.</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Items List - Full Width on Mobile, 2 cols on Desktop */}
        <div className="lg:col-span-2 space-y-6">
          {purchaseOrder.status === 'draft' ? (
            <div className="bg-card rounded-lg border shadow-sm p-4">
              <PurchaseOrderItemsManager purchaseOrder={purchaseOrder} />
            </div>
          ) : (
            <Card className="border-t shadow-sm overflow-hidden">
              <CardHeader className="py-3 px-4 border-b bg-muted/30">
                <CardTitle className="text-sm font-semibold">Items</CardTitle>
              </CardHeader>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow className="border-border">
                      <TableHead className="h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4">Part Details</TableHead>
                      <TableHead className="h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4 text-right">Qty</TableHead>
                      <TableHead className="h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4 text-right">Received</TableHead>
                      <TableHead className="h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4 text-right">Unit Cost</TableHead>
                      <TableHead className="h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4 text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {purchaseOrder.items && purchaseOrder.items.length > 0 ? (
                      purchaseOrder.items.map((item) => (
                        <TableRow key={item.id} className="group hover:bg-muted/80 transition-colors border-b border-border last:border-0">
                          <TableCell className="px-4 py-2">
                            <div>
                              <span className="font-mono text-xs font-medium text-card-foreground block">
                                {item.part_number || (typeof item.part === 'object' ? item.part.part_number : '-')}
                              </span>
                              <span className="text-sm font-medium text-foreground">
                                {item.part_name || (typeof item.part === 'object' ? item.part.name : '-')}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-2 text-right text-sm text-foreground font-medium">
                            {item.quantity}
                          </TableCell>
                          <TableCell className="text-right px-4 py-2 text-sm">
                            {item.quantity_received || 0} / {item.quantity}
                          </TableCell>
                          <TableCell className="text-right px-4 py-2 text-sm text-muted-foreground">
                            {item.unit_cost ? `${formatCurrency(parseFloat(item.unit_cost))}` : "-"}
                          </TableCell>
                          <TableCell className="text-right px-4 py-2 text-sm font-bold text-foreground">
                            {item.total ? `${formatCurrency(parseFloat(item.total))}` : "-"}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No items in this order</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}

          {purchaseOrder.notes && (
            <Card>
              <CardHeader className="py-3 px-4 border-b bg-muted/30">
                <CardTitle className="text-sm font-semibold">Notes</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <p className="text-sm text-foreground whitespace-pre-wrap">
                  {purchaseOrder.notes}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar Info */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="py-3 px-4 border-b bg-muted/30">
              <CardTitle className="text-sm font-semibold">Financial Summary</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">
                  {purchaseOrder.subtotal ? `${formatCurrency(parseFloat(purchaseOrder.subtotal))}` : "$0.00"}
                </span>
              </div>
              {purchaseOrder.tax && parseFloat(purchaseOrder.tax) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tax</span>
                  <span className="font-medium">
                    {formatCurrency(parseFloat(purchaseOrder.tax))}
                  </span>
                </div>
              )}
              {purchaseOrder.shipping && parseFloat(purchaseOrder.shipping) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Shipping</span>
                  <span className="font-medium">
                    {formatCurrency(parseFloat(purchaseOrder.shipping))}
                  </span>
                </div>
              )}
              <div className="border-t pt-3 flex justify-between">
                <span className="font-semibold text-base">Total</span>
                <span className="font-bold text-base">
                  {purchaseOrder.total ? `${formatCurrency(parseFloat(purchaseOrder.total))}` : "$0.00"}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3 px-4 border-b bg-muted/30">
              <CardTitle className="text-sm font-semibold">Tracking</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {purchaseOrder.created_by_name && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Created By</label>
                  <p className="text-sm">{purchaseOrder.created_by_name}</p>
                  {purchaseOrder.created_at && (
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(purchaseOrder.created_at), "MMM dd, yyyy HH:mm")}
                    </p>
                  )}
                </div>
              )}
              {purchaseOrder.submitted_at && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Submitted for Approval</label>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(purchaseOrder.submitted_at), "MMM dd, yyyy HH:mm")}
                  </p>
                  {purchaseOrder.assigned_approver_name && (
                    <p className="text-xs text-info mt-1">Assignee: {purchaseOrder.assigned_approver_name}</p>
                  )}
                </div>
              )}
              {purchaseOrder.approved_at && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Approved</label>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(purchaseOrder.approved_at), "MMM dd, yyyy HH:mm")}
                  </p>
                  {purchaseOrder.approved_by_name && (
                    <p className="text-xs text-muted-foreground">by {purchaseOrder.approved_by_name}</p>
                  )}
                </div>
              )}
              {purchaseOrder.received_date && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Received</label>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(purchaseOrder.received_date), "MMM dd, yyyy")}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

