"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
// eslint-disable-next-line @typescript-eslint/no-unused-vars 
import { billingApi, type Payment, type PaymentAllocation } from "@/lib/api/billing";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
// eslint-disable-next-line @typescript-eslint/no-unused-vars 
import { ArrowLeft, DollarSign, Calendar, CreditCard, FileText, User, RotateCcw, Printer } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { useToast } from "@/lib/hooks/useToast";
// eslint-disable-next-line @typescript-eslint/no-unused-vars 
import { Separator } from "@/components/ui/separator";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { useCurrency } from "@/lib/hooks/useCurrency";
import { usePrint } from "@/lib/hooks/usePrint";

export default function PaymentDetailPage() {
    const { formatCurrency } = useCurrency();
    const { openPrintWindow, isOpeningPrint } = usePrint();
    const params = useParams();
    const router = useRouter();
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const id = parseInt(params.id as string);
    const [refundAmount, setRefundAmount] = useState("");
    const [refundReason, setRefundReason] = useState("");
    const [isRefundDialogOpen, setIsRefundDialogOpen] = useState(false);

    // Validate ID to prevent NaN API calls
    const isValidId = !isNaN(id) && id > 0;

    const { data: payment, isLoading, error } = useQuery({
        queryKey: ['payment', id],
        queryFn: () => billingApi.payments.get(id),
        enabled: isValidId,
    });

    const { data: allocations } = useQuery({
        queryKey: ['payment-allocations', id],
        queryFn: () => billingApi.payments.allocations(id),
        enabled: isValidId && !!payment,
    });

    const refundMutation = useMutation({
        mutationFn: (data: { refund_amount: string; refund_reason: string }) =>
            billingApi.payments.refund(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['payment', id] });
            setIsRefundDialogOpen(false);
            setRefundAmount("");
            setRefundReason("");
            toast({ title: "Success", description: "Payment refunded successfully" });
        },

        onError: (err: any) => {
            toast({
                title: "Error",
                description: err.response?.data?.error || "Failed to refund payment",
                variant: "destructive"
            });
        }
    });

    const handleRefundSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!refundAmount || !refundReason) {
            toast({ title: "Error", description: "Please fill in all fields", variant: "destructive" });
            return;
        }
        refundMutation.mutate({
            refund_amount: refundAmount,
            refund_reason: refundReason
        });
    };

    if (!isValidId) {
        return (
            <div className="p-8 space-y-4">
                <Button variant="ghost" onClick={() => router.back()}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                </Button>
                <Card className="border-destructive/20 bg-destructive/10">
                    <CardContent className="pt-6">
                        <p className="text-sm font-medium text-destructive">Invalid Payment ID</p>
                        <p className="text-sm text-destructive mt-1">The payment ID in the URL is invalid.</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (isLoading) {
        return <div className="p-8 flex justify-center">Loading payment details...</div>;
    }

    if (error || !payment) {
        return (
            <div className="p-8 space-y-4">
                <Button variant="ghost" onClick={() => router.back()}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                </Button>
                <div className="text-destructive">Error loading payment details or payment not found.</div>
            </div>
        );
    }

    const getStatusVariant = (status: string) => {

        const variants: Record<string, any> = {
            pending: 'warning',
            completed: 'success',
            failed: 'destructive',
            refunded: 'secondary',
            partially_refunded: 'warning',
        };
        return variants[status] || 'default';
    };

    return (
        <div className="space-y-6 p-8 min-h-screen">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="sm" onClick={() => router.back()}>
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back
                    </Button>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-bold tracking-tight">Payment {payment.payment_number}</h1>
                            <Badge variant={getStatusVariant(payment.status)}>
                                {payment.status.replace('_', ' ').toUpperCase()}
                            </Badge>
                        </div>
                        <p className="text-muted-foreground mt-1">
                            Received on {format(new Date(payment.payment_date), 'MMMM dd, yyyy')}
                        </p>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => openPrintWindow({ documentType: 'receipt', documentId: id })} disabled={isOpeningPrint}>
                        <Printer className="mr-2 h-4 w-4" />
                        {isOpeningPrint ? 'Opening...' : 'Print Receipt'}
                    </Button>

                    {payment.status === 'completed' && (
                        <Dialog open={isRefundDialogOpen} onOpenChange={setIsRefundDialogOpen}>
                            <DialogTrigger asChild>
                                <Button variant="destructive">
                                    <RotateCcw className="mr-2 h-4 w-4" />
                                    Refund
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Refund Payment</DialogTitle>
                                    <DialogDescription>
                                        Process a full or partial refund for this payment.
                                        Max refundable: {formatCurrency(parseFloat(payment.amount))}
                                    </DialogDescription>
                                </DialogHeader>
                                <form onSubmit={handleRefundSubmit} className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="amount">Refund Amount</Label>
                                        <Input
                                            id="amount"
                                            type="number"
                                            step="0.01"
                                            max={payment.amount}
                                            value={refundAmount}
                                            onChange={(e) => setRefundAmount(e.target.value)}
                                            placeholder="0.00"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="reason">Reason</Label>
                                        <Textarea
                                            id="reason"
                                            value={refundReason}
                                            onChange={(e) => setRefundReason(e.target.value)}
                                            placeholder="Reason for refund..."
                                            required
                                        />
                                    </div>
                                    <DialogFooter>
                                        <Button type="submit" disabled={refundMutation.isPending}>
                                            {refundMutation.isPending ? 'Processing...' : 'Process Refund'}
                                        </Button>
                                    </DialogFooter>
                                </form>
                            </DialogContent>
                        </Dialog>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Main Content */}
                <div className="md:col-span-2 space-y-6">
                    {/* Payment Details */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <DollarSign className="h-5 w-5 text-muted-foreground" />
                                Payment Details
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-2 gap-6">
                            <div>
                                <h3 className="text-sm font-medium text-muted-foreground mb-1">Amount</h3>
                                <p className="text-2xl font-bold">${parseFloat(payment.amount).toLocaleString()}</p>
                            </div>
                            <div>
                                <h3 className="text-sm font-medium text-muted-foreground mb-1">Method</h3>
                                <div className="flex items-center gap-2">
                                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                                    <span className="font-medium capitalize">{payment.payment_method.replace('_', ' ')}</span>
                                </div>
                            </div>
                            <div>
                                <h3 className="text-sm font-medium text-muted-foreground mb-1">Reference</h3>
                                <p className="font-medium">{payment.reference_number || '-'}</p>
                            </div>
                            <div>
                                <h3 className="text-sm font-medium text-muted-foreground mb-1">Transaction ID</h3>
                                <p className="font-medium">{payment.transaction_id || '-'}</p>
                            </div>
                            {payment.notes && (
                                <div className="col-span-2">
                                    <h3 className="text-sm font-medium text-muted-foreground mb-1">Notes</h3>
                                    <p className="text-card-foreground bg-muted p-3 rounded-md">
                                        {payment.notes}
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Allocations */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <FileText className="h-5 w-5 text-muted-foreground" />
                                Allocations
                            </CardTitle>
                            <CardDescription>
                                How this payment was applied to invoices
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Invoice</TableHead>
                                        <TableHead>Date</TableHead>
                                        <TableHead className="text-right">Amount</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {allocations && allocations.length > 0 ? (
                                        allocations.map((alloc: PaymentAllocation) => (
                                            <TableRow key={alloc.id}>
                                                <TableCell>
                                                    <Link href={`/billing/invoices/${alloc.invoice}`} className="text-primary hover:underline font-medium">
                                                        {alloc.invoice_number}
                                                    </Link>
                                                </TableCell>
                                                <TableCell>{format(new Date(alloc.allocated_at), 'MMM dd, yyyy')}</TableCell>
                                                <TableCell className="text-right font-mono">${parseFloat(alloc.amount).toLocaleString()}</TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={3} className="text-center py-6 text-muted-foreground">
                                                No allocations found
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </div>

                {/* Sidebar */}
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Customer Info</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-3 mb-4">
                                <div className="h-10 w-10 rounded-full bg-orange-100 dark:bg-orange-900 flex items-center justify-center">
                                    <User className="h-5 w-5 text-primary" />
                                </div>
                                <div>
                                    <Link href={payment.customer ? `/customers/${payment.customer}` : '#'} className="font-medium hover:text-primary block">
                                        {payment.customer_name || 'Unknown Customer'}
                                    </Link>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Related Invoice (if direct payment) */}
                    {payment.invoice && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Primary Invoice</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <Link href={`/billing/invoices/${payment.invoice}`} className="flex items-center justify-between p-3 border rounded-md hover:bg-muted hover:bg-muted transition-colors">
                                    <div className="flex items-center gap-3">
                                        <FileText className="h-5 w-5 text-muted-foreground" />
                                        <span className="font-medium">{payment.invoice_number}</span>
                                    </div>
                                    <ArrowLeft className="h-4 w-4 rotate-180 text-muted-foreground" />
                                </Link>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
}
