"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { billingApi } from "@/lib/api/billing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Edit, Download, Printer, FileCheck, FileText, Wrench, MoreVertical, Mail, CheckCircle2, ChevronDown, DollarSign, Calendar, Clock, StickyNote, Receipt } from "lucide-react";

import Link from "next/link";
import { format } from "date-fns";
import { useToast } from "@/lib/hooks/useToast";
import { usePrint } from "@/lib/hooks/usePrint";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function ProformaDetailPage() {
    const { formatCurrency } = useCurrency();
    const params = useParams();
    const router = useRouter();
    const invoiceId = parseInt(params.id as string);
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { downloadPDF, openPrintWindow, isDownloading, isOpeningPrint } = usePrint();
    const [showActionsMenu, setShowActionsMenu] = useState(false);
    const [localStatus, setLocalStatus] = useState<string | null>(null);

    // Validate invoiceId to prevent NaN API calls
    const isValidId = !isNaN(invoiceId) && invoiceId > 0;

    const { data: invoice, isLoading, error } = useQuery({
        queryKey: ["invoice", invoiceId],
        queryFn: () => billingApi.invoices.get(invoiceId),
        enabled: isValidId,
    });

    useEffect(() => {
        if (invoice?.status) {
            setLocalStatus(invoice.status);
        }
    }, [invoice?.status]);


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
            router.push(`/billing/invoices/${invoiceId}`);
        },
        onError: (error: any) => {
            toast({
                title: "Error",
                description: error.response?.data?.error || "Failed to convert proforma.",
                variant: "destructive",
            });
        },
    });

    const sendEmailMutation = useMutation({
        mutationFn: async () => {
            return billingApi.invoices.send(invoiceId);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["invoice", invoiceId] });
            toast({
                title: "Success",
                description: "Proforma sent successfully",
            });
        },
        onError: (error: any) => {
            toast({
                title: "Error",
                description: error.response?.data?.error || "Failed to send proforma. Please try again.",
                variant: "destructive",
            });
        },
    });

    const handlePrint = () => {
        openPrintWindow({ documentType: 'invoice', documentId: invoiceId });
    };

    const parseAmount = (value?: string | number | null) => {
        if (value === null || value === undefined) return 0;
        const num = typeof value === "number" ? value : parseFloat(value);
        return Number.isNaN(num) ? 0 : num;
    };


    if (!isValidId) {
        return (
            <div className="space-y-4 p-8">
                <Button variant="secondary" onClick={() => router.push("/billing/proformas")}>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back
                </Button>
                <Card className="border-red-200 bg-red-50">
                    <CardContent className="pt-6">
                        <p className="text-sm font-medium text-red-800">Invalid Proforma ID</p>
                        <p className="text-sm text-red-700 mt-1">The proforma ID in the URL is invalid.</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (isLoading) {
        return <div className="p-8 text-center">Loading proforma...</div>;
    }

    if (error || !invoice || invoice.status !== 'proforma') {
        return (
            <div className="p-8 text-center text-red-500">
                Error loading proforma or invoice is not a proforma.
                <Button variant="link" onClick={() => router.push("/billing/proformas")}>Back to list</Button>
            </div>
        );
    }

    const taxBreakdown = {
        nhilAmount: parseAmount(invoice.tax_breakdown?.nhil_amount ?? invoice.tax_nhil_amount),
        getfundAmount: parseAmount(invoice.tax_breakdown?.getfund_amount ?? invoice.tax_getfund_amount),
        hrlAmount: parseAmount(invoice.tax_breakdown?.hrl_amount ?? invoice.tax_hrl_amount),
        vatAmount: parseAmount(invoice.tax_breakdown?.vat_amount ?? invoice.tax_vat_amount),
        totalTax: parseAmount(invoice.tax_breakdown?.total_tax ?? invoice.tax_amount),
    };
    const hasDetailedTax = taxBreakdown.nhilAmount > 0 || taxBreakdown.getfundAmount > 0 || taxBreakdown.hrlAmount > 0 || taxBreakdown.vatAmount > 0;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center space-x-4">
                    <Button variant="secondary" onClick={() => router.push("/billing/proformas")}>
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back
                    </Button>
                    <div>
                        <div className="flex items-center gap-3 flex-wrap">
                            <span className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-1.5 text-sm font-semibold text-foreground">
                                Proforma #{invoice.invoice_number}
                            </span>
                            <Badge variant="info">Proforma</Badge>
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
                        {isDownloading ? "..." : "PDF"}
                    </Button>
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
                                <div className="fixed inset-0 z-10" onClick={() => setShowActionsMenu(false)} />
                                <div className="absolute right-0 mt-2 w-56 bg-card rounded-md shadow-lg border border-border z-20">
                                    <div className="py-1">
                                        <button
                                            onClick={() => {
                                                if (confirm("Send this proforma to the customer via email?")) {
                                                    sendEmailMutation.mutate();
                                                }
                                                setShowActionsMenu(false);
                                            }}
                                            disabled={sendEmailMutation.isPending}
                                            className="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-muted flex items-center gap-2 disabled:opacity-50"
                                        >
                                            <Mail className="w-4 h-4" />
                                            {sendEmailMutation.isPending ? "Sending..." : "Send Email"}
                                        </button>
                                        <div className="border-t border-border my-1" />
                                        <button
                                            onClick={() => {
                                                if (confirm("Convert this proforma to a standard invoice?")) {
                                                    convertToInvoiceMutation.mutate();
                                                }
                                                setShowActionsMenu(false);
                                            }}
                                            disabled={convertToInvoiceMutation.isPending}
                                            className="w-full text-left px-4 py-2 text-sm text-green-700 hover:bg-success/10 flex items-center gap-2 disabled:opacity-50 font-medium"
                                        >
                                            <FileCheck className="w-4 h-4" />
                                            {convertToInvoiceMutation.isPending ? "Converting..." : "Convert to Invoice"}
                                        </button>
                                        <div className="border-t border-border my-1" />
                                        <Link href={`/billing/invoices/${invoiceId}/edit`}>
                                            <button className="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-muted flex items-center gap-2">
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
            </div>

            <Tabs defaultValue="invoice" className="w-full">
                <TabsList className="w-full justify-start h-auto p-1 bg-muted/50 mb-6 flex-wrap">
                    <TabsTrigger value="invoice" className="gap-2">
                        <FileText className="w-4 h-4" /> Proforma
                    </TabsTrigger>
                    <TabsTrigger value="workorder" className="gap-2">
                        <Wrench className="w-4 h-4" /> Work Order
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="invoice" className="space-y-6">
                    <Card>
                        <CardContent className="pt-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                <div>
                                    <h3 className="text-sm font-medium text-muted-foreground mb-2">Bill To</h3>
                                    <p className="text-base font-semibold text-foreground">{invoice.customer_name}</p>
                                    {invoice.customer_email && <p className="text-sm text-muted-foreground">{invoice.customer_email}</p>}
                                    {invoice.customer_phone && <p className="text-sm text-muted-foreground">{invoice.customer_phone}</p>}
                                    {invoice.customer_address && <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{invoice.customer_address}</p>}
                                </div>

                                <div>
                                    <h3 className="text-sm font-medium text-muted-foreground mb-2">Details</h3>
                                    <div className="space-y-2">
                                        <div className="flex justify-between md:justify-start md:gap-8">
                                            <span className="text-sm text-muted-foreground w-24">Issued:</span>
                                            <span className="text-sm font-medium text-foreground">{format(new Date(invoice.invoice_date), "MMM dd, yyyy")}</span>
                                        </div>
                                        <div className="flex justify-between md:justify-start md:gap-8">
                                            <span className="text-sm text-muted-foreground w-24">Due:</span>
                                            <span className="text-sm font-medium text-red-600">{format(new Date(invoice.due_date), "MMM dd, yyyy")}</span>
                                        </div>
                                        {invoice.sales_agent_name && (
                                            <div className="flex justify-between md:justify-start md:gap-8">
                                                <span className="text-sm text-muted-foreground w-24">Sales Agent:</span>
                                                <span className="text-sm font-medium text-foreground">{invoice.sales_agent_name}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div>
                                    <h3 className="text-sm font-medium text-muted-foreground mb-2">Vehicle</h3>
                                    <div className="space-y-2">
                                        <p className="text-sm text-foreground font-medium">{invoice.vehicle_display || "N/A"}</p>
                                        <Badge variant="outline" className="w-fit">Proforma</Badge>
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

                    <Card>
                        <CardHeader className="pb-3 border-b">
                            <CardTitle className="text-lg">Line Items</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader className="bg-muted">
                                        <TableRow className="h-8">
                                            <TableHead className="w-[40%] py-2">Item / Description</TableHead>
                                            <TableHead className="text-right py-2">Qty</TableHead>
                                            <TableHead className="text-right py-2">Rate</TableHead>
                                            <TableHead className="text-right py-2">Tax</TableHead>
                                            <TableHead className="text-right py-2">Total</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {invoice.line_items?.map((item: any) => (
                                            <TableRow key={item.id}>
                                                <TableCell className="align-top py-3">
                                                    <div className="font-medium text-foreground">{item.description}</div>
                                                    <span className="text-xs text-muted-foreground capitalize">{item.item_type}</span>
                                                </TableCell>
                                                <TableCell className="text-right align-top py-3">{item.quantity}</TableCell>
                                                <TableCell className="text-right align-top py-3">
                                                    {formatCurrency(parseFloat(item.unit_price))}
                                                </TableCell>
                                                <TableCell className="text-right align-top py-3">
                                                    {item.is_taxable ? <CheckCircle2 className="w-4 h-4 text-green-500 ml-auto" /> : <span className="text-gray-300">-</span>}
                                                </TableCell>
                                                <TableCell className="text-right font-medium align-top py-3">
                                                    {formatCurrency(parseFloat(item.total))}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="flex justify-end">
                        <div className="w-full md:w-1/3 min-w-[300px] space-y-2 px-4 md:px-0">
                            <div className="flex justify-between text-sm">
                                <span className="font-medium text-muted-foreground">Subtotal</span>
                                <span className="text-foreground font-medium">
                                    {formatCurrency(parseFloat(invoice.subtotal || "0"))}
                                </span>
                            </div>

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
                                parseFloat(invoice.tax_amount || "0") > 0 && (
                                    <div className="flex justify-between text-sm text-muted-foreground">
                                        <span>Tax</span>
                                        <span>{formatCurrency(parseFloat(invoice.tax_amount || "0"))}</span>
                                    </div>
                                )
                            )}

                            <div className="flex justify-between text-lg font-bold border-t border-border pt-3 mt-2">
                                <span>Total</span>
                                <span className="text-foreground">{formatCurrency(parseFloat(invoice.total || "0"))}</span>
                            </div>
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="workorder" className="space-y-6">
                    <Card className="min-h-[300px] flex flex-col items-center justify-center text-center p-8">
                        <Wrench className="w-12 h-12 text-blue-500 mb-4" />
                        <h3 className="text-lg font-semibold">Work Order Details</h3>
                        {invoice.work_order ? (
                            <div className="mt-4">
                                <p className="text-muted-foreground">Linked to Work Order #{invoice.work_order_number}</p>
                                <Link href={`/workorders/${typeof invoice.work_order === 'object' ? invoice.work_order.id : invoice.work_order}`}>
                                    <Button variant="outline" className="mt-4">View Work Order</Button>
                                </Link>
                            </div>
                        ) : (
                            <p className="text-muted-foreground mt-2">No linked work order.</p>
                        )}
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}

