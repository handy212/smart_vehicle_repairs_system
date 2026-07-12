"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { billingApi, Estimate, EstimateLineItem } from "@/lib/api/billing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, BadgeProps } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
// eslint-disable-next-line @typescript-eslint/no-unused-vars 
import { ArrowLeft, Edit, Mail, CheckCircle, XCircle, Download, Wrench, Printer, ChevronDown, MoreVertical, AlertCircle, Copy, Trash2, Database, Loader2 } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/lib/hooks/useToast";
import { cn } from "@/lib/utils/cn";
// eslint-disable-next-line @typescript-eslint/no-unused-vars 
import { useBranchStore } from "@/store/branchStore";
import { usePrint } from "@/lib/hooks/usePrint";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EstimateNotes } from "./components/EstimateNotes";
import { EstimateReminders } from "./components/EstimateReminders";
import { EstimateActivityLog } from "./components/EstimateActivityLog";
import { useAuthStore } from "@/store/authStore";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { FileText, Clock, StickyNote, Activity, FileCheck } from "lucide-react";

import { TermsAcceptanceBlock } from "@/components/terms/TermsAcceptanceBlock";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { getUserFacingError } from "@/lib/api/errors";
import { RevenueProductBadge } from "@/components/billing/RevenueProductBadge";
import { useQuickBooksConnection } from "@/hooks/useQuickBooksConnection";
import { useQboEntitySync } from "@/hooks/useQboEntitySync";
import { QboSyncBadge } from "@/components/integrations/QboSyncBadge";

const parseAmount = (value?: string | number | null) => {
  if (value === null || value === undefined) {
    return 0;
  }
  const num = typeof value === "number" ? value : parseFloat(value);
  return Number.isNaN(num) ? 0 : num;
};

