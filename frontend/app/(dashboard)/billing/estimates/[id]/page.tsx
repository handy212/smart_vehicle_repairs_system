"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { billingApi } from "@/lib/api/billing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Edit, Mail, FileText, CheckCircle, XCircle, Download, Wrench, Printer, ChevronDown, MoreVertical, AlertCircle } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/lib/hooks/useToast";
import { useBranchStore } from "@/store/branchStore";

export default function EstimateDetailPage() {
  const params = useParams();
  const router = useRouter();
  const estimateId = parseInt(params.id as string);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isConverting, setIsConverting] = useState(false);
  const [localStatus, setLocalStatus] = useState<string | null>(null);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showApproveDialog, setShowApproveDialog] = useState(false);

  const { data: estimate, isLoading, error } = useQuery({
    queryKey: ["estimate", estimateId],
    queryFn: () => billingApi.estimates.get(estimateId),
  });

  // Update local status when estimate data changes
  useEffect(() => {
    if (estimate?.status) {
      setLocalStatus(estimate.status);
    }
  }, [estimate?.status]);

  const statusChangeMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      return billingApi.estimates.update(estimateId, { status: newStatus });
    },
    onMutate: async (newStatus) => {
      await queryClient.cancelQueries({ queryKey: ["estimate", estimateId] });
      const previousEstimate = queryClient.getQueryData(["estimate", estimateId]);
      queryClient.setQueryData(["estimate", estimateId], (old: any) => ({
        ...old,
        status: newStatus,
      }));
      setLocalStatus(newStatus);
      return { previousEstimate };
    },
    onError: (err, newStatus, context) => {
      if (context?.previousEstimate) {
        queryClient.setQueryData(["estimate", estimateId], context.previousEstimate);
        setLocalStatus((context.previousEstimate as any)?.status || estimate?.status || null);
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
    onError: (error: any) => {
      setIsConverting(false);
      toast({
        title: "Error",
        description: error.response?.data?.error || error.response?.data?.detail || "Failed to convert estimate",
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
    onError: (error: any) => {
      setIsConverting(false);
      toast({
        title: "Error",
        description: error.response?.data?.error || error.response?.data?.detail || "Failed to convert estimate",
        variant: "destructive",
      });
    },
  });

  const approveEstimateMutation = useMutation({
    mutationFn: () => billingApi.estimates.approve(estimateId),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Estimate approved successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["estimate", estimateId] });
      queryClient.invalidateQueries({ queryKey: ["estimates"] });
      setLocalStatus("approved");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || error.response?.data?.error || "Failed to approve estimate",
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

  const handleDownloadPDF = async () => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api'}/billing/estimates/${estimateId}/pdf/`, {
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
      a.download = `estimate_${estimate?.estimate_number || estimateId}.pdf`;
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

  const confirmApproveEstimate = () => {
    setShowApproveDialog(false);
    approveEstimateMutation.mutate();
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
        <Buttonvariant="secondary" onClick={() => router.back()}>
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
          <Buttonvariant="secondary" onClick={() => router.back()} className="no-print">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm font-semibold text-gray-700 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-300">
                Estimate #{estimate.estimate_number}
              </span>
              {estimate.work_order && estimate.work_order_number && (
                <Link href={`/workorders/${typeof estimate.work_order === 'object' ? estimate.work_order.id : estimate.work_order}`}>
                  <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors dark:bg-blue-950/20 dark:border-blue-800 dark:text-blue-400">
                    <span className="h-2 w-2 rounded-full bg-blue-500" />
                    Work Order #{estimate.work_order_number}
                  </span>
                </Link>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
              {estimate.customer_name || "Customer"}
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
                      handleDownloadPDF();
                      setShowActionsMenu(false);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Download PDF
                  </button>
                  <button
                    onClick={() => {
                      handleSendEmail();
                      setShowActionsMenu(false);
                    }}
                    disabled={sendEmailMutation.isPending}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Mail className="w-4 h-4" />
                    {sendEmailMutation.isPending ? "Sending..." : "Send Email"}
                  </button>
                  <Link href={`/billing/estimates/${estimateId}/edit`}>
                    <button
                      onClick={() => setShowActionsMenu(false)}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                    >
                      <Edit className="w-4 h-4" />
                      Edit
                    </button>
                  </Link>
                  {estimate.can_be_approved && estimate.status !== "approved" && (
                    <button
                      onClick={() => {
                        handleApproveEstimate();
                        setShowActionsMenu(false);
                      }}
                      disabled={approveEstimateMutation.isPending}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed border-t border-gray-200 dark:border-gray-700 mt-1"
                    >
                      <CheckCircle className="w-4 h-4" />
                      {approveEstimateMutation.isPending ? "Approving..." : "Approve Estimate"}
                    </button>
                  )}
                  {estimate.can_be_converted && estimate.status !== "converted" && (
                    <>
                      <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                      <button
                        onClick={() => {
                          handleConvertToInvoice();
                          setShowActionsMenu(false);
                        }}
                        disabled={isConverting}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <FileText className="w-4 h-4" />
                        To Invoice
                      </button>
                      <button
                        onClick={() => {
                          handleConvertToWorkOrder();
                          setShowActionsMenu(false);
                        }}
                        disabled={isConverting}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Wrench className="w-4 h-4" />
                        To Work Order
                      </button>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
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
                  <p className="text-sm font-medium text-gray-500 mb-2">Status</p>
                  <div className="flex items-center gap-2">
                    <Badge variant={getStatusVariant(localStatus || estimate.status) as any}>
                      {(localStatus || estimate.status)?.replace("_", " ").toUpperCase()}
                    </Badge>
                    <select
                      value={localStatus || estimate.status}
                      onChange={handleStatusChange}
                      disabled={statusChangeMutation.isPending}
                      className="px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option value="draft">Draft</option>
                      <option value="sent">Sent</option>
                      <option value="viewed">Viewed</option>
                      <option value="approved">Approved</option>
                      <option value="declined">Declined</option>
                      <option value="converted">Converted</option>
                    </select>
                    {statusChangeMutation.isPending && (
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600"></div>
                    )}
                  </div>
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
                  {estimate.customer_email && (
                    <p className="text-xs text-gray-500 mt-1">{estimate.customer_email}</p>
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
                    {estimate.vehicle_vin && (
                      <p className="text-xs text-gray-500 mt-1">VIN: {estimate.vehicle_vin}</p>
                    )}
                  </div>
                )}
              </div>
              {((estimate.title || estimate.description) && (
                <div className="border-t pt-4 mt-4 space-y-3">
                  {estimate.title && (
                    <div>
                      <p className="text-sm font-medium text-gray-500 mb-1">Title</p>
                      <p className="text-gray-900 text-sm">{estimate.title}</p>
                    </div>
                  )}
                  {estimate.description && (
                    <div>
                      <p className="text-sm font-medium text-gray-500 mb-1">Description</p>
                      <p className="text-gray-900 text-sm whitespace-pre-wrap">{estimate.description}</p>
                    </div>
                  )}
                </div>
              ))}
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
              
              {/* Discount Display */}
              {parseFloat(estimate.discount_percentage || "0") > 0 && parseFloat(estimate.discount_amount || "0") > 0 && (
                <>
                  <div className="flex items-center justify-between text-red-600">
                    <span className="text-sm">
                      Discount ({parseFloat(estimate.discount_percentage || "0").toFixed(1)}%)
                      {estimate.discount_reason && (
                        <span className="text-xs text-gray-500 ml-1">- {estimate.discount_reason}</span>
                      )}
                    </span>
                    <span>
                      -${parseFloat(estimate.discount_amount || "0").toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between font-medium border-t pt-2">
                    <span className="text-sm text-gray-500">Subtotal after Discount</span>
                    <span className="text-gray-900">
                      ${(parseFloat(estimate.subtotal || "0") - parseFloat(estimate.discount_amount || "0")).toFixed(2)}
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
                    ${parseFloat(estimate.total || "0").toFixed(2)}
                  </span>
                </div>
              </div>
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

      {/* Approve Estimate Confirmation Dialog */}
      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <DialogTitle className="text-xl">Approve Estimate {estimate?.estimate_number}</DialogTitle>
            </div>
            <DialogDescription className="pt-2">
              <div className="space-y-4">
                <p className="text-base text-gray-700 dark:text-gray-300">
                  This will mark the estimate as <strong>approved by the customer</strong>.
                </p>
                
                {estimate?.total && (
                  <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Amount:</span>
                      <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        ${parseFloat(estimate.total).toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </DialogDescription>
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
              disabled={approveEstimateMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700 text-white"
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
