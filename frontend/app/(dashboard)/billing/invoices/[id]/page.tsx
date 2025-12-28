"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { billingApi } from "@/lib/api/billing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { ArrowLeft, Edit, Download, Mail, DollarSign, Calendar, User, Printer, ExternalLink, CheckCircle2, ChevronDown, MoreVertical, Receipt, FileCheck } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import RecordPaymentDialog from "./components/RecordPaymentDialog";
import ProcessRefundDialog from "./components/ProcessRefundDialog";
import { useBranchStore } from "@/store/branchStore";
import { useToast } from "@/lib/hooks/useToast";
import { usePrint } from "@/lib/hooks/usePrint";
import { Undo2 } from "lucide-react";

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const invoiceId = parseInt(params.id as string);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [selectedPaymentForRefund, setSelectedPaymentForRefund] = useState<any | null>(null);
  const [localStatus, setLocalStatus] = useState<string | null>(null);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { downloadPDF, isDownloading } = usePrint();

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

  const convertToInvoiceMutation = useMutation({
    mutationFn: async () => {
      return billingApi.invoices.convertToInvoice(invoiceId);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["invoice", invoiceId] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast({
        title: "Success",
        description: `Proforma converted to invoice ${data.invoice_number} successfully`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to convert proforma. Please try again.",
        variant: "destructive",
      });
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
        <Button variant="secondary" onClick={() => router.back()}>
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
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center space-x-4">
            <Button variant="secondary" onClick={() => router.back()} className="no-print">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm font-semibold text-gray-700 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-300">
                  Invoice #{invoice.invoice_number}
                </span>
                {invoice.work_order && invoice.work_order_number && (
                  <Link href={`/workorders/${typeof invoice.work_order === 'object' ? invoice.work_order.id : invoice.work_order}`}>
                    <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors dark:bg-blue-950/20 dark:border-blue-800 dark:text-blue-400">
                      <span className="h-2 w-2 rounded-full bg-blue-500" />
                      Work Order #{invoice.work_order_number}
                    </span>
                  </Link>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-2">
                {invoice.customer_name || "Customer"}
              </p>
            </div>
          </div>
          <div className="relative no-print">
            <Button
              variant="secondary"
              onClick={() => setShowActionsMenu(!showActionsMenu)}
              className="gap-2"
            >
              <MoreVertical className="w-4 h-4" />
              Actions
              <ChevronDown className={`w-4 h-4 transition-transform ${showActionsMenu ? 'rotate-180' : ''}`} />
            </Button>

            {showActionsMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowActionsMenu(false)}
                />
                <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 z-20">
                  <div className="py-1">
                    <button
                      onClick={() => {
                        handlePrint();
                        setShowActionsMenu(false);
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                    >
                      <Printer className="w-4 h-4" />
                      Print
                    </button>
                    <button
                      onClick={() => {
                        downloadPDF({
                          documentType: 'invoice',
                          documentId: invoiceId,
                          documentNumber: invoice.invoice_number
                        });
                        setShowActionsMenu(false);
                      }}
                      disabled={isDownloading}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Download className="w-4 h-4" />
                      {isDownloading ? 'Generating...' : 'Download PDF'}
                    </button>
                    <button
                      onClick={() => {
                        if (confirm("Send this invoice to the customer via email?")) {
                          sendEmailMutation.mutate();
                        }
                        setShowActionsMenu(false);
                      }}
                      disabled={sendEmailMutation.isPending}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Mail className="w-4 h-4" />
                      {sendEmailMutation.isPending ? "Sending..." : "Send Email"}
                    </button>
                    {/* Only show Convert to Invoice for proforma invoices */}
                    {invoice.status === 'proforma' && (
                      <>
                        <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                        <button
                          onClick={() => {
                            if (confirm("Convert this proforma to a standard invoice? This will assign a new invoice number.")) {
                              convertToInvoiceMutation.mutate();
                            }
                            setShowActionsMenu(false);
                          }}
                          disabled={convertToInvoiceMutation.isPending}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <FileCheck className="w-4 h-4" />
                          {convertToInvoiceMutation.isPending ? "Converting..." : "Convert to Invoice"}
                        </button>
                      </>
                    )}
                    {/* Only show Record Payment if invoice is not fully paid */}
                    {invoice.status !== 'paid' && parseFloat(invoice.balance_due || "0") > 0 && (
                      <>
                        <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                        <button
                          onClick={() => {
                            setShowPaymentDialog(true);
                            setShowActionsMenu(false);
                          }}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                        >
                          <DollarSign className="w-4 h-4" />
                          Record Payment
                        </button>
                      </>
                    )}
                    <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                    <Link href={`/billing/invoices/${invoiceId}/edit`}>
                      <button
                        onClick={() => setShowActionsMenu(false)}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                      >
                        <Edit className="w-4 h-4" />
                        Edit
                      </button>
                    </Link>
                  </div>
                </div>
              </>
            )}
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
            <Card>
              <CardHeader>
                <CardTitle>Payment History</CardTitle>
              </CardHeader>
              <CardContent>
                {payments && payments.length > 0 ? (
                  <div className="space-y-3">
                    {payments.map((payment: any) => (
                      <div
                        key={payment.id}
                        className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-1">
                            <p className="font-semibold text-lg text-gray-900 dark:text-gray-100">
                              ${parseFloat(payment.amount || "0").toFixed(2)}
                            </p>
                            <Badge variant={payment.status === "completed" ? "success" : payment.status === "pending" ? "warning" : "danger"}>
                              {payment.status?.charAt(0).toUpperCase() + payment.status?.slice(1) || "Unknown"}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-400 mt-2">
                            <div>
                              <span className="font-medium">Date:</span> {format(new Date(payment.payment_date), "MMM dd, yyyy")}
                            </div>
                            <div>
                              <span className="font-medium">Method:</span> {payment.payment_method?.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase()) || "N/A"}
                            </div>
                            {payment.payment_number && (
                              <div>
                                <span className="font-medium">Payment #:</span> {payment.payment_number}
                              </div>
                            )}
                            {payment.reference_number && (
                              <div>
                                <span className="font-medium">Reference:</span> {payment.reference_number}
                              </div>
                            )}
                          </div>
                          {payment.notes && (
                            <p className="text-xs text-gray-500 dark:text-gray-500 mt-2 italic">
                              {payment.notes}
                            </p>
                          )}
                          {payment.refund_amount && parseFloat(payment.refund_amount) > 0 && (
                            <div className="mt-2">
                              <Badge variant="danger" className="text-xs">
                                Refunded: ${parseFloat(payment.refund_amount).toFixed(2)}
                              </Badge>
                            </div>
                          )}
                          {payment.status === 'completed' && (
                            <div className="flex gap-2 mt-3">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 gap-1"
                                onClick={() => downloadPDF({
                                  documentType: 'receipt',
                                  documentId: payment.id,
                                  documentNumber: payment.payment_number
                                })}
                                disabled={isDownloading}
                              >
                                <Printer className="h-3.5 w-3.5" />
                                Receipt
                              </Button>
                              {(parseFloat(payment.amount) - parseFloat(payment.refund_amount || "0")) > 0 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 text-red-600 hover:text-red-700 hover:bg-red-50 gap-1"
                                  onClick={() => setSelectedPaymentForRefund(payment)}
                                >
                                  <Undo2 className="h-3.5 w-3.5" />
                                  Issue Refund
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    <div className="pt-2 border-t border-gray-200 dark:border-gray-700 mt-4">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-gray-700 dark:text-gray-300">Total Paid:</span>
                        <span className="font-bold text-lg text-green-600 dark:text-green-400">
                          ${payments.reduce((sum: number, p: any) => sum + parseFloat(p.amount || "0") - parseFloat(p.refund_amount || "0"), 0).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <DollarSign className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-500 text-sm">No payments recorded yet</p>
                  </div>
                )}
              </CardContent>
            </Card>
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

        {selectedPaymentForRefund && (
          <ProcessRefundDialog
            payment={selectedPaymentForRefund}
            open={!!selectedPaymentForRefund}
            onClose={() => setSelectedPaymentForRefund(null)}
            onSuccess={() => {
              setSelectedPaymentForRefund(null);
            }}
          />
        )}
      </div>
    </>
  );
}

