"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { billingApi } from "@/lib/api/billing";
import { authApi } from "@/lib/api/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreditCard, DollarSign, FileText, AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/lib/hooks/useToast";
import { useState } from "react";
import apiClient from "@/lib/api/client";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { getUserFacingError } from "@/lib/api/errors";

export default function PaymentPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const queryClient = useQueryClient();
  const invoiceId = parseInt(params.id as string);
  const [isProcessing, setIsProcessing] = useState(false);
  const { formatCurrency } = useCurrency();

  const { data: invoice, isLoading } = useQuery({
    queryKey: ["portal", "invoice", invoiceId],
    queryFn: () => billingApi.invoices.get(invoiceId),
    enabled: !!invoiceId,
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { data: user } = useQuery({
    queryKey: ["user"],
    queryFn: () => authApi.getCurrentUser(),
  });

  const initiatePaymentMutation = useMutation({
    mutationFn: async () => {
      if (!invoice) throw new Error("Invoice not found");

      // Initiate Paystack payment
      const response = await apiClient.post(`/billing/payments/paystack/initiate/${invoiceId}/`);
      return response.data;
    },
    onSuccess: (data) => {
      // Redirect to Paystack checkout
      if (data.authorization_url) {
        window.location.href = data.authorization_url;
      } else {
        toast({
          title: "Payment Initiated",
          description: "Redirecting to payment gateway...",
        });
      }
    },

    onError: (error: any) => {
      toast({
        title: "Payment Failed",
        description: getUserFacingError(error, "Failed to initiate payment. Please try again."),
        variant: "destructive",
      });
      setIsProcessing(false);
    },
  });

  const handlePayNow = () => {
    if (!invoice) return;

    if (invoice.status === "paid") {
      toast({
        title: "Already Paid",
        description: "This invoice has already been paid.",
        variant: "default",
      });
      return;
    }

    if (parseFloat(invoice.balance_due || invoice.total || "0") <= 0) {
      toast({
        title: "No Amount Due",
        description: "There is no amount due on this invoice.",
        variant: "default",
      });
      return;
    }

    setIsProcessing(true);
    initiatePaymentMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48 mb-2" />
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">Invoice not found</p>
        <Button onClick={() => router.push("/portal/invoices")} className="mt-4">
          Back to Invoices
        </Button>
      </div>
    );
  }

  const amountDue = parseFloat(invoice.balance_due || invoice.total || "0");
  const isPaid = invoice.status === "paid";
  const canPay = !isPaid && amountDue > 0 && ["pending", "sent", "overdue"].includes(invoice.status);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Make Payment</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pay for Invoice #{invoice.invoice_number}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Invoice Details */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <FileText className="w-5 h-5" />
                <span>Invoice Details</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Invoice Number</p>
                  <p className="font-semibold text-foreground">
                    #{invoice.invoice_number}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Invoice Date</p>
                  <p className="font-semibold text-foreground">
                    {format(new Date(invoice.invoice_date), "MMM d, yyyy")}
                  </p>
                </div>
                {invoice.due_date && (
                  <div>
                    <p className="text-sm text-muted-foreground">Due Date</p>
                    <p className="font-semibold text-foreground">
                      {format(new Date(invoice.due_date), "MMM d, yyyy")}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge
                    variant={
                      invoice.status === "paid"
                        ? "success"
                        : invoice.status === "overdue"
                          ? "danger"
                          : "warning"
                    }
                  >
                    {invoice.status}
                  </Badge>
                </div>
              </div>

              {invoice.line_items && invoice.line_items.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-semibold text-foreground mb-3">
                    Line Items
                  </h3>
                  <div className="border border-border rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-muted">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                            Description
                          </th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">
                            Quantity
                          </th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">
                            Unit Price
                          </th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">
                            Total
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border dark:divide-border">

                        {invoice.line_items.map((item: any, index: number) => (
                          <tr key={index}>
                            <td className="px-4 py-2 text-sm text-foreground">
                              {item.description}
                            </td>
                            <td className="px-4 py-2 text-sm text-right text-muted-foreground">
                              {item.quantity || "-"}
                            </td>
                            <td className="px-4 py-2 text-sm text-right text-muted-foreground">
                              {formatCurrency(item.unit_price || 0)}
                            </td>
                            <td className="px-4 py-2 text-sm text-right font-medium text-foreground">
                              {formatCurrency(item.total || 0)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="border-t border-border pt-4 space-y-2">
                {invoice.subtotal && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="text-foreground">
                      {formatCurrency(invoice.subtotal)}
                    </span>
                  </div>
                )}
                {invoice.tax_amount && parseFloat(invoice.tax_amount) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tax</span>
                    <span className="text-foreground">
                      {formatCurrency(invoice.tax_amount)}
                    </span>
                  </div>
                )}
                {invoice.discount_amount && parseFloat(invoice.discount_amount) > 0 && (
                  <div className="flex justify-between text-sm text-success">
                    <span>Discount</span>
                    <span>
                      -{formatCurrency(invoice.discount_amount)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold pt-2 border-t border-border">
                  <span className="text-foreground">Total</span>
                  <span className="text-foreground">
                    {formatCurrency(invoice.total || 0)}
                  </span>
                </div>
                {invoice.amount_paid && parseFloat(invoice.amount_paid) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Amount Paid</span>
                    <span className="text-foreground">
                      {formatCurrency(invoice.amount_paid)}
                    </span>
                  </div>
                )}
                {amountDue > 0 && (
                  <div className="flex justify-between text-lg font-bold pt-2 border-t border-border">
                    <span className="text-foreground">Amount Due</span>
                    <span className="text-primary">
                      {formatCurrency(amountDue)}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Payment Summary */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <DollarSign className="w-5 h-5" />
                <span>Payment Summary</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Amount to Pay</p>
                <p className="text-3xl font-bold text-foreground">
                  {formatCurrency(amountDue)}
                </p>
              </div>

              {isPaid ? (
                <div className="bg-success/10 dark:bg-success/20 border border-success/20 dark:border-success/30 rounded-lg p-4">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="w-5 h-5 text-success" />
                    <p className="text-sm font-medium text-success dark:text-success">
                      This invoice has been paid
                    </p>
                  </div>
                </div>
              ) : canPay ? (
                <>
                  <Button
                    onClick={handlePayNow}
                    disabled={isProcessing || initiatePaymentMutation.isPending}
                    className="w-full"
                    size="lg"
                  >
                    {isProcessing || initiatePaymentMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <CreditCard className="w-4 h-4 mr-2" />
                        Pay Now
                      </>
                    )}
                  </Button>

                  <div className="bg-primary/10 dark:bg-warning/20 border border-warning/20 dark:border-warning/30 rounded-lg p-4">
                    <div className="flex items-start space-x-2">
                      <AlertCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-warning dark:text-warning">
                        <p className="font-medium mb-1">Secure Payment</p>

                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="bg-warning/10 dark:bg-warning/15 border border-warning/20 dark:border-warning/40 rounded-lg p-4">
                  <div className="flex items-center space-x-2">
                    <AlertCircle className="w-5 h-5 text-warning dark:text-warning" />
                    <p className="text-sm text-warning dark:text-warning">
                      This invoice is not available for payment
                    </p>
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-border">
                <Button
                  variant="secondary"
                  onClick={() => router.push("/portal/invoices")}
                  className="w-full"
                >
                  Back to Invoices
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

