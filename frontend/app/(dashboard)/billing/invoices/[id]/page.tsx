"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { billingApi, Invoice, InvoiceLineItem, Payment } from "@/lib/api/billing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
// eslint-disable-next-line @typescript-eslint/no-unused-vars 
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
// eslint-disable-next-line @typescript-eslint/no-unused-vars 
import { ArrowLeft, Edit, Download, Mail, DollarSign, Calendar, User, Printer, ExternalLink, CheckCircle2, ChevronDown, MoreVertical, Receipt, FileCheck, Plus, CreditCard, Wrench, Clock, StickyNote, FileText, MessageSquare, Sparkles, Loader2, Trash2 } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { cn } from "@/lib/utils/cn";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import RecordPaymentDialog from "./components/RecordPaymentDialog";
import ProcessRefundDialog from "./components/ProcessRefundDialog";
import { AllocationHistory } from "@/components/billing/AllocationHistory";
import { InvoiceNotes } from "./components/InvoiceNotes";
import { InvoiceReminders } from "./components/InvoiceReminders";
import { InvoiceActivityLog } from "./components/InvoiceActivityLog";
// eslint-disable-next-line @typescript-eslint/no-unused-vars 
import { useBranchStore } from "@/store/branchStore";
import { useToast } from "@/lib/hooks/useToast";
import { usePrint } from "@/lib/hooks/usePrint";
import { useAuthStore } from "@/store/authStore";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { Undo2, Database } from "lucide-react";
import { quickbooksApi } from "@/lib/api/quickbooks";
import { useQuickBooksConnection } from "@/hooks/useQuickBooksConnection";

import { useCurrency } from "@/lib/hooks/useCurrency";

const parseAmount = (value?: string | number | null) => {
  if (value === null || value === undefined) {
    return 0;
  }
  const num = typeof value === "number" ? value : parseFloat(value);
  return Number.isNaN(num) ? 0 : num;
};

const hasAmountValue = (value?: string | number | null) =>
  value !== null && value !== undefined && String(value).trim() !== "";

const getInvoiceBalanceDue = (invoice?: Invoice | null) => {
  if (!invoice) {
    return 0;
  }

  if (hasAmountValue(invoice.balance_due)) {
    return parseAmount(invoice.balance_due);
  }

  if (hasAmountValue(invoice.amount_due)) {
    return parseAmount(invoice.amount_due);
  }

  return Math.max(parseAmount(invoice.total) - parseAmount(invoice.amount_paid), 0);
};

