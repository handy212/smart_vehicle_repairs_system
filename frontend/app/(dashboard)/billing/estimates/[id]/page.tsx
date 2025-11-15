"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { billingApi } from "@/lib/api/billing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Edit, Mail, FileText, CheckCircle, XCircle, Download, Wrench, Printer } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useState } from "react";
import { useToast } from "@/lib/hooks/useToast";

export default function EstimateDetailPage() {
  const params = useParams();
  const router = useRouter();
  const estimateId = parseInt(params.id as string);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isConverting, setIsConverting] = useState(false);

  const { data: estimate, isLoading, error } = useQuery({
    queryKey: ["estimate", estimateId],
    queryFn: () => billingApi.estimates.get(estimateId),
  });

  const convertToInvoiceMutation = useMutation({
    mutationFn: () => billingApi.estimates.convertToInvoice(estimateId),
    onSuccess: (invoice) => {
      toast({
        title: "Success",
        description: "Estimate converted to invoice successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["estimates"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      router.push(`/billing/invoices/${invoice.id}`);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to convert estimate",
        variant: "destructive",
      });
    },
  });

  const convertToWorkOrderMutation = useMutation({
    mutationFn: () => billingApi.estimates.convertToWorkOrder(estimateId),
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: "Estimate converted to work order successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["estimates"] });
      queryClient.invalidateQueries({ queryKey: ["workorders"] });
      router.push(`/workorders/${data.work_order_id}`);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to convert estimate",
        variant: "destructive",
      });
    },
  });

  const handleConvertToInvoice = () => {
    if (confirm("Convert this estimate to an invoice? This action cannot be undone.")) {
      setIsConverting(true);
      convertToInvoiceMutation.mutate();
    }
  };

  const handleConvertToWorkOrder = () => {
    if (confirm("Convert this estimate to a work order? This action cannot be undone.")) {
      setIsConverting(true);
      convertToWorkOrderMutation.mutate();
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !estimate) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Card>
          <CardContent className="pt-6">
            <p className="text-red-600">Error loading estimate. Please try again.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "approved":
        return "success";
      case "sent":
      case "viewed":
        return "info";
      case "draft":
        return "default";
      case "declined":
        return "danger";
      case "converted":
        return "secondary";
      default:
        return "default";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Estimate #{estimate.estimate_number}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {estimate.customer_name || "Customer"}
            </p>
          </div>
        </div>
        <div className="flex space-x-2">
          <Link href={`/billing/estimates/${estimateId}/print`} target="_blank">
            <Button variant="outline">
              <Printer className="w-4 h-4 mr-2" />
              Print
            </Button>
          </Link>
          <Button variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Download PDF
          </Button>
          <Button variant="outline">
            <Mail className="w-4 h-4 mr-2" />
            Send Email
          </Button>
        </div>
      </div>

      {/* Status Badge */}
      <div className="flex items-center space-x-2">
        <Badge variant={getStatusVariant(estimate.status) as any} className="text-sm px-3 py-1">
          {estimate.status?.replace("_", " ") || estimate.status}
        </Badge>
        {estimate.is_expired && (
          <Badge variant="danger" className="text-sm px-3 py-1">
            Expired
          </Badge>
        )}
        {estimate.can_be_approved && (
          <Badge variant="info" className="text-sm px-3 py-1">
            Can Be Approved
          </Badge>
        )}
        {estimate.can_be_converted && (
          <Badge variant="info" className="text-sm px-3 py-1">
            Can Be Converted
          </Badge>
        )}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Estimate Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Estimate Information */}
          <Card>
            <CardHeader>
              <CardTitle>Estimate Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Estimate Number</p>
                  <p className="text-gray-900 font-mono">{estimate.estimate_number}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Estimate Date</p>
                  <p className="text-gray-900">
                    {estimate.estimate_date
                      ? format(new Date(estimate.estimate_date), "MMMM dd, yyyy")
                      : "-"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Valid Until</p>
                  <p className="text-gray-900">
                    {estimate.valid_until
                      ? format(new Date(estimate.valid_until), "MMMM dd, yyyy")
                      : "-"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Customer</p>
                  {estimate.customer ? (
                    <Link
                      href={`/customers/${typeof estimate.customer === 'object' && estimate.customer !== null ? estimate.customer.id : estimate.customer}`}
                      className="text-blue-600 hover:text-blue-800 font-medium"
                    >
                      {estimate.customer_name || "View Customer"}
                    </Link>
                  ) : (
                    <p className="text-gray-900">{estimate.customer_name || "-"}</p>
                  )}
                </div>
                {estimate.vehicle && (
                  <div>
                    <p className="text-sm font-medium text-gray-500 mb-1">Vehicle</p>
                    <Link
                      href={`/vehicles/${typeof estimate.vehicle === 'object' && estimate.vehicle !== null ? estimate.vehicle.id : estimate.vehicle}`}
                      className="text-blue-600 hover:text-blue-800 font-medium"
                    >
                      {estimate.vehicle_display || "View Vehicle"}
                    </Link>
                  </div>
                )}
              </div>
              {estimate.title && (
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Title</p>
                  <p className="text-gray-900">{estimate.title}</p>
                </div>
              )}
              {estimate.description && (
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Description</p>
                  <p className="text-gray-900 whitespace-pre-wrap">{estimate.description}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Line Items */}
          <Card>
            <CardHeader>
              <CardTitle>Line Items</CardTitle>
            </CardHeader>
            <CardContent>
              {estimate.line_items && estimate.line_items.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {estimate.line_items.map((item: any, index: number) => (
                        <TableRow key={item.id || index}>
                          <TableCell className="capitalize">{item.item_type?.replace("_", " ")}</TableCell>
                          <TableCell>{item.description || "-"}</TableCell>
                          <TableCell className="text-right">
                            {item.item_type === "labor" 
                              ? `${item.labor_hours || 0}h`
                              : (item.quantity || "-")}
                          </TableCell>
                          <TableCell className="text-right">
                            {item.item_type === "labor"
                              ? (item.labor_rate ? `$${parseFloat(item.labor_rate).toFixed(2)}/hr` : "-")
                              : (item.unit_price ? `$${parseFloat(item.unit_price).toFixed(2)}` : "-")}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {item.total ? `$${parseFloat(item.total).toFixed(2)}` : "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-sm text-gray-500">No line items found.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Summary & Actions */}
        <div className="space-y-6">
          {/* Financial Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Financial Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {estimate.labor_subtotal && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Labor Subtotal</span>
                  <span className="text-sm font-medium text-gray-900">
                    ${parseFloat(estimate.labor_subtotal).toFixed(2)}
                  </span>
                </div>
              )}
              {estimate.parts_subtotal && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Parts Subtotal</span>
                  <span className="text-sm font-medium text-gray-900">
                    ${parseFloat(estimate.parts_subtotal).toFixed(2)}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Subtotal</span>
                <span className="text-gray-900">
                  ${parseFloat(estimate.subtotal || "0").toFixed(2)}
                </span>
              </div>
              {estimate.discount_amount && parseFloat(estimate.discount_amount) > 0 && (
                <div className="flex items-center justify-between text-red-600">
                  <span className="text-sm">Discount</span>
                  <span className="text-sm font-medium">
                    -${parseFloat(estimate.discount_amount).toFixed(2)}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Tax</span>
                <span className="text-gray-900">
                  ${parseFloat(estimate.tax_amount || "0").toFixed(2)}
                </span>
              </div>
              <div className="border-t pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Total</span>
                  <span className="text-lg font-bold text-gray-900">
                    ${parseFloat(estimate.total || "0").toFixed(2)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {estimate.can_be_converted && estimate.status !== "converted" && (
                <>
                  <Button
                    className="w-full"
                    variant="default"
                    onClick={handleConvertToInvoice}
                    disabled={isConverting}
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    Convert to Invoice
                  </Button>
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={handleConvertToWorkOrder}
                    disabled={isConverting}
                  >
                    <Wrench className="w-4 h-4 mr-2" />
                    Convert to Work Order
                  </Button>
                </>
              )}
              {estimate.can_be_approved && estimate.status !== "approved" && (
                <Button className="w-full" variant="outline">
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Approve Estimate
                </Button>
              )}
              <Button className="w-full" variant="outline">
                <Download className="w-4 h-4 mr-2" />
                Download PDF
              </Button>
              <Button className="w-full" variant="outline">
                <Mail className="w-4 h-4 mr-2" />
                Send to Customer
              </Button>
            </CardContent>
          </Card>

          {/* Estimate Info */}
          <Card>
            <CardHeader>
              <CardTitle>Estimate Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {estimate.created_at && (
                <div>
                  <p className="text-xs text-gray-500">Created</p>
                  <p className="text-sm">
                    {format(new Date(estimate.created_at), "MMM dd, yyyy 'at' h:mm a")}
                  </p>
                </div>
              )}
              {estimate.created_by_name && (
                <div>
                  <p className="text-xs text-gray-500">Created By</p>
                  <p className="text-sm">{estimate.created_by_name}</p>
                </div>
              )}
              {estimate.days_until_expiration !== undefined && (
                <div>
                  <p className="text-xs text-gray-500">Days Until Expiration</p>
                  <p className="text-sm">
                    {estimate.days_until_expiration > 0
                      ? `${estimate.days_until_expiration} days`
                      : "Expired"}
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

