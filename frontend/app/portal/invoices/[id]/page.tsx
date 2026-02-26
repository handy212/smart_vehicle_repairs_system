"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { billingApi } from "@/lib/api/billing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { FileText, DollarSign, Calendar, ArrowLeft, Download, CreditCard, AlertCircle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { usePrint } from "@/lib/hooks/usePrint";

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const invoiceId = parseInt(params.id as string);
  const { formatCurrency } = useCurrency();
  const { openPrintWindow, isOpeningPrint } = usePrint();

  const { data: invoice, isLoading } = useQuery({
    queryKey: ["portal", "invoice", invoiceId],
    queryFn: () => billingApi.invoices.get(invoiceId),
    enabled: !!invoiceId,
  });

  // Fetch payments for this invoice
  const { data: paymentsData, isLoading: paymentsLoading } = useQuery({
    queryKey: ["portal", "invoice", invoiceId, "payments"],
    queryFn: () => billingApi.payments.list({ invoice: invoiceId, ordering: "-payment_date" }),
    enabled: !!invoiceId,
  });


  const payments = (paymentsData || []) as any[];

  const handlePrint = () => {
    openPrintWindow({ documentType: 'invoice', documentId: invoiceId });
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

  if (!invoice) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground mb-4">Invoice not found</p>
        <Button onClick={() => router.push("/portal/invoices")}>Back to Invoices</Button>
      </div>
    );
  }

  const amountDue = parseFloat(invoice.balance_due || invoice.total || "0");
  const isPaid = invoice.status === "paid";
  const canPay = !isPaid && amountDue > 0 && ["pending", "sent", "overdue"].includes(invoice.status);

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
            {invoice.status === 'proforma' ? 'Proforma Invoice' : 'Invoice'} #{invoice.invoice_number}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {invoice.status === 'proforma' ? 'Proforma Details' : 'Invoice Details'}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {canPay && (
            <Link href={`/portal/payment/${invoice.id}`}>
              <Button>
                <CreditCard className="w-4 h-4 mr-2" />
                Pay Now
              </Button>
            </Link>
          )}
          <Button variant="secondary" onClick={handlePrint} disabled={isOpeningPrint}>
            <Download className="w-4 h-4 mr-2" />
            {isOpeningPrint ? 'Opening...' : 'Print / PDF'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Invoice Details */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <FileText className="w-5 h-5" />
                <span>Invoice Information</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Invoice Number</p>
                  <p className="font-semibold text-foreground">
                    #{invoice.invoice_number}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Invoice Date</p>
                  <p className="font-semibold text-foreground">
                    {format(new Date(invoice.invoice_date), "MMM d, yyyy")}
                  </p>
                </div>
                {invoice.due_date && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Due Date</p>
                    <p className="font-semibold text-foreground">
                      {format(new Date(invoice.due_date), "MMM d, yyyy")}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Status</p>
                  <Badge
                    variant={
                      invoice.status === "paid"
                        ? "success"
                        : invoice.status === "overdue"
                          ? "danger"
                          : invoice.status === "proforma"
                            ? "secondary"
                            : "warning"
                    }
                  >
                    {invoice.status}
                  </Badge>
                </div>
              </div>


              {invoice.work_order && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Work Order</p>
                  <p className="font-medium text-foreground">
                    #{typeof invoice.work_order === 'object' && invoice.work_order !== null
                      ? invoice.work_order.id
                      : invoice.work_order}
                  </p>
                </div>
              )}

              {invoice.notes && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm text-card-foreground whitespace-pre-wrap">
                    {invoice.notes}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Line Items */}
          {invoice.line_items && invoice.line_items.length > 0 && (
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

                      {invoice.line_items.map((item: any, index: number) => (
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

          {/* Payment History */}
          {payments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <CreditCard className="w-5 h-5" />
                  <span>Payment History</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {paymentsLoading ? (
                  <div className="space-y-3">
                    {[1, 2].map((i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Payment #</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>

                      {payments.map((payment: any) => (
                        <TableRow key={payment.id}>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(payment.payment_date), "MMM d, yyyy")}
                          </TableCell>
                          <TableCell className="text-sm font-medium text-foreground">
                            {payment.payment_number || `#${payment.id}`}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground capitalize">
                            {payment.payment_method}
                          </TableCell>
                          <TableCell className="text-right font-medium text-foreground">
                            {formatCurrency(payment.amount || 0)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                payment.status === "completed" || payment.status === "success"
                                  ? "success"
                                  : payment.status === "pending"
                                    ? "warning"
                                    : "secondary"
                              }
                            >
                              {payment.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                {payments.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-card-foreground">
                        Total Paid:
                      </span>
                      <span className="text-lg font-bold text-success">
                        {formatCurrency(payments.reduce((sum, p) => sum + parseFloat(p.amount || "0"), 0))}
                      </span>
                    </div>
                  </div>
                )}
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
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

