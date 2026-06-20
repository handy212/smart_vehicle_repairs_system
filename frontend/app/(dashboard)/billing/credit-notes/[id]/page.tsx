"use client";

// eslint-disable-next-line @typescript-eslint/no-unused-vars 
import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { billingApi } from "@/lib/api/billing";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
// eslint-disable-next-line @typescript-eslint/no-unused-vars 
import { ArrowLeft, Printer, CheckCircle, Download, FileText, Database, Loader2 } from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";
import { useToast } from "@/lib/hooks/useToast";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { usePrint } from "@/lib/hooks/usePrint";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { ApplyCreditToInvoiceDialog } from "@/components/billing/ApplyCreditToInvoiceDialog";
import { quickbooksApi } from "@/lib/api/quickbooks";
import { useQuickBooksConnection } from "@/hooks/useQuickBooksConnection";

export default function CreditNoteDetailPage() {
    const { formatCurrency } = useCurrency();
    const params = useParams();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const id = parseInt(params.id as string);
    const { openPrintWindow, isOpeningPrint } = usePrint();
    const [applyDialogOpen, setApplyDialogOpen] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const { isConnected: isQboConnected } = useQuickBooksConnection();

    // Validate ID to prevent NaN API calls
    const isValidId = !isNaN(id) && id > 0;

    const { data: creditNote, isLoading, error } = useQuery({
        queryKey: ["creditNote", id],
        queryFn: () => billingApi.creditNotes.get(id),
        enabled: isValidId,
    });

    const approveMutation = useMutation({
        mutationFn: () => billingApi.creditNotes.approve(id),
        onSuccess: () => {
            toast({
                title: "Success",
                description: "Credit note approved successfully",
            });
            queryClient.invalidateQueries({ queryKey: ["creditNote", id] });
        },

        onError: (error: unknown) => {
            let description = "Failed to approve credit note";
            if (error && typeof error === "object" && "response" in error) {
                const d = (error as { response?: { data?: { error?: string } } }).response?.data;
                if (d?.error) description = d.error;
            }
            toast({
                title: "Error",
                description,
                variant: "destructive",
            });
        },
    });

    const handleQBOSync = async () => {
        try {
            setIsSyncing(true);
            await quickbooksApi.syncOutbound({ entity_type: "credit_note", object_id: id });
            toast({
                title: "QuickBooks Sync",
                description: "Credit memo push to QuickBooks triggered. Status should update shortly.",
            });
            queryClient.invalidateQueries({ queryKey: ["creditNote", id] });
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

    if (!isValidId) {
        return (
            <div className="space-y-4 p-8">
                <Link href="/billing/credit-notes">
                    <Button variant="secondary">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back
                    </Button>
                </Link>
                <Card className="border-destructive/20 bg-destructive/10">
                    <CardContent className="pt-6">
                        <p className="text-sm font-medium text-destructive">Invalid Credit Note ID</p>
                        <p className="text-sm text-destructive mt-1">The credit note ID in the URL is invalid.</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (error || !creditNote) {
        return (
            <div className="p-8 text-center text-destructive">
                Error loading credit note.
            </div>
        );
    }

    const getStatusVariant = (status: string) => {
        switch (status) {
            case "issued":
                return "success";
            case "applied":
                return "info";
            case "refunded":
                return "secondary";
            case "draft":
                return "default";
            case "void":
                return "danger";
            default:
                return "default";
        }
    };

    const unusedNum = parseFloat(creditNote.unused_amount || "0");
    const customerIdNum =
        typeof creditNote.customer === "object" && creditNote.customer != null
            ? creditNote.customer.id
            : Number(creditNote.customer);

    return (
        <div className="space-y-6">
            <ApplyCreditToInvoiceDialog
                open={applyDialogOpen}
                onOpenChange={setApplyDialogOpen}
                creditNoteId={id}
                customerId={customerIdNum}
                unusedCredit={unusedNum}
            />
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-4">
                    <Link href="/billing/credit-notes">
                        <Button variant="ghost" size="icon">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
                            Credit Note #{creditNote.credit_note_number}

                            <Badge variant={getStatusVariant(creditNote.status) as BadgeProps["variant"]} className="text-base">
                                {creditNote.status.toUpperCase()}
                            </Badge>
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Created on {format(new Date(creditNote.created_at || new Date()), "MMM d, yyyy")}
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
                    {creditNote.status === 'draft' && (
                        <Button
                            onClick={() => approveMutation.mutate()}
                            disabled={approveMutation.isPending}
                            className="bg-success hover:bg-green-700"
                        >
                            <CheckCircle className="mr-2 h-4 w-4" />
                            {approveMutation.isPending ? "Approving..." : "Approve & Issue"}
                        </Button>
                    )}
                    {creditNote.status === "issued" && unusedNum > 0.001 && Number.isFinite(customerIdNum) && customerIdNum > 0 && (
                        <Button variant="default" onClick={() => setApplyDialogOpen(true)}>
                            Apply to invoice
                        </Button>
                    )}
                    <Button variant="outline" onClick={() => openPrintWindow({ documentType: 'credit_note', documentId: id })} disabled={isOpeningPrint}>
                        <Printer className="mr-2 h-4 w-4" /> {isOpeningPrint ? 'Opening...' : 'Print'}
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Details */}
                <div className="lg:col-span-2 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Credit Note Items</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Description</TableHead>
                                        <TableHead className="text-right">Qty</TableHead>
                                        <TableHead className="text-right">Unit Price</TableHead>
                                        <TableHead className="text-right">Total</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {creditNote.line_items?.map((item) => (
                                        <TableRow key={item.id}>
                                            <TableCell className="font-medium">{item.description}</TableCell>
                                            <TableCell className="text-right">{item.quantity}</TableCell>
                                            <TableCell className="text-right">{formatCurrency(parseFloat(item.unit_price))}</TableCell>
                                            <TableCell className="text-right">{formatCurrency(parseFloat(item.total || "0"))}</TableCell>
                                        </TableRow>
                                    ))}
                                    <TableRow className="border-t-2">
                                        <TableCell colSpan={3} className="text-right font-bold">Subtotal</TableCell>
                                        <TableCell className="text-right font-bold">{formatCurrency(parseFloat(creditNote.subtotal || "0"))}</TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell colSpan={3} className="text-right font-bold text-lg">Total Credit</TableCell>
                                        <TableCell className="text-right font-bold text-lg text-primary">{formatCurrency(parseFloat(creditNote.total))}</TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    {(creditNote.applications?.length ?? 0) > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Applied to invoices</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Invoice</TableHead>
                                            <TableHead className="text-right">Amount</TableHead>
                                            <TableHead>Date</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {creditNote.applications?.map((a) => (
                                            <TableRow key={a.id}>
                                                <TableCell>
                                                    <Link
                                                        href={`/billing/invoices/${a.invoice}`}
                                                        className="text-primary hover:underline font-medium"
                                                    >
                                                        #{a.invoice_number ?? a.invoice}
                                                    </Link>
                                                </TableCell>
                                                <TableCell className="text-right font-mono">
                                                    {formatCurrency(parseFloat(a.amount))}
                                                </TableCell>
                                                <TableCell className="text-sm text-muted-foreground">
                                                    {a.applied_at
                                                        ? format(new Date(a.applied_at), "MMM d, yyyy h:mm a")
                                                        : "—"}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    )}

                    {/* Activity/Notes could go here */}
                </div>

                {/* Sidebar */}
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Customer Details</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <Label className="text-muted-foreground">Name</Label>
                                <p className="font-medium">
                                    {typeof creditNote.customer === 'object' ? creditNote.customer.full_name : creditNote.customer_name}
                                </p>
                            </div>
                            {creditNote.invoice_number && (
                                <div>
                                    <Label className="text-muted-foreground">Original Invoice</Label>
                                    <p>
                                        <Link
                                            href={`/billing/invoices/${typeof creditNote.invoice === 'object' ? creditNote.invoice?.id : creditNote.invoice}`}
                                            className="text-primary hover:underline flex items-center gap-1"
                                        >
                                            <FileText className="h-4 w-4" />
                                            #{creditNote.invoice_number}
                                        </Link>
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Overview</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">Unused Amount</span>
                                <Badge variant="outline" className="text-lg">
                                    {formatCurrency(parseFloat(creditNote.unused_amount))}
                                </Badge>
                            </div>

                            <div className="pt-4 border-t">
                                <p className="text-sm text-muted-foreground mb-1">Reason</p>
                                <p>{creditNote.reason || "-"}</p>
                            </div>

                            {creditNote.notes && (
                                <div className="pt-4 border-t">
                                    <p className="text-sm text-muted-foreground mb-1">Notes</p>
                                    <p className="text-sm">{creditNote.notes}</p>
                                </div>
                            )}

                            {isQboConnected && creditNote.qbo_sync_status && (
                                <div className="pt-4 border-t">
                                    <p className="text-sm text-muted-foreground mb-2">QuickBooks Sync</p>
                                    <div className="flex items-center gap-2">
                                        <Badge
                                            variant={
                                                creditNote.qbo_sync_status === "synced"
                                                    ? "success"
                                                    : creditNote.qbo_sync_status === "failed"
                                                      ? "danger"
                                                      : "secondary"
                                            }
                                            className="capitalize"
                                        >
                                            {creditNote.qbo_sync_status}
                                        </Badge>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 px-2"
                                            onClick={handleQBOSync}
                                            disabled={isSyncing}
                                            title="Push to QuickBooks"
                                        >
                                            {isSyncing ? (
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            ) : (
                                                <Database className="w-3.5 h-3.5" />
                                            )}
                                        </Button>
                                    </div>
                                    {creditNote.qbo_sync_status === "failed" && creditNote.qbo_sync_error && (
                                        <p className="text-xs text-destructive mt-2">{creditNote.qbo_sync_error}</p>
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