export default function InvoiceDetailPage() {
  const { formatCurrency } = useCurrency();
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuthStore();
  const { hasPermission, hasAnyPermission } = usePermissions();
  const invoiceId = parseInt(params.id as string);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);

  const [selectedPaymentForRefund, setSelectedPaymentForRefund] = useState<Payment | null>(null);
  const [showActionsMenu, setShowActionsMenu] = useState(false);

  const [isMessageDialogOpen, setIsMessageDialogOpen] = useState(false);
  const [communicationMethod, setCommunicationMethod] = useState<"sms" | "email">("email");
  const [messageSubject, setMessageSubject] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [isFetchingSuggestion, setIsFetchingSuggestion] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { downloadPDF, openPrintWindow, isDownloading, isOpeningPrint } = usePrint();
  const [isSyncing, setIsSyncing] = useState(false);
  const { isConnected: isQboConnected } = useQuickBooksConnection();

  const handleQBOSync = async () => {
    try {
      setIsSyncing(true);
      await quickbooksApi.syncInbound();
      toast({
        title: "QuickBooks Sync",
        description: "Consistency check triggered. Status should update shortly.",
      });
      // Invalidate query to refresh UI
      queryClient.invalidateQueries({ queryKey: ["invoice", invoiceId] });
    } catch {
      toast({
        title: "Sync Failed",
        description: "Failed to trigger QuickBooks synchronization.",
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Validate invoiceId to prevent NaN API calls
  const isValidId = !isNaN(invoiceId) && invoiceId > 0;

  const { data: invoice, isLoading, error } = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: () => billingApi.invoices.get(invoiceId),
    enabled: isValidId,
  });

  const canEditInvoice = hasPermission("edit_invoices");
  const canSendInvoice = hasAnyPermission(["edit_invoices", "send_notifications"]);
  const canConvertProforma = hasPermission("create_invoices");
  const canRecordPayment = hasAnyPermission(["create_payments", "process_payments", "manage_billing"]);
  const canDeleteInvoice = hasAnyPermission(["delete_invoices", "manage_billing"]);
  const canManagePaymentAdjustments = hasAnyPermission([
    "process_payments",
    "refund_payments",
    "manage_billing",
  ]);
  const currentStatus = invoice?.status ?? null;
  const balanceDue = getInvoiceBalanceDue(invoice);
  const canAcceptPayment = canRecordPayment && currentStatus !== 'paid' && currentStatus !== 'void' && balanceDue > 0;
  const getApiErrorMessage = (error: unknown, fallback: string) => {
    if (typeof error === "object" && error && "response" in error) {
      const response = (error as { response?: { data?: { error?: string; detail?: string } } }).response;
      return response?.data?.error || response?.data?.detail || fallback;
    }
    return fallback;
  };

  const { data: payments } = useQuery({
    queryKey: ["payments", invoiceId],
    queryFn: () => billingApi.payments.list({ invoice: invoiceId }),
    enabled: !!invoice,
  });

  useEffect(() => {
    if (searchParams.get("action") !== "record_payment" || !invoice) {
      return;
    }

    if (canAcceptPayment) {
      setShowPaymentDialog(true);
    } else {
      setShowPaymentDialog(false);
      if (invoice.status === "paid" || balanceDue <= 0) {
        toast({
          title: "Invoice Already Paid",
          description: "This invoice has no balance due, so another payment cannot be recorded.",
          variant: "destructive",
        });
      }
    }
  }, [balanceDue, canAcceptPayment, invoice, searchParams, toast]);

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

      queryClient.setQueryData<Invoice | undefined>(["invoice", invoiceId], (old) =>
        old ? { ...old, status: newStatus } : old
      );

      return { previousInvoice };
    },
    onError: (err, newStatus, context) => {
      // Rollback on error
      if (context?.previousInvoice) {
        queryClient.setQueryData(["invoice", invoiceId], context.previousInvoice);
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

    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: getApiErrorMessage(error, "Failed to convert proforma. Please try again."),
        variant: "destructive",
      });
    },
  });

  const deleteInvoiceMutation = useMutation({
    mutationFn: async () => {
      return billingApi.invoices.delete(invoiceId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast({
        title: "Invoice Deleted",
        description: "The invoice was deleted successfully.",
      });
      router.push("/billing/invoices");
    },
    onError: (error: unknown) => {
      toast({
        title: "Delete Failed",
        description: getApiErrorMessage(error, "Failed to delete invoice. Please try again."),
        variant: "destructive",
      });
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: (data: { method: "sms" | "email", message: string, subject?: string }) => {
      if (data.method === "email") {
        return billingApi.invoices.sendEmail(invoiceId, data.subject || "", data.message);
      }
      return billingApi.invoices.sendSms(invoiceId, data.message);
    },
    onSuccess: (data, variables) => {
      toast({
        title: "Success",
        description: variables.method === "email" ? "Email sent to customer successfully" : "SMS sent to customer successfully"
      });
      setIsMessageDialogOpen(false);
      setMessageBody("");
      setMessageSubject("");
    },

    onError: (error: unknown, variables) => {
      toast({
        title: variables.method === "email" ? "Email Failed" : "SMS Failed",
        description: getApiErrorMessage(error, `Failed to send ${variables.method === "email" ? "email" : "SMS"}`),
        variant: "destructive"
      });
    }
  });

  const fetchSuggestion = useCallback(async (method: "sms" | "email") => {
    setIsFetchingSuggestion(true);
    try {
      const suggestion = await billingApi.invoices.getSuggestedMessage(invoiceId, method);
      if (method === "email") {
        setMessageSubject(suggestion.subject);
      }
      setMessageBody(suggestion.message);
    } catch (error) {
      console.error("Failed to fetch suggestion", error);
      toast({
        title: "Suggestion Failed",
        description: "Could not fetch AI suggestion. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsFetchingSuggestion(false);
    }
  }, [invoiceId, toast]);

  useEffect(() => {
    if (isMessageDialogOpen && !messageBody.trim() && !isFetchingSuggestion) {
      fetchSuggestion(communicationMethod);
    }
  }, [communicationMethod, fetchSuggestion, isFetchingSuggestion, isMessageDialogOpen, messageBody]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars 
  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatus = e.target.value;
    if (newStatus && newStatus !== currentStatus) {
      statusChangeMutation.mutate(newStatus);
    }
  };

  const handlePrint = () => {
    openPrintWindow({ documentType: 'invoice', documentId: invoiceId });
  };

  // Handle invalid invoice ID
  if (!isValidId) {
    return (
      <div className="space-y-4">
        <Button variant="secondary" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Card className="border-destructive/20 bg-destructive/10">
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-destructive">Invalid Invoice ID</p>
            <p className="text-sm text-destructive mt-1">The invoice ID in the URL is invalid.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
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
            <p className="text-destructive">Error loading invoice. Please try again.</p>
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
  const hasEstimateLink = Boolean(invoice.estimate && invoice.estimate_number);
  const hasWorkOrderLink = Boolean(invoice.work_order && invoice.work_order_number);
  const amountPaid = parseAmount(invoice.amount_paid);

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
                <span className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-1.5 text-sm font-semibold text-foreground bg-muted/50 border-border text-foreground">
                  Invoice #{invoice.invoice_number}
                </span>
                <Badge className={cn("capitalize px-3 py-1", getStatusVariant(currentStatus || invoice.status))}>
                  {currentStatus || invoice.status}
                </Badge>
                {hasEstimateLink && (
                  <Link href={`/billing/estimates/${typeof invoice.estimate === 'object' ? invoice.estimate.id : invoice.estimate}`}>
                    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-foreground hover:bg-muted transition-colors">
                      <FileCheck className="h-3 w-3" />
                      Quote #{invoice.estimate_number}
                    </span>
                  </Link>
                )}
                {hasWorkOrderLink && (
                  <Link href={`/workorders/${typeof invoice.work_order === 'object' ? invoice.work_order.id : invoice.work_order}`}>
                    <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors">
                      <Wrench className="h-3 w-3" />
                      Work Order #{invoice.work_order_number}
                    </span>
                  </Link>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                {invoice.customer_name || "Customer"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 no-print">
            <Button variant="outline" size="sm" onClick={handlePrint} disabled={isOpeningPrint}>
              <Printer className="w-4 h-4 mr-2" />
              {isOpeningPrint ? 'Opening...' : 'Print'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => downloadPDF({
              documentType: 'invoice',
              documentId: invoiceId,
              documentNumber: invoice.invoice_number
            })} disabled={isDownloading}>
              <Download className="w-4 h-4 mr-2" />
              {isDownloading ? "Downloading..." : "PDF"}
            </Button>
            {canAcceptPayment && (
              <Button size="sm" onClick={() => setShowPaymentDialog(true)}>
                <DollarSign className="w-4 h-4 mr-2" />
                Record Payment
              </Button>
            )}
            <div className="relative">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowActionsMenu(!showActionsMenu)}
                className="gap-2"
              >
                <MoreVertical className="w-4 h-4" />
              </Button>
              {showActionsMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowActionsMenu(false)}
                  />
                  <div className="absolute right-0 mt-2 w-56 bg-card rounded-md shadow-lg border border-border z-20">
                    <div className="py-1">
                      {canSendInvoice && (
                        <button
                          onClick={() => {
                            if (confirm("Send this invoice to the customer via email?")) {
                              sendEmailMutation.mutate();
                            }
                            setShowActionsMenu(false);
                          }}
                          disabled={sendEmailMutation.isPending}
                          className="w-full text-left px-4 py-2 text-sm text-card-foreground hover:bg-muted  flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Mail className="w-4 h-4" />
                          {sendEmailMutation.isPending ? "Sending..." : "Send Email"}
                        </button>
                      )}
                      {/* // Only show Convert to Invoice for proforma invoices */}
                      {canConvertProforma && invoice.status === 'proforma' && (
                        <>
                          <div className="border-t border-border my-1" />
                          <button
                            onClick={() => {
                              if (confirm("Convert this proforma to a standard invoice? This will assign a new invoice number.")) {
                                convertToInvoiceMutation.mutate();
                              }
                              setShowActionsMenu(false);
                            }}
                            disabled={convertToInvoiceMutation.isPending}
                            className="w-full text-left px-4 py-2 text-sm text-card-foreground hover:bg-muted  flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <FileCheck className="w-4 h-4" />
                            {convertToInvoiceMutation.isPending ? "Converting..." : "Convert to Invoice"}
                          </button>
                        </>
                      )}
                      {canEditInvoice && (
                        <>
                          <div className="border-t border-border my-1" />
                          <Link href={`/billing/invoices/${invoiceId}/edit`}>
                            <button
                              onClick={() => setShowActionsMenu(false)}
                              className="w-full text-left px-4 py-2 text-sm text-card-foreground hover:bg-muted  flex items-center gap-2"
                            >
                              <Edit className="w-4 h-4" />
                              Edit
                            </button>
                          </Link>
                        </>
                      )}
                      {canSendInvoice && (
                        <>
                          <div className="border-t border-border my-1" />
                          <button
                            onClick={() => {
                              setIsMessageDialogOpen(true);
                              setShowActionsMenu(false);
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-card-foreground hover:bg-muted flex items-center gap-2"
                          >
                            <MessageSquare className="w-4 h-4" />
                            Message Customer
                          </button>
                        </>
                      )}
                      {canDeleteInvoice && (
                        <>
                          <div className="border-t border-border my-1" />
                          <button
                            onClick={() => {
                              if (confirm(`Delete invoice ${invoice.invoice_number}? This cannot be undone.`)) {
                                deleteInvoiceMutation.mutate();
                              }
                              setShowActionsMenu(false);
                            }}
                            disabled={deleteInvoiceMutation.isPending}
                            className="w-full text-left px-4 py-2 text-sm text-destructive hover:bg-destructive/10 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Trash2 className="w-4 h-4" />
                            {deleteInvoiceMutation.isPending ? "Deleting..." : "Delete"}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <Tabs defaultValue="invoice" className="w-full">
          <TabsList className="w-full justify-start h-auto p-1 bg-muted/50 bg-muted/50 mb-6 flex-wrap">
            <TabsTrigger value="invoice" className="gap-2">
              <FileText className="w-4 h-4" /> Invoice
            </TabsTrigger>
            <TabsTrigger value="payments" className="gap-2">
              <CreditCard className="w-4 h-4" /> Payments
            </TabsTrigger>
            <TabsTrigger value="workorder" className="gap-2">
              <Wrench className="w-4 h-4" /> Work Order
            </TabsTrigger>
            <TabsTrigger value="activity" className="gap-2">
              <Calendar className="w-4 h-4" /> Activity Log
            </TabsTrigger>
            <TabsTrigger value="reminders" className="gap-2">
              <Clock className="w-4 h-4" /> Reminders
            </TabsTrigger>
            <TabsTrigger value="notes" className="gap-2">
              <StickyNote className="w-4 h-4" /> Notes
            </TabsTrigger>
          </TabsList>

          <TabsContent value="invoice" className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Card className="border shadow-sm">
                <CardContent className="p-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Commercial Trail</p>
                  <p className="mt-2 text-sm font-semibold text-foreground">
                    {hasEstimateLink ? `Quote ${invoice.estimate_number}` : "Direct invoice"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {hasWorkOrderLink ? `Linked to ${invoice.work_order_number}` : "No work order linked"}
                  </p>
                </CardContent>
              </Card>
              <Card className="border shadow-sm">
                <CardContent className="p-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Collected</p>
                  <p className="mt-2 text-2xl font-bold text-foreground">{formatCurrency(amountPaid)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {balanceDue > 0 ? `${formatCurrency(balanceDue)} still due` : "Fully settled"}
                  </p>
                </CardContent>
              </Card>
              <Card className="border shadow-sm">
                <CardContent className="p-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Accounting</p>
                  <p className="mt-2 text-sm font-semibold text-foreground capitalize">{currentStatus || invoice.status}</p>
                  {isQboConnected && invoice.qbo_sync_status && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {`QuickBooks ${invoice.qbo_sync_status}`}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* 1. Header Information (Bill To, Dates, etc.) - Full Width */}
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {/* Bill To */}
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-2">Bill To</h3>
                    <Link href={`/customers/${invoice.customer}`} className="text-base font-semibold text-foreground hover:text-primary block">
                      {invoice.customer_name}
                    </Link>
                    {invoice.customer_email && <p className="text-sm text-muted-foreground">{invoice.customer_email}</p>}
                    {invoice.customer_phone && <p className="text-sm text-muted-foreground">{invoice.customer_phone}</p>}
                    {invoice.customer_address && <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{invoice.customer_address}</p>}
                  </div>

                  {/* Invoice Details */}
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-2">Details</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between md:justify-start md:gap-8">
                        <span className="text-sm text-muted-foreground w-24">Reference:</span>
                        <span className="text-sm font-medium text-foreground">{invoice.reference_number || "N/A"}</span>
                      </div>
                      <div className="flex justify-between md:justify-start md:gap-8">
                        <span className="text-sm text-muted-foreground w-24">Issued:</span>
                        <span className="text-sm font-medium text-foreground">{format(new Date(invoice.invoice_date), "MMM dd, yyyy")}</span>
                      </div>
                      <div className="flex justify-between md:justify-start md:gap-8">
                        <span className="text-sm text-muted-foreground w-24">Due:</span>
                        <span className="text-sm font-medium text-destructive">{format(new Date(invoice.due_date), "MMM dd, yyyy")}</span>
                      </div>
                      {invoice.sales_agent_name && (
                        <div className="flex justify-between md:justify-start md:gap-8">
                          <span className="text-sm text-muted-foreground w-24">Sales Agent:</span>
                          <span className="text-sm font-medium text-foreground">{invoice.sales_agent_name}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Work Order / Status */}
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-2">Related</h3>
                    <div className="space-y-2">
                      {invoice.work_order_number && (
                        <div className="flex flex-col">
                          <span className="text-sm text-muted-foreground">Work Order</span>
                          <Link href={`/workorders/${typeof invoice.work_order === 'object' ? invoice.work_order.id : invoice.work_order}`} className="text-sm font-medium text-primary hover:underline">
                            #{invoice.work_order_number}
                          </Link>
                        </div>
                      )}
                      {invoice.estimate_number && invoice.estimate && (
                        <div className="flex flex-col">
                          <span className="text-sm text-muted-foreground">Source Quote</span>
                          <Link href={`/billing/estimates/${typeof invoice.estimate === 'object' ? invoice.estimate.id : invoice.estimate}`} className="text-sm font-medium text-primary hover:underline">
                            #{invoice.estimate_number}
                          </Link>
                        </div>
                      )}

                      {invoice.status && (
                        <div className="flex flex-col mt-2">
                          <span className="text-sm text-muted-foreground mb-1">Status</span>
                          <Badge className={cn("w-fit capitalize", getStatusVariant(currentStatus || invoice.status))}>
                            {currentStatus || invoice.status}
                          </Badge>
                        </div>
                      )}

                      {isQboConnected && invoice.qbo_sync_status && (
                        <div className="flex flex-col mt-2">
                          <span className="text-sm text-muted-foreground mb-1">QuickBooks Sync</span>
                          <div className="flex flex-col items-start gap-1">
                            <div className="flex items-center gap-2">
                              <Badge variant={invoice.qbo_sync_status === 'synced' ? 'success' : invoice.qbo_sync_status === 'failed' ? 'danger' : 'secondary'} className="w-fit capitalize">
                                {invoice.qbo_sync_status}
                              </Badge>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={handleQBOSync}
                                disabled={isSyncing}
                                title="Sync with QuickBooks"
                              >
                                <Database className={cn("h-3 w-3", isSyncing && "animate-spin")} />
                              </Button>
                            </div>
                            {invoice.qbo_sync_status === 'failed' && invoice.qbo_sync_error && (
                              <span className="text-xs text-destructive line-clamp-2 max-w-[200px]" title={invoice.qbo_sync_error}>
                                {invoice.qbo_sync_error}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {(invoice.notes || invoice.terms) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 pt-6 border-t">
                    {invoice.notes && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Notes</h4>
                        <p className="text-sm text-muted-foreground italic whitespace-pre-wrap">{invoice.notes}</p>
                      </div>
                    )}
                    {invoice.terms && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Terms & Conditions</h4>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap text-xs">{invoice.terms}</p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 2. Line Items - Full Width */}
            <Card>
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-lg">Line Items</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow className="h-8">
                        <TableHead className="w-[40%] py-2">Item / Description</TableHead>
                        <TableHead className="text-right py-2">Qty</TableHead>
                        <TableHead className="text-right py-2">Rate</TableHead>
                        <TableHead className="text-right py-2">Discount</TableHead>
                        <TableHead className="text-right py-2">Tax</TableHead>
                        <TableHead className="text-right py-2">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoice.line_items && invoice.line_items.length > 0 ? (

                        invoice.line_items.map((item: InvoiceLineItem) => {
                          const lineDiscountPercentage = parseAmount(item.discount_percentage);
                          const lineDiscountAmount = parseAmount(item.discount_amount);
                          const hasLineDiscount = lineDiscountPercentage > 0 || lineDiscountAmount > 0;

                          return (
                            <TableRow key={item.id}>
                              <TableCell className="align-top py-3">
                                <div className="font-medium text-foreground">{item.description}</div>
                                {(item.part_number || item.item_type === 'part') && (
                                  <div className="flex items-center gap-2 mt-1">
                                    {item.part_number && <Badge variant="outline" className="text-[10px] h-4 px-1">{item.part_number}</Badge>}
                                    <span className="text-xs text-muted-foreground capitalize">{item.item_type}</span>
                                  </div>
                                )}
                                {item.notes && <p className="text-xs text-muted-foreground mt-1">{item.notes}</p>}
                              </TableCell>
                              <TableCell className="text-right align-top py-3">{item.quantity}</TableCell>
                              <TableCell className="text-right align-top py-3">
                                {item.unit_price ? formatCurrency(parseFloat(item.unit_price)) : "-"}
                              </TableCell>
                              <TableCell className="text-right align-top py-3">
                                {hasLineDiscount ? (
                                  <div className="space-y-0.5">
                                    {lineDiscountPercentage > 0 && (
                                      <div>{lineDiscountPercentage.toFixed(1)}%</div>
                                    )}
                                    {lineDiscountAmount > 0 && (
                                      <div className="text-xs text-destructive">
                                        -{formatCurrency(lineDiscountAmount)}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right align-top py-3">
                                {item.is_taxable ? <CheckCircle2 className="w-4 h-4 text-success ml-auto" /> : <span className="text-gray-300">-</span>}
                              </TableCell>
                              <TableCell className="text-right font-medium align-top py-3">
                                {item.total ? formatCurrency(parseFloat(item.total)) : "-"}
                              </TableCell>
                            </TableRow>
                          );
                        })
                      ) : (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                            No line items found.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* 3. Financial Summary - Bottom Right */}
            <div className="flex justify-end">
              <div className="w-full space-y-2 px-4 sm:max-w-sm md:px-0">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-muted-foreground">Subtotal</span>
                  <span className="text-foreground font-medium">
                    {formatCurrency(parseFloat(invoice.subtotal || "0"))}
                  </span>
                </div>

                {/* Discount */}
                {parseFloat(invoice.discount_percentage || "0") > 0 && (
                  <div className="flex justify-between text-sm text-destructive">
                    <span>
                      Discount ({parseFloat(invoice.discount_percentage || "0").toFixed(1)}%)
                      {invoice.discount_reason && <span className="text-xs ml-1">({invoice.discount_reason})</span>}
                    </span>
                    <span>
                      -{formatCurrency(parseFloat(invoice.discount_amount || "0"))}
                    </span>
                  </div>
                )}

                {/* Tax Breakdown */}
                {hasDetailedTax ? (
                  <div className="space-y-1 pt-1 opacity-90">
                    {taxBreakdown.nhilAmount > 0 && (
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>NHIL</span>
                        <span>{formatCurrency(taxBreakdown.nhilAmount)}</span>
                      </div>
                    )}
                    {taxBreakdown.getfundAmount > 0 && (
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>GETFund</span>
                        <span>{formatCurrency(taxBreakdown.getfundAmount)}</span>
                      </div>
                    )}
                    {taxBreakdown.hrlAmount > 0 && (
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>COVID-19 HRL</span>
                        <span>{formatCurrency(taxBreakdown.hrlAmount)}</span>
                      </div>
                    )}
                    {taxBreakdown.vatAmount > 0 && (
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>VAT</span>
                        <span>{formatCurrency(taxBreakdown.vatAmount)}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  parseAmount(invoice.tax_amount) > 0 && (
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Tax</span>
                      <span>{formatCurrency(parseAmount(invoice.tax_amount))}</span>
                    </div>
                  )
                )}

                <div className="flex justify-between text-lg font-bold border-t border-border pt-3 mt-2">
                  <span>Total</span>
                  <span className="text-foreground">{formatCurrency(parseFloat(invoice.total || "0"))}</span>
                </div>

                {/* Paid & Balance */}
                <div className="space-y-1 pt-2 border-t border-dashed border-border">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Amount Paid</span>
                    <span className="text-success font-medium">{formatCurrency(amountPaid)}</span>
                  </div>
                  <div className="flex justify-between text-base font-semibold">
                    <span className="text-foreground">Balance Due</span>
                    <span className={cn(balanceDue > 0 ? "text-destructive" : "text-foreground")}>
                      {formatCurrency(balanceDue)}
                    </span>
                  </div>
                </div>

              </div>
            </div>

          </TabsContent>

          <TabsContent value="payments" className="space-y-6">
            <div className="flex justify-between items-center bg-card p-4 rounded-lg border shadow-sm">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Payment History</h3>
                <p className="text-sm text-muted-foreground">Manage payments and receipts</p>
              </div>
              {canAcceptPayment && (
                <Button onClick={() => setShowPaymentDialog(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Record New Payment
                </Button>
              )}
            </div>

            <Card>
              <CardContent className="p-0">
                {payments && payments.length > 0 ? (
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">

                    {payments.map((payment: Payment) => (
                      <div key={payment.id} className="p-6 hover:bg-muted/50 transition-colors">
                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-4">
                          <div className="flex items-center gap-4">
                            <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center text-success">
                              <DollarSign className="w-6 h-6" />
                            </div>
                            <div>
                              <div className="flex items-baseline gap-2">
                                <p className="font-bold text-xl text-foreground">
                                  {formatCurrency(parseFloat(payment.amount || "0"))}
                                </p>
                                {payment.refund_amount && parseFloat(payment.refund_amount) > 0 && (
                                  <Badge variant="danger" className="text-xs">
                                    Refunded: {formatCurrency(parseFloat(payment.refund_amount))}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                                <span className="font-medium text-foreground">{format(new Date(payment.payment_date), "MMM dd, yyyy")}</span>
                                <span>•</span>
                                <span className="capitalize">{payment.payment_method?.replace(/_/g, " ")}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 self-start">
                            <Badge variant={payment.status === "completed" ? "success" : payment.status === "pending" ? "warning" : "danger"}>
                              {payment.status?.charAt(0).toUpperCase() + payment.status?.slice(1) || "Unknown"}
                            </Badge>

                            {payment.status === 'completed' && (
                              <div className="flex items-center border rounded-md overflow-hidden bg-card shadow-sm">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-9 px-3 text-muted-foreground hover:text-primary hover:bg-primary/10 border-r rounded-none"
                                  onClick={() => downloadPDF({
                                    documentType: 'receipt',
                                    documentId: payment.id,
                                    documentNumber: payment.payment_number ?? ""
                                  })}
                                >
                                  <Printer className="w-4 h-4 mr-2" /> Receipt
                                </Button>
                                {canManagePaymentAdjustments && (parseFloat(payment.amount) - parseFloat(payment.refund_amount || "0")) > 0 && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-9 px-3 text-destructive hover:text-destructive hover:bg-destructive/10 rounded-none"
                                    onClick={() => setSelectedPaymentForRefund(payment)}
                                  >
                                    <Undo2 className="w-4 h-4 mr-2" /> Refund
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="pl-0 md:pl-16 mt-4">
                          <AllocationHistory
                            paymentId={payment.id}
                            directInvoiceNumber={payment.invoice_number || invoice.invoice_number}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-16 px-4">
                    <div className="bg-muted h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-6 text-muted-foreground">
                      <CreditCard className="w-10 h-10" />
                    </div>
                    <h3 className="text-xl font-semibold text-foreground mb-2">No payments recorded</h3>
                    <p className="text-muted-foreground mb-8 max-w-sm mx-auto">This invoice has not received any payments yet. Record a payment to settle the balance.</p>
                    {canAcceptPayment && (
                      <Button size="lg" onClick={() => setShowPaymentDialog(true)}>
                        <DollarSign className="w-5 h-5 mr-2" /> Record First Payment
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="workorder" className="space-y-6">
            <Card className="bg-muted/50 border-dashed min-h-[400px]">
              <CardContent className="flex flex-col items-center justify-center h-full py-16 text-center">
                <div className="bg-card p-6 rounded-full shadow-sm mb-6">
                  <Wrench className="w-12 h-12 text-warning" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">Work Order Details</h3>
                {invoice.work_order ? (
                  <div className="space-y-4">
                    <p className="text-muted-foreground max-w-md mx-auto">
                      This invoice is linked to Work Order <span className="font-medium text-foreground">#{invoice.work_order_number}</span>.
                    </p>
                    <Link href={`/workorders/${typeof invoice.work_order === 'object' ? invoice.work_order.id : invoice.work_order}`}>
                      <Button variant="outline" className="mt-2">
                        View Work Order
                        <ExternalLink className="w-4 h-4 ml-2" />
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <p className="text-muted-foreground max-w-md mx-auto">
                    This invoice is not directly linked to a specific work order.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activity">
            <InvoiceActivityLog invoiceId={invoiceId} />
          </TabsContent>

          <TabsContent value="reminders">
            {user ? (
              <InvoiceReminders invoice={invoice} currentUser={user} />
            ) : (
              <div>Loading user data...</div>
            )}
          </TabsContent>

          <TabsContent value="notes">
            <InvoiceNotes invoice={invoice} />
          </TabsContent>

        </Tabs >
      </div >
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
      )
      }

      {
        selectedPaymentForRefund && (
          <ProcessRefundDialog
            payment={selectedPaymentForRefund}
            open={!!selectedPaymentForRefund}
            onClose={() => setSelectedPaymentForRefund(null)}
            onSuccess={() => {
              setSelectedPaymentForRefund(null);
            }}
          />
        )
      }

      {/* Message Dialog */}
      <MessageCustomerDialog
        open={isMessageDialogOpen}
        onOpenChange={setIsMessageDialogOpen}
        method={communicationMethod}
        onMethodChange={setCommunicationMethod}
        subject={messageSubject}
        onSubjectChange={setMessageSubject}
        message={messageBody}
        onMessageChange={setMessageBody}
        isSending={sendMessageMutation.isPending}
        isFetching={isFetchingSuggestion}
        onRefresh={() => fetchSuggestion(communicationMethod)}
        onSend={() => sendMessageMutation.mutate({
          method: communicationMethod,
          message: messageBody,
          subject: messageSubject
        })}
      />
    </>
  );
}

// Sub-component for the Messaging Dialog
function MessageCustomerDialog({
  open,
  onOpenChange,
  onSend,
  method,
  onMethodChange,
  subject,
  onSubjectChange,
  message,
  onMessageChange,
  isSending,
  isFetching,
  onRefresh
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSend: () => void;
  method: "sms" | "email";
  onMethodChange: (method: "sms" | "email") => void;
  subject: string;
  onSubjectChange: (val: string) => void;
  message: string;
  onMessageChange: (val: string) => void;
  isSending: boolean;
  isFetching: boolean;
  onRefresh: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Message Customer
          </DialogTitle>
          <DialogDescription>
            Send a billing update or payment reminder to the customer.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={method} onValueChange={(val) => onMethodChange(val as "sms" | "email")} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="sms" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              SMS
            </TabsTrigger>
            <TabsTrigger value="email" className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Email
            </TabsTrigger>
          </TabsList>

          <div className="space-y-4 py-2">
            {method === "email" && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Subject</label>
                <Input
                  value={subject}
                  onChange={(e) => onSubjectChange(e.target.value)}
                  placeholder="Email subject..."
                  className="w-full h-10 px-3 py-2 rounded-md border border-input bg-background"
                />
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Message Body</label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-primary hover:text-primary hover:bg-primary/10 transition-all font-medium"
                  onClick={onRefresh}
                  disabled={isFetching}
                >
                  {isFetching ? (
                    <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3 mr-2" />
                  )}
                  {isFetching ? "Thinking..." : "Auto-generate Content"}
                </Button>
              </div>
              <Textarea
                value={message}
                onChange={(e) => onMessageChange(e.target.value)}
                placeholder={`Type your ${method} message here...`}
                rows={method === "email" ? 10 : 5}
                className="resize-none"
              />
              <p className="text-[10px] text-muted-foreground italic">
                ✨ AI suggestions are based on current invoice status (paid, overdue, etc.).
              </p>
            </div>
          </div>
        </Tabs>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSending}>
            Cancel
          </Button>
          <Button onClick={onSend} disabled={isSending || !message.trim() || (method === "email" && !subject.trim())}>
            {isSending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                {method === "email" ? <Mail className="mr-2 h-4 w-4" /> : <MessageSquare className="mr-2 h-4 w-4" />}
                Send {method === "email" ? "Email" : "SMS"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Add a simple Input component if not already available
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        props.className
      )}
    />
  );
}
