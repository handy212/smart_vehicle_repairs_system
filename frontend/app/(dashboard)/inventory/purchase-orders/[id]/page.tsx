"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
// eslint-disable-next-line @typescript-eslint/no-unused-vars 
import { inventoryApi, PurchaseOrder } from "@/lib/api/inventory";
import { adminApi } from "@/lib/api/admin";
import { authApi } from "@/lib/api/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
// eslint-disable-next-line @typescript-eslint/no-unused-vars 
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CircleDollarSign, Clock, Database, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

export default function PurchaseOrderDetailPage() {
  const { formatCurrency } = useCurrency();
  const params = useParams();

  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { downloadPDF, openPrintWindow, isDownloading, isOpeningPrint } = usePrint();
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
  const isApprover = currentUser?.id === purchaseOrder?.assigned_approver || currentUser?.role === "admin" || currentUser?.role === "super-admin";
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
        {/* ... (Submit dialog content remains same but consolidated for brevity in this tool call if needed, 
            but I will include the full logic to ensure it works) */}
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
              <h1 className="text-2xl font-bold text-foreground tracking-tight">
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

          {purchaseOrder.status === "draft" && (
            <>
              <Link href={`/inventory/purchase-orders/${id}/edit`}>
                <Button variant="secondary" size="sm" className="h-8 text-xs font-bold">
                  <Edit className="w-4 h-4 mr-2" />
                  Edit
                </Button>
              </Link>
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
            <Button
              size="sm"
              className="h-8 text-xs font-bold bg-primary"
              onClick={() => { if (confirm("Approve this PO?")) approveMutation.mutate(); }}
              disabled={approveMutation.isPending}
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Approve
            </Button>
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

          {["confirmed", "partially_received"].includes(purchaseOrder.status) && isBranchUser && (
            <ReceiveItemsDialog
              purchaseOrder={purchaseOrder}
              triggerLabel={purchaseOrder.status === 'partially_received' ? "Receive Remaining" : "Receive Items"}
            />
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-l-2 border-l-blue-500 shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Financials</p>
                <h3 className="text-xl font-bold text-foreground">
                  {purchaseOrder.total ? formatCurrency(parseFloat(purchaseOrder.total)) : "$0.00"}
                </h3>
                <p className="text-[10px] text-muted-foreground">Total order amount</p>
              </div>
              <CircleDollarSign className="h-6 w-6 text-blue-500/30" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-2 border-l-amber-500 shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Due Date</p>
                <h3 className="text-xl font-bold text-foreground">
                  {purchaseOrder.due_date ? format(new Date(purchaseOrder.due_date), "MMM dd, yy") : "N/A"}
                </h3>
                <p className="text-[10px] text-muted-foreground">PO Expected due</p>
              </div>
              <Clock className="h-6 w-6 text-amber-500/30" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-2 border-l-green-500 shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Sync Status</p>
                <h3 className="text-xl font-bold text-foreground capitalize">
                  {purchaseOrder.qbo_sync_status || 'Un-synced'}
                </h3>
                <p className="text-[10px] text-muted-foreground">QuickBooks integration</p>
              </div>
              <Database className="h-6 w-6 text-green-500/30" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-2 border-l-purple-500 shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Order Date</p>
                <h3 className="text-xl font-bold text-foreground">
                  {purchaseOrder.order_date ? format(new Date(purchaseOrder.order_date), "MMM dd, yy") : "N/A"}
                </h3>
                <p className="text-[10px] text-muted-foreground">Creation timeline</p>
              </div>
              <FileText className="h-6 w-6 text-purple-500/30" />
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
                          <span className={cn(item.quantity_received === item.quantity ? "text-green-600 font-bold" : "text-amber-600")}>
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
                         {purchaseOrder.total ? formatCurrency(parseFloat(purchaseOrder.total)) : "$0.00"}
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
                  <span>{purchaseOrder.subtotal ? formatCurrency(parseFloat(purchaseOrder.subtotal)) : "$0.00"}</span>
                </div>
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-muted-foreground">Tax</span>
                  <span>{purchaseOrder.tax ? formatCurrency(parseFloat(purchaseOrder.tax)) : "$0.00"}</span>
                </div>
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-muted-foreground">Shipping</span>
                  <span>{purchaseOrder.shipping ? formatCurrency(parseFloat(purchaseOrder.shipping)) : "$0.00"}</span>
                </div>
                <div className="border-t pt-2 flex justify-between text-sm font-bold">
                  <span>Total Amount</span>
                  <span className="text-primary">{purchaseOrder.total ? formatCurrency(parseFloat(purchaseOrder.total)) : "$0.00"}</span>
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
                    <label className="text-[10px] font-bold text-muted-foreground uppercase opacity-70">Approver</label>
                    <p className="text-xs font-semibold mt-0.5">{purchaseOrder.assigned_approver_name || "Unassigned"}</p>
                    <p className="text-[9px] text-muted-foreground">{purchaseOrder.approved_at ? `Approved ${format(new Date(purchaseOrder.approved_at), "MMM dd")}` : "Awaiting approval"}</p>
                  </div>
                </div>
                <div className="pt-2 border-t">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase opacity-70">Expected Delivery</label>
                  <p className="text-xs font-semibold mt-0.5 flex items-center gap-1">
                    <Clock className="h-3 w-3 text-amber-500" />
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

