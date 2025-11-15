"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { inventoryApi, PurchaseOrder } from "@/lib/api/inventory";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Edit, CheckCircle, XCircle, Package } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/lib/hooks/useToast";

export default function PurchaseOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const id = parseInt(params.id as string);

  const { data: purchaseOrder, isLoading } = useQuery({
    queryKey: ["purchase-order", id],
    queryFn: () => inventoryApi.getPurchaseOrder(id),
  });

  const submitMutation = useMutation({
    mutationFn: () => inventoryApi.submitPurchaseOrder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-order", id] });
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast({
        title: "Success",
        description: "Purchase order submitted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to submit purchase order",
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
        description: "Purchase order confirmed successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to confirm purchase order",
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
      case "submitted":
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
    return status
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!purchaseOrder) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Purchase order not found.</p>
        <Link href="/inventory/purchase-orders">
          <Button className="mt-4" variant="outline">
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
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/inventory/purchase-orders">
            <Button variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {purchaseOrder.po_number}
            </h1>
            <p className="text-sm text-gray-500 mt-1">Purchase Order Details</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {purchaseOrder.status === "draft" && (
            <>
              <Link href={`/inventory/purchase-orders/${id}/edit`}>
                <Button variant="outline">
                  <Edit className="w-4 h-4 mr-2" />
                  Edit
                </Button>
              </Link>
              <Button
                onClick={() => {
                  if (confirm("Submit this purchase order to the supplier?")) {
                    submitMutation.mutate();
                  }
                }}
                disabled={submitMutation.isPending}
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Submit
              </Button>
            </>
          )}
          {purchaseOrder.status === "submitted" && (
            <Button
              onClick={() => {
                if (confirm("Confirm receipt of this purchase order?")) {
                  confirmMutation.mutate();
                }
              }}
              disabled={confirmMutation.isPending}
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Confirm
            </Button>
          )}
          {["draft", "submitted", "confirmed"].includes(purchaseOrder.status) && (
            <Button
              variant="destructive"
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Information */}
        <div className="lg:col-span-2 space-y-6">
          {/* Status and Supplier */}
          <Card>
            <CardHeader>
              <CardTitle>Order Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-500">Status</label>
                  <div className="mt-1">
                    <Badge variant={getStatusVariant(purchaseOrder.status) as any}>
                      {getStatusLabel(purchaseOrder.status)}
                    </Badge>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">PO Number</label>
                  <p className="text-lg font-mono font-medium">{purchaseOrder.po_number}</p>
                </div>
              </div>

              {supplier && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Supplier</label>
                  <p className="text-lg font-medium">{supplier.name}</p>
                  {supplier.supplier_code && (
                    <p className="text-sm text-gray-500">Code: {supplier.supplier_code}</p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Order Date</label>
                  <p className="text-lg">
                    {purchaseOrder.order_date
                      ? format(new Date(purchaseOrder.order_date), "MMM dd, yyyy")
                      : "-"}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">
                    Expected Delivery
                  </label>
                  <p className="text-lg">
                    {purchaseOrder.expected_delivery_date
                      ? format(new Date(purchaseOrder.expected_delivery_date), "MMM dd, yyyy")
                      : "-"}
                  </p>
                </div>
              </div>

              {purchaseOrder.notes && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Notes</label>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {purchaseOrder.notes}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Items */}
          <Card>
            <CardHeader>
              <CardTitle>Items</CardTitle>
            </CardHeader>
            <CardContent>
              {purchaseOrder.items && purchaseOrder.items.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Part Number</TableHead>
                        <TableHead>Part Name</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Received</TableHead>
                        <TableHead>Unit Cost</TableHead>
                        <TableHead>Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {purchaseOrder.items.map((item) => {
                        const part =
                          typeof item.part === "object" && item.part !== null
                            ? item.part
                            : null;
                        return (
                          <TableRow key={item.id}>
                            <TableCell className="font-mono text-sm">
                              {item.part_number || (part ? part.part_number : "-")}
                            </TableCell>
                            <TableCell>
                              {item.part_name || (part ? part.name : "-")}
                            </TableCell>
                            <TableCell>{item.quantity_ordered}</TableCell>
                            <TableCell>
                              {item.quantity_received || 0} / {item.quantity_ordered}
                            </TableCell>
                            <TableCell>
                              {item.unit_cost
                                ? `$${parseFloat(item.unit_cost).toFixed(2)}`
                                : "-"}
                            </TableCell>
                            <TableCell className="font-medium">
                              {item.total_cost
                                ? `$${parseFloat(item.total_cost).toFixed(2)}`
                                : "-"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-gray-500 text-center py-4">No items in this order</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Summary */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Financial Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-medium">
                  {purchaseOrder.subtotal
                    ? `$${parseFloat(purchaseOrder.subtotal).toFixed(2)}`
                    : "$0.00"}
                </span>
              </div>
              {purchaseOrder.tax && parseFloat(purchaseOrder.tax) > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Tax</span>
                  <span className="font-medium">
                    ${parseFloat(purchaseOrder.tax).toFixed(2)}
                  </span>
                </div>
              )}
              {purchaseOrder.shipping && parseFloat(purchaseOrder.shipping) > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Shipping</span>
                  <span className="font-medium">
                    ${parseFloat(purchaseOrder.shipping).toFixed(2)}
                  </span>
                </div>
              )}
              <div className="border-t pt-3 flex justify-between">
                <span className="font-semibold text-lg">Total</span>
                <span className="font-bold text-lg">
                  {purchaseOrder.total
                    ? `$${parseFloat(purchaseOrder.total).toFixed(2)}`
                    : "$0.00"}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Tracking */}
          <Card>
            <CardHeader>
              <CardTitle>Tracking</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {purchaseOrder.created_by_name && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Created By</label>
                  <p className="text-sm">{purchaseOrder.created_by_name}</p>
                  {purchaseOrder.created_at && (
                    <p className="text-xs text-gray-500">
                      {format(new Date(purchaseOrder.created_at), "MMM dd, yyyy HH:mm")}
                    </p>
                  )}
                </div>
              )}
              {purchaseOrder.submitted_at && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Submitted</label>
                  <p className="text-xs text-gray-500">
                    {format(new Date(purchaseOrder.submitted_at), "MMM dd, yyyy HH:mm")}
                  </p>
                </div>
              )}
              {purchaseOrder.received_at && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Received</label>
                  <p className="text-xs text-gray-500">
                    {format(new Date(purchaseOrder.received_at), "MMM dd, yyyy HH:mm")}
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

