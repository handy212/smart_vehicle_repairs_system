"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { EstimateLineItem, billingApi } from "@/lib/api/billing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { FileText, DollarSign, Calendar, ArrowLeft, Download, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/lib/hooks/useToast";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { usePrint } from "@/lib/hooks/usePrint";
import { getUserFacingError } from "@/lib/api/errors";

type ApiError = {
  response?: {
    data?: {
      error?: string;
      detail?: string;
    };
  };
};

export default function EstimateDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const estimateId = parseInt(params.id as string);
  const { formatCurrency } = useCurrency();
  const { openPrintWindow, isOpeningPrint } = usePrint();

  const { data: estimate, isLoading } = useQuery({
    queryKey: ["portal", "estimate", estimateId],
    queryFn: () => billingApi.estimates.get(estimateId),
    enabled: !!estimateId,
  });

  const approveMutation = useMutation({
    mutationFn: () => billingApi.estimates.approve(estimateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal", "estimate", estimateId] });
      queryClient.invalidateQueries({ queryKey: ["portal", "estimates"] });
      toast({
        title: "Estimate Approved",
        description: "The estimate has been successfully approved.",
      });
    },

    onError: (error: ApiError) => {
      toast({
        title: "Approval Failed",
        description: getUserFacingError(error, "Failed to approve estimate. Please try again."),
        variant: "destructive",
      });
    },
  });

  const declineMutation = useMutation({
    mutationFn: (reason?: string) => billingApi.estimates.decline(estimateId, reason || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portal", "estimate", estimateId] });
      queryClient.invalidateQueries({ queryKey: ["portal", "estimates"] });
      toast({
        title: "Estimate Declined",
        description: "The estimate has been successfully declined.",
      });
    },

    onError: (error: ApiError) => {
      toast({
        title: "Decline Failed",
        description: getUserFacingError(error, "Failed to decline estimate. Please try again."),
        variant: "destructive",
      });
    },
  });

  const handlePrint = () => {
    openPrintWindow({ documentType: 'estimate', documentId: estimateId });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!estimate) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground mb-4">Estimate not found</p>
        <Button onClick={() => router.push("/portal/estimates")}>Back to Estimates</Button>
      </div>
    );
  }

  const isActionableWorkOrder = !estimate.work_order_status || estimate.work_order_status === "awaiting_approval";
  const canApprove = ["sent", "viewed"].includes(estimate.status) && isActionableWorkOrder;
  const canDecline = ["sent", "viewed"].includes(estimate.status) && isActionableWorkOrder;
  const isStaleWorkOrderEstimate = ["sent", "viewed"].includes(estimate.status) && !isActionableWorkOrder;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" onClick={() => router.back()} className="mb-2 -ml-2">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <h1 className="text-3xl font-bold text-foreground">
            Estimate #{estimate.estimate_number}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Estimate Details</p>
        </div>
        <div className="flex items-center space-x-2">
          {canApprove && (
            <Button
              variant="default"
              onClick={() => approveMutation.mutate()}
              disabled={approveMutation.isPending}
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Approve
            </Button>
          )}
          {canDecline && (
            <Button
              variant="destructive"
              onClick={() => declineMutation.mutate(undefined)}
              disabled={declineMutation.isPending}
            >
              <XCircle className="w-4 h-4 mr-2" />
              Decline
            </Button>
          )}
          <Button variant="secondary" onClick={handlePrint} disabled={isOpeningPrint}>
            <Download className="w-4 h-4 mr-2" />
            {isOpeningPrint ? 'Opening...' : 'Print / PDF'}
          </Button>
        </div>
      </div>

      {/* Status Alert */}
      {["sent", "viewed"].includes(estimate.status) && isActionableWorkOrder && (
        <Card className="bg-warning/10 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800">
          <CardContent className="p-4 flex items-center space-x-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
            <div>
              <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100">
                Action Required
              </p>
              <p className="text-xs text-yellow-800 dark:text-yellow-200">
                Please review and approve or decline this estimate.
                {estimate.days_until_expiration !== null && (
                  <> It expires in {estimate.days_until_expiration} days.</>
                )}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {isStaleWorkOrderEstimate && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 flex items-start space-x-3">
            <AlertCircle className="mt-0.5 w-5 h-5 text-destructive" />
            <div>
              <p className="text-sm font-medium text-foreground">Estimate No Longer Actionable</p>
              <p className="text-xs text-muted-foreground">
                The linked work order is already {estimate.work_order_status?.replace(/_/g, " ")}.
                Contact the service advisor for a current estimate if more work needs approval.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Estimate Details */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <FileText className="w-5 h-5" />
                <span>Estimate Information</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Estimate Number</p>
                  <p className="font-semibold text-foreground">
                    #{estimate.estimate_number}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Estimate Date</p>
                  <p className="font-semibold text-foreground">
                    {format(new Date(estimate.estimate_date), "MMM d, yyyy")}
                  </p>
                </div>
                {estimate.valid_until && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Expiration Date</p>
                    <p className="font-semibold text-foreground">
                      {format(new Date(estimate.valid_until), "MMM d, yyyy")}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Status</p>
                  <Badge
                    variant={
                      estimate.status === "approved"
                        ? "success"
                        : estimate.status === "declined"
                          ? "danger"
                          : estimate.status === "expired"
                            ? "danger"
                            : "warning"
                    }
                  >
                    {estimate.status}
                  </Badge>
                </div>
              </div>

              {estimate.vehicle_display && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Vehicle</p>
                  <p className="font-medium text-foreground">
                    {estimate.vehicle_display}
                  </p>
                </div>
              )}

              {estimate.work_order && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Work Order</p>
                  <p className="font-medium text-foreground">
                    #{typeof estimate.work_order === 'object' && estimate.work_order !== null
                      ? estimate.work_order.id
                      : estimate.work_order}
                  </p>
                </div>
              )}

              {estimate.notes && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm text-card-foreground whitespace-pre-wrap">
                    {estimate.notes}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Line Items */}
          {estimate.line_items && estimate.line_items.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Line Items</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Description
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Quantity
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Unit Price
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">

                      {estimate.line_items.map((item: EstimateLineItem, index: number) => (
                        <tr key={index} className="hover:bg-muted hover:bg-muted">
                          <td className="px-4 py-3 text-sm text-foreground">
                            {item.description}
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-muted-foreground">
                            {item.quantity || "-"}
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-muted-foreground">
                            {formatCurrency(item.unit_price || 0)}
                          </td>
                          <td className="px-4 py-3 text-sm text-right font-medium text-foreground">
                            {formatCurrency(item.total || 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Summary */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <DollarSign className="w-5 h-5" />
                <span>Summary</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {estimate.subtotal && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="text-foreground">
                    {formatCurrency(estimate.subtotal)}
                  </span>
                </div>
              )}
              {estimate.tax_amount && parseFloat(estimate.tax_amount) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tax</span>
                  <span className="text-foreground">
                    {formatCurrency(estimate.tax_amount)}
                  </span>
                </div>
              )}
              {estimate.discount_amount && parseFloat(estimate.discount_amount) > 0 && (
                <div className="flex justify-between text-sm text-success">
                  <span>Discount</span>
                  <span>
                    -{formatCurrency(estimate.discount_amount)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold pt-2 border-t border-border">
                <span className="text-foreground">Total</span>
                <span className="text-foreground">
                  {formatCurrency(estimate.total || 0)}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
