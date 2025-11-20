"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { billingApi } from "@/lib/api/billing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { ArrowLeft, Edit, Download, Mail, DollarSign, Calendar, User, Printer, ExternalLink, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import RecordPaymentDialog from "./components/RecordPaymentDialog";
import { useBranchStore } from "@/store/branchStore";

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const invoiceId = parseInt(params.id as string);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [localStatus, setLocalStatus] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: invoice, isLoading, error } = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: () => billingApi.invoices.get(invoiceId),
  });

  // Update local status when invoice data changes
  useEffect(() => {
    if (invoice?.status) {
      setLocalStatus(invoice.status);
    }
  }, [invoice?.status]);

  const { data: payments } = useQuery({
    queryKey: ["payments", invoiceId],
    queryFn: () => billingApi.payments.list({ invoice: invoiceId }),
    enabled: !!invoice,
  });

  const statusChangeMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      return billingApi.invoices.update(invoiceId, { status: newStatus });
    },
    onMutate: async (newStatus) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["invoice", invoiceId] });
      
      // Snapshot previous value
      const previousInvoice = queryClient.getQueryData(["invoice", invoiceId]);
      
      // Optimistically update
      queryClient.setQueryData(["invoice", invoiceId], (old: any) => ({
        ...old,
        status: newStatus,
      }));
      setLocalStatus(newStatus);
      
      return { previousInvoice };
    },
    onError: (err, newStatus, context) => {
      // Rollback on error
      if (context?.previousInvoice) {
        queryClient.setQueryData(["invoice", invoiceId], context.previousInvoice);
        setLocalStatus((context.previousInvoice as any)?.status || invoice?.status || null);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoice", invoiceId] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });

  const sendEmailMutation = useMutation({
    mutationFn: async () => {
      return billingApi.invoices.send(invoiceId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoice", invoiceId] });
      alert("Invoice sent successfully!");
    },
    onError: () => {
      alert("Failed to send invoice. Please try again.");
    },
  });

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatus = e.target.value;
    if (newStatus && newStatus !== localStatus) {
      statusChangeMutation.mutate(newStatus);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api'}/billing/invoices/${invoiceId}/pdf/`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
          'X-Branch-ID': useBranchStore.getState().activeBranchId?.toString() || '',
        },
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Failed to generate PDF: ${response.status} ${response.statusText}`);
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice_${invoice?.invoice_number || invoiceId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to download PDF. Please try again.';
      alert(errorMessage);
      console.error('PDF download error:', error);
    }
  };

  const handleSendEmail = () => {
    if (confirm("Send this invoice to the customer via email?")) {
      sendEmailMutation.mutate();
    }
  };

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

  const parseAmount = (value?: string | number | null) => {
    if (value === null || value === undefined) {
      return 0;
    }
    const num = typeof value === "number" ? value : parseFloat(value);
    return Number.isNaN(num) ? 0 : num;
  };

  const taxBreakdown = {
    regime: invoice.tax_breakdown?.regime || invoice.tax_regime || "ghana_standard",
    nhilAmount: parseAmount(invoice.tax_breakdown?.nhil_amount ?? invoice.tax_nhil_amount),
    getfundAmount: parseAmount(invoice.tax_breakdown?.getfund_amount ?? invoice.tax_getfund_amount),
    hrlAmount: parseAmount(invoice.tax_breakdown?.hrl_amount ?? invoice.tax_hrl_amount),
    vatAmount: parseAmount(invoice.tax_breakdown?.vat_amount ?? invoice.tax_vat_amount),
    totalTax: parseAmount(invoice.tax_breakdown?.total_tax ?? invoice.tax_amount),
  };
  const hasDetailedTax =
    taxBreakdown.nhilAmount > 0 ||
    taxBreakdown.getfundAmount > 0 ||
    taxBreakdown.hrlAmount > 0 ||
    taxBreakdown.vatAmount > 0;

  return (
    <>
      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; padding: 20px; }
          .print-page { page-break-after: auto; }
        }
      `}</style>
      <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="outline" onClick={() => router.back()} className="no-print">
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
        <div className="flex space-x-2 no-print">
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-2" />
            Print
          </Button>
          <Button variant="outline" onClick={handleDownloadPDF}>
            <Download className="w-4 h-4 mr-2" />
            Download PDF
          </Button>
          <Button variant="outline" onClick={() => setShowPaymentDialog(true)}>
            <DollarSign className="w-4 h-4 mr-2" />
            Record Payment
          </Button>
          <Button 
            variant="outline" 
            onClick={handleSendEmail}
            disabled={sendEmailMutation.isPending}
          >
            <Mail className="w-4 h-4 mr-2" />
            {sendEmailMutation.isPending ? "Sending..." : "Send Email"}
          </Button>
          <Link href={`/billing/invoices/${invoiceId}/edit`}>
            <Button>
              <Edit className="w-4 h-4 mr-2" />
              Edit
            </Button>
          </Link>
        </div>
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
                  <p className="text-sm font-medium text-gray-500 mb-2">Status</p>
                  <div className="flex items-center gap-2">
                    <Badge variant={getStatusVariant(localStatus || invoice.status)}>
                      {(localStatus || invoice.status).replace("_", " ").toUpperCase()}
                    </Badge>
                    <select
                      value={localStatus || invoice.status}
                      onChange={handleStatusChange}
                      disabled={statusChangeMutation.isPending}
                      className="px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option value="draft">Draft</option>
                      <option value="sent">Sent</option>
                      <option value="viewed">Viewed</option>
                      <option value="partial">Partially Paid</option>
                      <option value="paid">Paid</option>
                      <option value="overdue">Overdue</option>
                      <option value="void">Void</option>
                    </select>
                    {statusChangeMutation.isPending && (
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600"></div>
                    )}
                  </div>
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
                  {invoice.customer_email && (
                    <p className="text-xs text-gray-500 mt-1">{invoice.customer_email}</p>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Vehicle</p>
                  <p className="text-gray-900">{invoice.vehicle_display || "No vehicle"}</p>
                  {invoice.vehicle_vin && (
                    <p className="text-xs text-gray-500 mt-1">VIN: {invoice.vehicle_vin}</p>
                  )}
                </div>
              </div>
              
              {((invoice as any).description || (invoice as any).terms) && (
                <div className="border-t pt-4 mt-4 space-y-3">
                  {(invoice as any).description && (
                    <div>
                      <p className="text-sm font-medium text-gray-500 mb-1">Description</p>
                      <p className="text-gray-900 text-sm">{(invoice as any).description}</p>
                    </div>
                  )}
                  {(invoice as any).terms && (
                    <div>
                      <p className="text-sm font-medium text-gray-500 mb-1">Payment Terms</p>
                      <p className="text-gray-900 text-sm">{(invoice as any).terms}</p>
                    </div>
                  )}
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
              
              {/* Discount Display */}
              {parseFloat(invoice.discount_percentage || "0") > 0 && parseFloat(invoice.discount_amount || "0") > 0 && (
                <>
                  <div className="flex items-center justify-between text-red-600">
                    <span className="text-sm">
                      Discount ({parseFloat(invoice.discount_percentage || "0").toFixed(1)}%)
                      {invoice.discount_reason && (
                        <span className="text-xs text-gray-500 ml-1">- {invoice.discount_reason}</span>
                      )}
                    </span>
                    <span>
                      -${parseFloat(invoice.discount_amount || "0").toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between font-medium border-t pt-2">
                    <span className="text-sm text-gray-500">Subtotal after Discount</span>
                    <span className="text-gray-900">
                      ${(parseFloat(invoice.subtotal || "0") - parseFloat(invoice.discount_amount || "0")).toFixed(2)}
                    </span>
                  </div>
                </>
              )}
              
              {hasDetailedTax ? (
                <>
                  {taxBreakdown.nhilAmount > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">NHIL</span>
                      <span className="text-gray-900">
                        ${taxBreakdown.nhilAmount.toFixed(2)}
                      </span>
                    </div>
                  )}
                  {taxBreakdown.getfundAmount > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">GETFund</span>
                      <span className="text-gray-900">
                        ${taxBreakdown.getfundAmount.toFixed(2)}
                      </span>
                    </div>
                  )}
                  {taxBreakdown.hrlAmount > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">COVID-19</span>
                      <span className="text-gray-900">
                        ${taxBreakdown.hrlAmount.toFixed(2)}
                      </span>
                    </div>
                  )}
                  {taxBreakdown.vatAmount > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">VAT</span>
                      <span className="text-gray-900">
                        ${taxBreakdown.vatAmount.toFixed(2)}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Tax</span>
                  <span className="text-gray-900">
                    ${taxBreakdown.totalTax.toFixed(2)}
                  </span>
                </div>
              )}
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
    </>
  );
}

