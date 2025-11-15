"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { billingApi } from "@/lib/api/billing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Edit, Download, Mail, DollarSign, Calendar, User, Printer } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useState } from "react";
import RecordPaymentDialog from "./components/RecordPaymentDialog";

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const invoiceId = parseInt(params.id as string);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);

  const { data: invoice, isLoading, error } = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: () => billingApi.invoices.get(invoiceId),
  });

  const { data: payments } = useQuery({
    queryKey: ["payments", invoiceId],
    queryFn: () => billingApi.payments.list({ invoice: invoiceId }),
    enabled: !!invoice,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Card>
          <CardContent className="pt-6">
            <p className="text-red-600">Error loading invoice. Please try again.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "paid":
        return "success";
      case "sent":
      case "viewed":
        return "info";
      case "partial":
        return "warning";
      case "overdue":
        return "danger";
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
              Invoice #{invoice.invoice_number}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {invoice.customer_name || "Customer"}
            </p>
          </div>
        </div>
        <div className="flex space-x-2">
          <Link href={`/billing/invoices/${invoiceId}/print`} target="_blank">
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
          <Link href={`/billing/invoices/${invoiceId}/edit`}>
            <Button>
              <Edit className="w-4 h-4 mr-2" />
              Edit
            </Button>
          </Link>
        </div>
      </div>

      {/* Status Badge */}
      <div>
        <Badge variant={getStatusVariant(invoice.status) as any} className="text-sm px-3 py-1">
          {invoice.status?.replace("_", " ") || invoice.status}
        </Badge>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Invoice Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Invoice Information */}
          <Card>
            <CardHeader>
              <CardTitle>Invoice Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Invoice Number</p>
                  <p className="text-gray-900 font-mono">{invoice.invoice_number}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Invoice Date</p>
                  <p className="text-gray-900">
                    {invoice.invoice_date
                      ? format(new Date(invoice.invoice_date), "MMMM dd, yyyy")
                      : "-"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Due Date</p>
                  <p className="text-gray-900">
                    {invoice.due_date
                      ? format(new Date(invoice.due_date), "MMMM dd, yyyy")
                      : "-"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Customer</p>
                  {invoice.customer ? (
                    <Link
                      href={`/customers/${typeof invoice.customer === 'object' && invoice.customer !== null ? invoice.customer.id : invoice.customer}`}
                      className="text-blue-600 hover:text-blue-800 font-medium"
                    >
                      {invoice.customer_name || "View Customer"}
                    </Link>
                  ) : (
                    <p className="text-gray-900">{invoice.customer_name || "-"}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Line Items */}
          <Card>
            <CardHeader>
              <CardTitle>Line Items</CardTitle>
            </CardHeader>
            <CardContent>
              {invoice.line_items && invoice.line_items.length > 0 ? (
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
                      {invoice.line_items.map((item: any, index: number) => (
                        <TableRow key={item.id || index}>
                          <TableCell className="capitalize">{item.item_type?.replace("_", " ")}</TableCell>
                          <TableCell>{item.description || "-"}</TableCell>
                          <TableCell className="text-right">{item.quantity || "-"}</TableCell>
                          <TableCell className="text-right">
                            {item.unit_price ? `$${parseFloat(item.unit_price).toFixed(2)}` : "-"}
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

          {/* Payments */}
          {payments && payments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Payment History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {payments.map((payment) => (
                    <div
                      key={payment.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div>
                        <p className="font-medium text-sm">
                          ${parseFloat(payment.amount || "0").toFixed(2)}
                        </p>
                        <p className="text-xs text-gray-500">
                          {format(new Date(payment.payment_date), "MMM dd, yyyy")} • {payment.payment_method}
                        </p>
                      </div>
                      <Badge variant={payment.status === "completed" ? "success" : "warning"}>
                        {payment.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column - Summary */}
        <div className="space-y-6">
          {/* Financial Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Financial Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Subtotal</span>
                <span className="text-gray-900">
                  ${parseFloat(invoice.subtotal || "0").toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Tax</span>
                <span className="text-gray-900">
                  ${parseFloat(invoice.tax_amount || "0").toFixed(2)}
                </span>
              </div>
              <div className="border-t pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Total</span>
                  <span className="text-lg font-bold text-gray-900">
                    ${parseFloat(invoice.total || "0").toFixed(2)}
                  </span>
                </div>
              </div>
              <div className="border-t pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Amount Paid</span>
                  <span className="text-gray-900">
                    ${parseFloat(invoice.amount_paid || "0").toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-sm font-medium text-gray-700">Balance Due</span>
                  <span className="text-lg font-bold text-red-600">
                    ${parseFloat(invoice.balance_due || "0").toFixed(2)}
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
              {invoice.status !== "paid" && parseFloat(invoice.balance_due || "0") > 0 && (
                <Button 
                  className="w-full" 
                  variant="default"
                  onClick={() => setShowPaymentDialog(true)}
                >
                  <DollarSign className="w-4 h-4 mr-2" />
                  Record Payment
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
        </div>
      </div>

      {showPaymentDialog && invoice && (
        <RecordPaymentDialog
          invoice={invoice}
          open={showPaymentDialog}
          onClose={() => setShowPaymentDialog(false)}
          onSuccess={() => {
            setShowPaymentDialog(false);
            // Data will be refreshed automatically via query invalidation
          }}
        />
      )}
    </div>
  );
}