export default function EstimateDetailPage() {
  const { formatCurrency } = useCurrency();
  const params = useParams();
  const router = useRouter();
  const estimateId = parseInt(params.id as string);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isConverting, setIsConverting] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const { isLinked: isQboConnected, isOperational: isQboCanSync, connectionIssue: qboConnectionIssue } = useQuickBooksConnection();
  const {
    isSyncing,
    isClearing,
    handleSync: handleQBOSync,
    handleClearMapping: handleQboClearMapping,
  } = useQboEntitySync({
    entityType: "estimate",
    objectId: estimateId,
    queryKey: ["estimate", estimateId],
    inline: true,
    syncSuccessMessage: "Estimate pushed to QuickBooks successfully.",
    syncErrorMessage: "Failed to trigger QuickBooks synchronization.",
  });
  const { downloadPDF, openPrintWindow, isDownloading, isOpeningPrint } = usePrint();
  const [activeTab, setActiveTab] = useState("estimate");
  const { user: currentUser } = useAuthStore();
  const { hasPermission, hasAnyPermission } = usePermissions();

  // Validate estimateId to prevent NaN API calls
  const isValidId = !isNaN(estimateId) && estimateId > 0;

  const { data: estimate, isLoading, error } = useQuery({
    queryKey: ["estimate", estimateId],
    queryFn: () => billingApi.estimates.get(estimateId),
    enabled: isValidId,
  });

  const canEditEstimate = hasPermission("edit_estimates");
  const canCreateEstimate = hasPermission("create_estimates");
  const canDeleteEstimate = hasPermission("manage_billing");
  const canApproveEstimate = hasAnyPermission(["approve_estimates", "edit_estimates"]);
  const canSendEstimate = hasAnyPermission(["edit_estimates", "send_notifications"]);
  const canConvertEstimateToInvoice = hasAnyPermission([
    "convert_estimate_to_invoice",
    "create_invoices",
  ]);
  const canConvertEstimateToWorkOrder = hasPermission("create_workorders");
  const currentStatus = estimate?.status ?? null;

  const canEditInUi = canEditEstimate && estimate?.status !== "converted";

  const statusChangeMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      return billingApi.estimates.update(estimateId, { status: newStatus });
    },
    onMutate: async (newStatus) => {
      await queryClient.cancelQueries({ queryKey: ["estimate", estimateId] });
      const previousEstimate = queryClient.getQueryData(["estimate", estimateId]);

      queryClient.setQueryData<Estimate | undefined>(["estimate", estimateId], (old) =>
        old ? { ...old, status: newStatus } : old
      );
      return { previousEstimate };
    },
    onError: (err, newStatus, context) => {
      if (context?.previousEstimate) {
        queryClient.setQueryData(["estimate", estimateId], context.previousEstimate);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["estimate", estimateId] });
      queryClient.invalidateQueries({ queryKey: ["estimates"] });
    },
  });

  const sendEmailMutation = useMutation({
    mutationFn: async () => {
      return billingApi.estimates.send(estimateId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["estimate", estimateId] });
      toast({
        title: "Success",
        description: "Estimate sent successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to send estimate. Please try again.",
        variant: "destructive",
      });
    },
  });

  const convertToInvoiceMutation = useMutation({
    mutationFn: () => billingApi.estimates.convertToInvoice(estimateId),
    onSuccess: (invoice) => {
      setIsConverting(false);
      toast({
        title: "Success",
        description: "Estimate converted to invoice successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["estimate", estimateId] });
      queryClient.invalidateQueries({ queryKey: ["estimates"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      router.push(`/billing/invoices/${invoice.id}`);
    },

    onError: (error: unknown) => {
      setIsConverting(false);
      toast({
        title: "Error",
        description: getUserFacingError(error, "Failed to convert estimate"),
        variant: "destructive",
      });
    },
  });

  const convertToWorkOrderMutation = useMutation({
    mutationFn: () => billingApi.estimates.convertToWorkOrder(estimateId),
    onSuccess: (data) => {
      setIsConverting(false);
      toast({
        title: "Success",
        description: "Estimate converted to work order successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["estimate", estimateId] });
      queryClient.invalidateQueries({ queryKey: ["estimates"] });
      queryClient.invalidateQueries({ queryKey: ["workorders"] });
      router.push(`/workorders/${data.work_order_id}`);
    },

    onError: (error: unknown) => {
      setIsConverting(false);
      toast({
        title: "Error",
        description: getUserFacingError(error, "Failed to convert estimate"),
        variant: "destructive",
      });
    },
  });

  const approveEstimateMutation = useMutation({
    mutationFn: () => billingApi.estimates.approve(estimateId, { accepted_terms: true }),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Estimate approved successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["estimate", estimateId] });
      queryClient.invalidateQueries({ queryKey: ["estimates"] });
      setAcceptedTerms(false);
    },

    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: getUserFacingError(error, "Failed to approve estimate"),
        variant: "destructive",
      });
    },
  });

  const duplicateEstimateMutation = useMutation({
    mutationFn: () => billingApi.estimates.duplicate(estimateId),
    onSuccess: (duplicated) => {
      queryClient.invalidateQueries({ queryKey: ["estimates"] });
      toast({
        title: "Success",
        description: "Estimate duplicated successfully",
      });
      router.push(`/billing/estimates/${duplicated.id}/edit`);
    },

    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: getUserFacingError(error, "Failed to duplicate estimate"),
        variant: "destructive",
      });
    },
  });

  const deleteEstimateMutation = useMutation({
    mutationFn: () => billingApi.estimates.delete(estimateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["estimates"] });
      toast({
        title: "Success",
        description: "Estimate deleted successfully",
      });
      router.push("/billing/estimates");
    },

    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: getUserFacingError(error, "Failed to delete estimate"),
        variant: "destructive",
      });
    },
  });

  const markReadyMutation = useMutation({
    mutationFn: () => billingApi.estimates.markReady(estimateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["estimate", estimateId] });
      queryClient.invalidateQueries({ queryKey: ["estimates"] });
      queryClient.invalidateQueries({ queryKey: ["workorders"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast({
        title: "Success",
        description: "Quotation marked as ready and the linked work order was updated.",
      });
    },

    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: getUserFacingError(error, "Failed to mark quotation as ready"),
        variant: "destructive",
      });
    },
  });

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatus = e.target.value;
    if (newStatus && newStatus !== currentStatus) {
      statusChangeMutation.mutate(newStatus);
    }
  };

  const handleSendEmail = () => {
    if (confirm("Send this estimate to the customer via email?")) {
      sendEmailMutation.mutate();
    }
  };

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

  const handleApproveEstimate = () => {
    setShowApproveDialog(true);
  };

  const handleDuplicateEstimate = () => {
    duplicateEstimateMutation.mutate();
  };

  const handleDeleteEstimate = () => {
    if (confirm(`Delete estimate "${estimate?.estimate_number}"? This action cannot be undone.`)) {
      deleteEstimateMutation.mutate();
    }
  };

  const handleMarkReady = () => {
    if (confirm("Mark this quotation as ready? This will update the linked work order stage.")) {
      markReadyMutation.mutate();
    }
  };

  const confirmApproveEstimate = () => {
    if (!acceptedTerms) return;
    setShowApproveDialog(false);
    approveEstimateMutation.mutate();
  };

  // Handle invalid estimate ID
  if (!isValidId) {
    return (
      <div className="space-y-4">
        <Button variant="secondary" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Card className="border-destructive/20 bg-destructive/10">
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-destructive">Invalid Estimate ID</p>
            <p className="text-sm text-destructive mt-1">The estimate ID in the URL is invalid.</p>
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

  if (error || !estimate) {
    return (
      <div className="space-y-4">
        <Button variant="secondary" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Card>
          <CardContent className="pt-6">
            <p className="text-destructive">Error loading estimate. Please try again.</p>
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

  const parseAmount = (value?: string | number | null) => {
    if (value === null || value === undefined) {
      return 0;
    }
    const num = typeof value === "number" ? value : parseFloat(value);
    return Number.isNaN(num) ? 0 : num;
  };

  const taxBreakdown = {
    regime: estimate.tax_breakdown?.regime || estimate.tax_regime || "ghana_standard",
    nhilAmount: parseAmount(estimate.tax_breakdown?.nhil_amount ?? estimate.tax_nhil_amount),
    getfundAmount: parseAmount(estimate.tax_breakdown?.getfund_amount ?? estimate.tax_getfund_amount),
    hrlAmount: parseAmount(estimate.tax_breakdown?.hrl_amount ?? estimate.tax_hrl_amount),
    vatAmount: parseAmount(estimate.tax_breakdown?.vat_amount ?? estimate.tax_vat_amount),
    totalTax: parseAmount(estimate.tax_breakdown?.total_tax ?? estimate.tax_amount),
  };
  const hasDetailedTax =
    taxBreakdown.nhilAmount > 0 ||
    taxBreakdown.getfundAmount > 0 ||
    taxBreakdown.hrlAmount > 0 ||
    taxBreakdown.vatAmount > 0;
  const latestInvoice = estimate.latest_invoice_summary;
  const hasLinkedInvoice = Boolean(latestInvoice?.id);
  const isStoresQuote = Boolean(estimate.work_order || estimate.reference_number?.startsWith("WO:"));

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
            <Button variant="secondary" onClick={() => router.back()} className="no-print">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-1.5 text-sm font-semibold text-foreground bg-muted/50 border-border text-foreground">
                  {isStoresQuote ? "Stores Quote" : "Estimate"} #{estimate.estimate_number}
                </span>
                {estimate.work_order && estimate.work_order_number && (
                  <Link href={`/workorders/${typeof estimate.work_order === 'object' ? estimate.work_order.id : estimate.work_order}`}>
                    <span className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary hover:bg-orange-100 transition-colors dark:bg-orange-950/20 dark:border-orange-800 text-primary">
                      <span className="h-2 w-2 rounded-full bg-primary" />
                      Work Order #{estimate.work_order_number}
                    </span>
                  </Link>
                )}
                {latestInvoice?.id && (
                  <Link href={`/billing/invoices/${latestInvoice.id}`}>
                    <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      Invoice #{latestInvoice.invoice_number}
                    </span>
                  </Link>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1 text-muted-foreground">
                {estimate.customer_name || "Customer"}
              </p>
            </div>
          </div>
          <div className="relative no-print">
            {!hasLinkedInvoice && canConvertEstimateToInvoice && estimate.can_be_converted && estimate.status !== "converted" && (
              <Button
                onClick={handleConvertToInvoice}
                disabled={isConverting}
                className="bg-success hover:bg-green-700 text-white mr-2"
              >
                {isConverting ? "Converting..." : "Convert to Invoice"}
              </Button>
            )}
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
                <div className="absolute right-0 mt-2 w-56 bg-card rounded-md shadow-lg border border-border z-20">
                  <div className="py-1">
                    <button
                      onClick={() => {
                        openPrintWindow({ documentType: 'estimate', documentId: estimateId });
                        setShowActionsMenu(false);
                      }}
                      disabled={isOpeningPrint}
                      className="w-full text-left px-4 py-2 text-sm text-card-foreground hover:bg-muted  flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Printer className="w-4 h-4" />
                      {isOpeningPrint ? 'Opening...' : 'Print'}
                    </button>
                    <button
                      onClick={() => {
                        downloadPDF({
                          documentType: 'estimate',
                          documentId: estimateId,
                          documentNumber: estimate.estimate_number
                        });
                        setShowActionsMenu(false);
                      }}
                      disabled={isDownloading}
                      className="w-full text-left px-4 py-2 text-sm text-card-foreground hover:bg-muted  flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Download className="w-4 h-4" />
                      {isDownloading ? 'Generating...' : 'Download PDF'}
                    </button>
                    {canSendEstimate && (
                      <button
                        onClick={() => {
                          handleSendEmail();
                          setShowActionsMenu(false);
                        }}
                        disabled={sendEmailMutation.isPending}
                        className="w-full text-left px-4 py-2 text-sm text-card-foreground hover:bg-muted  flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Mail className="w-4 h-4" />
                        {sendEmailMutation.isPending ? "Sending..." : "Send Email"}
                      </button>
                    )}
                    {canEditInUi && (
                      <Link href={`/billing/estimates/${estimateId}/edit`}>
                        <button
                          onClick={() => setShowActionsMenu(false)}
                          className="w-full text-left px-4 py-2 text-sm text-card-foreground hover:bg-muted  flex items-center gap-2"
                        >
                          <Edit className="w-4 h-4" />
                          Edit
                        </button>
                      </Link>
                    )}
                    {canCreateEstimate && (
                      <button
                        onClick={() => {
                          setShowActionsMenu(false);
                          handleDuplicateEstimate();
                        }}
                        disabled={duplicateEstimateMutation.isPending}
                        className="w-full text-left px-4 py-2 text-sm text-card-foreground hover:bg-muted  flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Copy className="w-4 h-4" />
                        {duplicateEstimateMutation.isPending ? "Duplicating..." : "Duplicate"}
                      </button>
                    )}
                    {estimate.can_mark_ready && (
                      <button
                        onClick={() => {
                          setShowActionsMenu(false);
                          handleMarkReady();
                        }}
                        disabled={markReadyMutation.isPending}
                        className="w-full text-left px-4 py-2 text-sm text-card-foreground hover:bg-muted  flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <CheckCircle className="w-4 h-4" />
                        {markReadyMutation.isPending ? "Marking Ready..." : "Mark Quotation Ready"}
                      </button>
                    )}
                    {canApproveEstimate && estimate.can_be_approved && estimate.status !== "approved" && (
                      <button
                        onClick={() => {
                          handleApproveEstimate();
                          setShowActionsMenu(false);
                        }}
                        disabled={approveEstimateMutation.isPending}
                        className="w-full text-left px-4 py-2 text-sm text-card-foreground hover:bg-muted  flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed border-t border-border mt-1"
                      >
                        <CheckCircle className="w-4 h-4" />
                        {approveEstimateMutation.isPending ? "Approving..." : "Approve Estimate"}
                      </button>
                    )}
                    {!hasLinkedInvoice && estimate.can_be_converted && estimate.status !== "converted" && (canConvertEstimateToInvoice || canConvertEstimateToWorkOrder) && (
                      <>
                        <div className="border-t border-border my-1" />
                        {canConvertEstimateToInvoice && (
                          <button
                            onClick={() => {
                              handleConvertToInvoice();
                              setShowActionsMenu(false);
                            }}
                            disabled={isConverting}
                            className="w-full text-left px-4 py-2 text-sm text-card-foreground hover:bg-muted  flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <FileText className="w-4 h-4" />
                            To Invoice
                          </button>
                        )}
                        {canConvertEstimateToWorkOrder && (
                          <button
                            onClick={() => {
                              handleConvertToWorkOrder();
                              setShowActionsMenu(false);
                            }}
                            disabled={isConverting}
                            className="w-full text-left px-4 py-2 text-sm text-card-foreground hover:bg-muted  flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Wrench className="w-4 h-4" />
                            To Work Order
                          </button>
                        )}
                      </>
                    )}
                    {canDeleteEstimate && (
                      <>
                        <div className="border-t border-border my-1" />
                        <button
                          onClick={() => {
                            setShowActionsMenu(false);
                            handleDeleteEstimate();
                          }}
                          disabled={deleteEstimateMutation.isPending}
                          className="w-full text-left px-4 py-2 text-sm text-destructive hover:bg-destructive/10 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Trash2 className="w-4 h-4" />
                          {deleteEstimateMutation.isPending ? "Deleting..." : "Delete"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>


        {/* Main Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-card p-1 border border-border rounded-lg w-full justify-start h-auto flex-wrap">
            <TabsTrigger
              value="estimate"
              className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary dark:data-[state=active]:bg-orange-900/20 dark:data-[state=active]:text-orange-400 px-4 py-2 h-auto gap-2"
            >
              <FileCheck className="w-4 h-4" />
              Estimate Details
            </TabsTrigger>
            <TabsTrigger
              value="activity"
              className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary dark:data-[state=active]:bg-orange-900/20 dark:data-[state=active]:text-orange-400 px-4 py-2 h-auto gap-2"
            >
              <Activity className="w-4 h-4" />
              Activity Log
            </TabsTrigger>
            <TabsTrigger
              value="reminders"
              className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary dark:data-[state=active]:bg-orange-900/20 dark:data-[state=active]:text-orange-400 px-4 py-2 h-auto gap-2"
            >
              <Clock className="w-4 h-4" />
              Reminders
            </TabsTrigger>
            <TabsTrigger
              value="notes"
              className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary dark:data-[state=active]:bg-orange-900/20 dark:data-[state=active]:text-orange-400 px-4 py-2 h-auto gap-2"
            >
              <StickyNote className="w-4 h-4" />
              Notes
            </TabsTrigger>
          </TabsList>

          <TabsContent value="estimate" className="space-y-6">
            <Card className="border shadow-sm">
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="rounded-md border bg-muted/30 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Quote Type</p>
                    <p className="mt-2 text-sm font-semibold text-foreground">
                      {isStoresQuote ? "Stores quotation from diagnosis" : "Customer estimate"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {estimate.reference_number || "No external reference"}
                    </p>
                  </div>
                  <div className="rounded-md border bg-muted/30 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current Status</p>
                    <p className="mt-2 text-sm font-semibold text-foreground">
                      {(currentStatus || estimate.status)?.replace(/_/g, " ")}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Total quoted: {formatCurrency(parseFloat(estimate.total || "0"))}
                    </p>
                  </div>
                  <div className="rounded-md border bg-muted/30 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Invoice Handoff</p>
                    {latestInvoice ? (
                      <>
                        <Link href={`/billing/invoices/${latestInvoice.id}`} className="mt-2 inline-flex text-sm font-semibold text-primary hover:underline">
                          {latestInvoice.invoice_number}
                        </Link>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {latestInvoice.status.replace(/_/g, " ")} • {formatCurrency(parseFloat(latestInvoice.total || "0"))}
                        </p>
                      </>
                    ) : (
                      <p className="mt-2 text-sm font-semibold text-foreground">No invoice created yet</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 1. Header Information (Estimate Details, Dates, etc.) - Full Width */}
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {/* Customer / Bill To */}
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-2">Customer</h3>
                    {estimate.customer ? (
                      <Link href={`/customers/${typeof estimate.customer === 'object' && estimate.customer !== null ? estimate.customer.id : estimate.customer}`} className="text-base font-semibold text-foreground hover:text-primary block">
                        {estimate.customer_name || "View Customer"}
                      </Link>
                    ) : (
                      <p className="text-base font-semibold text-foreground">{estimate.customer_name || "-"}</p>
                    )}
                    {estimate.customer_email && <p className="text-sm text-muted-foreground">{estimate.customer_email}</p>}
                    {estimate.customer_phone && <p className="text-sm text-muted-foreground">{estimate.customer_phone}</p>}
                    {estimate.customer_address && <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{estimate.customer_address}</p>}
                  </div>

                  {/* Estimate Info */}
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-2">Details</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between md:justify-start md:gap-8">
                        <span className="text-sm text-muted-foreground w-24">{isStoresQuote ? "Quoted:" : "Date:"}</span>
                        <span className="text-sm font-medium text-foreground">
                          {estimate.estimate_date ? format(new Date(estimate.estimate_date), "MMM dd, yyyy") : "-"}
                        </span>
                      </div>
                      <div className="flex justify-between md:justify-start md:gap-8">
                        <span className="text-sm text-muted-foreground w-24">{isStoresQuote ? "Valid Until:" : "Valid Until:"}</span>
                        <span className="text-sm font-medium text-foreground">
                          {estimate.valid_until ? format(new Date(estimate.valid_until), "MMM dd, yyyy") : "-"}
                        </span>
                      </div>
                      {estimate.sales_agent_name && (
                        <div className="flex justify-between md:justify-start md:gap-8">
                          <span className="text-sm text-muted-foreground w-24">Sales Agent:</span>
                          <span className="text-sm font-medium text-foreground">{estimate.sales_agent_name}</span>
                        </div>
                      )}
                      {estimate.days_until_expiration !== undefined && estimate.status === 'sent' && (
                        <div className="flex justify-between md:justify-start md:gap-8">
                          <span className="text-sm text-muted-foreground w-24">Expires:</span>
                          <span className={cn("text-sm font-medium", estimate.days_until_expiration < 0 ? "text-destructive" : "text-foreground")}>
                            {estimate.days_until_expiration < 0 ? "Expired" : `${estimate.days_until_expiration} days`}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Vehicle / Status */}
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-2">Related</h3>
                    <div className="space-y-2">
                      {estimate.vehicle && (
                        <div className="flex flex-col">
                          <span className="text-sm text-muted-foreground">Vehicle</span>
                          <Link href={`/vehicles/${typeof estimate.vehicle === 'object' && estimate.vehicle !== null ? estimate.vehicle.id : estimate.vehicle}`} className="text-sm font-medium text-primary hover:underline">
                            {estimate.vehicle_display || "View Vehicle"}
                          </Link>
                          {estimate.vehicle_vin && <span className="text-xs text-muted-foreground">VIN: {estimate.vehicle_vin}</span>}
                        </div>
                      )}

                      <div className="flex flex-col mt-2">
                        <span className="text-sm text-muted-foreground mb-1">Status</span>
                        <div className="flex items-center gap-2">

                          <Badge variant={getStatusVariant(currentStatus || estimate.status) as BadgeProps["variant"]}>
                            {(currentStatus || estimate.status)?.replace("_", " ").toUpperCase()}
                          </Badge>
                          {canEditEstimate && (
                            <select
                              value={currentStatus || estimate.status}
                              onChange={handleStatusChange}
                              disabled={statusChangeMutation.isPending}
                              className="px-2 py-1 text-xs border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
                            >
                              <option value="draft">Draft</option>
                              <option value="sent">Sent</option>
                              <option value="viewed">Viewed</option>
                              <option value="approved">Approved</option>
                              <option value="declined">Declined</option>
                              <option value="converted">Converted</option>
                            </select>
                          )}
                        </div>
                      </div>
                      {isQboConnected && (
                        <div className="flex flex-col mt-2">
                          <span className="text-sm text-muted-foreground mb-1">QuickBooks Sync</span>
                          <QboSyncBadge
                            status={estimate.qbo_sync_status}
                            error={estimate.qbo_sync_error}
                            connectionIssue={!isQboCanSync ? qboConnectionIssue : undefined}
                            onRetry={isQboCanSync ? handleQBOSync : undefined}
                            onClearMapping={isQboCanSync ? handleQboClearMapping : undefined}
                            isRetrying={isSyncing}
                            isClearing={isClearing}
                            compact
                          />
                        </div>
                      )}
                      {latestInvoice && (
                        <div className="flex flex-col mt-2">
                          <span className="text-sm text-muted-foreground">Invoice</span>
                          <Link href={`/billing/invoices/${latestInvoice.id}`} className="text-sm font-medium text-primary hover:underline">
                            {latestInvoice.invoice_number}
                          </Link>
                          <span className="text-xs text-muted-foreground capitalize">
                            {latestInvoice.status.replace(/_/g, " ")}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {(estimate.title || estimate.description || estimate.notes) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 pt-6 border-t">
                    {(estimate.title || estimate.description) && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{isStoresQuote ? "Quotation Scope" : "Description"}</h4>
                        {estimate.title && <p className="text-sm font-medium text-foreground mb-1">{estimate.title}</p>}
                        {estimate.description && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{estimate.description}</p>}
                      </div>
                    )}
                    {estimate.notes && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Notes</h4>
                        <p className="text-sm text-muted-foreground italic whitespace-pre-wrap">{estimate.notes}</p>
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
                        <TableHead className="w-[34%] py-2">Item / Description</TableHead>
                        <TableHead className="py-2">Revenue</TableHead>
                        <TableHead className="text-right py-2">Qty/Hrs</TableHead>
                        <TableHead className="text-right py-2">Rate</TableHead>
                        <TableHead className="text-right py-2">Discount</TableHead>
                        <TableHead className="text-right py-2">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {estimate.line_items && estimate.line_items.length > 0 ? (

                        estimate.line_items.map((item: EstimateLineItem, index: number) => {
                          const lineDiscountPercentage = parseAmount(item.discount_percentage);
                          const lineDiscountAmount = parseAmount(item.discount_amount);
                          const hasLineDiscount = lineDiscountPercentage > 0 || lineDiscountAmount > 0;

                          return (
                            <TableRow key={item.id || index}>
                              <TableCell className="align-top py-3">
                                <div className="flex flex-col">
                                  <span className="font-medium text-foreground">{item.description}</span>
                                  <span className="text-xs text-muted-foreground capitalize mt-0.5">{item.item_type?.replace("_", " ")}</span>
                                </div>
                              </TableCell>
                              <TableCell className="align-top py-3">
                                <RevenueProductBadge
                                  name={item.revenue_product_name}
                                  ownerAccountCode={item.owner_account_code}
                                  code={item.revenue_product_code}
                                />
                              </TableCell>
                              <TableCell className="text-right align-top py-3">
                                {item.item_type === "labor" ? `${item.labor_hours || 0}h` : (item.quantity || "-")}
                              </TableCell>
                              <TableCell className="text-right align-top py-3">
                                {item.item_type === "labor"
                                  ? (item.labor_rate ? `${formatCurrency(parseFloat(item.labor_rate))}/hr` : "-")
                                  : (item.unit_price ? `${formatCurrency(parseFloat(item.unit_price))}` : "-")}
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
                              <TableCell className="text-right font-medium align-top py-3">
                                {item.total ? formatCurrency(parseFloat(item.total)) : "-"}
                              </TableCell>
                            </TableRow>
                          );
                        })
                      ) : (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
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
                {estimate.labor_subtotal && (
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Labor Subtotal</span>
                    <span>{formatCurrency(parseFloat(estimate.labor_subtotal))}</span>
                  </div>
                )}
                {estimate.parts_subtotal && (
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Parts Subtotal</span>
                    <span>{formatCurrency(parseFloat(estimate.parts_subtotal))}</span>
                  </div>
                )}

                <div className="flex items-center justify-between border-t border-dashed pt-2 mt-2">
                  <span className="font-medium text-muted-foreground">Subtotal</span>
                  <span className="text-foreground font-medium">
                    {formatCurrency(parseFloat(estimate.subtotal || "0"))}
                  </span>
                </div>

                {/* Discount */}
                {parseFloat(estimate.discount_percentage || "0") > 0 && (
                  <div className="flex justify-between text-sm text-destructive">
                    <span>
                      Discount ({parseFloat(estimate.discount_percentage || "0").toFixed(1)}%)
                      {estimate.discount_reason && <span className="text-xs ml-1">({estimate.discount_reason})</span>}
                    </span>
                    <span>
                      -{formatCurrency(parseFloat(estimate.discount_amount || "0"))}
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
                  parseAmount(estimate.tax_amount) > 0 && (
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Tax</span>
                      <span>{formatCurrency(parseAmount(estimate.tax_amount))}</span>
                    </div>
                  )
                )}

                <div className="flex justify-between text-lg font-bold border-t border-border pt-3 mt-2">
                  <span>Total</span>
                  <span className="text-foreground">{formatCurrency(parseFloat(estimate.total || "0"))}</span>
                </div>

              </div>
            </div>

          </TabsContent>

          <TabsContent value="activity">
            <EstimateActivityLog estimateId={estimateId} />
          </TabsContent>

          <TabsContent value="reminders">
            <EstimateReminders estimate={estimate} currentUser={currentUser || { id: 1 }} />
          </TabsContent>

          <TabsContent value="notes">
            <EstimateNotes estimate={estimate} />
          </TabsContent>
        </Tabs>

        {/* Approve Estimate Confirmation Dialog */}
        <Dialog open={showApproveDialog} onOpenChange={(open) => {
          setShowApproveDialog(open);
          if (!open) setAcceptedTerms(false);
        }}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-primary" />
                </div>
                <DialogTitle className="text-xl">Approve Estimate {estimate?.estimate_number}</DialogTitle>
              </div>
              <div className="pt-2 text-sm text-muted-foreground">
                <div className="space-y-4">
                  <p className="text-base text-card-foreground">
                    This will mark the estimate as <strong>approved by the customer</strong>.
                  </p>

                  {estimate?.total && (
                    <div className="bg-muted/50 rounded-lg p-3 border border-border">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-muted-foreground">Total Amount:</span>
                        <span className="text-lg font-semibold text-foreground">
                          {formatCurrency(parseFloat(estimate.total))}
                        </span>
                      </div>
                    </div>
                  )}

                    <TermsAcceptanceBlock
                    terms={estimate?.approval_terms}
                    accepted={acceptedTerms}
                    onAcceptedChange={setAcceptedTerms}
                    staffMode
                  />
                </div>
              </div>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="secondary"
                onClick={() => setShowApproveDialog(false)}
                disabled={approveEstimateMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={confirmApproveEstimate}
                disabled={approveEstimateMutation.isPending || !acceptedTerms}
                className="bg-primary hover:bg-primary/90 text-white"
              >
                {approveEstimateMutation.isPending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Approving...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Approve Estimate
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
