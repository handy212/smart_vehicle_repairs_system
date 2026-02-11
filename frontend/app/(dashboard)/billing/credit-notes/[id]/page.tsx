"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { billingApi } from "@/lib/api/billing";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Printer, CheckCircle, Download, FileText } from "lucide-react";
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

export default function CreditNoteDetailPage() {
    const { formatCurrency } = useCurrency();
    const params = useParams();
    const router = useRouter();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const id = parseInt(params.id as string);
    const { openPrintWindow, isOpeningPrint } = usePrint();

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
        onError: (error: any) => {
            toast({
                title: "Error",
                description: error.response?.data?.error || "Failed to approve credit note",
                variant: "destructive",
            });
        },
    });

    if (!isValidId) {
        return (
            <div className="space-y-4 p-8">
                <Link href="/billing/credit-notes">
                    <Button variant="secondary">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back
                    </Button>
                </Link>
                <Card className="border-red-200 bg-red-50">
                    <CardContent className="pt-6">
                        <p className="text-sm font-medium text-red-800">Invalid Credit Note ID</p>
                        <p className="text-sm text-red-700 mt-1">The credit note ID in the URL is invalid.</p>
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
            <div className="p-8 text-center text-red-600">
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

    return (
        <div className="space-y-6">
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
                            <Badge variant={getStatusVariant(creditNote.status) as any} className="text-base">
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
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
