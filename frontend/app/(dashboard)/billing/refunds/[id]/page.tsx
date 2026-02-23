"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { refundApi, type Refund } from "@/lib/api/till-refund";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ArrowLeft, CheckCircle, XCircle, FileText, User, Calendar, DollarSign, Wallet } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { useToast } from "@/lib/hooks/useToast";
import { Separator } from "@/components/ui/separator";

import { useCurrency } from "@/lib/hooks/useCurrency";
export default function RefundDetailPage() {
    const { formatCurrency } = useCurrency();
    const params = useParams();
    const router = useRouter();
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const id = parseInt(params.id as string);

    // Validate ID to prevent NaN API calls
    const isValidId = !isNaN(id) && id > 0;

    const { data: refund, isLoading, error } = useQuery({
        queryKey: ['refund', id],
        queryFn: () => refundApi.get(id),
        enabled: isValidId,
    });

    const approveMutation = useMutation({
        mutationFn: () => refundApi.approve(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['refund', id] });
            queryClient.invalidateQueries({ queryKey: ['refunds'] });
            toast({ title: "Success", description: "Refund approved successfully" });
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onError: (err: any) => {
        toast({
            title: "Error",
            description: err.response?.data?.error || "Failed to approve refund",
            variant: "destructive"
        });
    }
    });

const rejectMutation = useMutation({
    mutationFn: () => refundApi.reject(id),
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['refund', id] });
        queryClient.invalidateQueries({ queryKey: ['refunds'] });
        toast({ title: "Success", description: "Refund rejected successfully" });
    },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onError: (err: any) => {
    toast({
        title: "Error",
        description: err.response?.data?.error || "Failed to reject refund",
        variant: "destructive"
    });
}
    });

const completeMutation = useMutation({
    mutationFn: () => refundApi.complete(id),
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['refund', id] });
        queryClient.invalidateQueries({ queryKey: ['refunds'] });
        toast({ title: "Success", description: "Refund marked as completed" });
    },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onError: (err: any) => {
    toast({
        title: "Error",
        description: err.response?.data?.error || "Failed to complete refund",
        variant: "destructive"
    });
}
    });

if (!isValidId) {
    return (
        <div className="p-8 space-y-4">
            <Button variant="ghost" onClick={() => router.back()}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
            </Button>
            <Card className="border-red-200 bg-red-50">
                <CardContent className="pt-6">
                    <p className="text-sm font-medium text-red-800">Invalid Refund ID</p>
                    <p className="text-sm text-red-700 mt-1">The refund ID in the URL is invalid.</p>
                </CardContent>
            </Card>
        </div>
    );
}

if (isLoading) {
    return <div className="p-8 flex justify-center">Loading refund details...</div>;
}

if (error || !refund) {
    return (
        <div className="p-8 space-y-4">
            <Button variant="ghost" onClick={() => router.back()}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
            </Button>
            <div className="text-red-500">Error loading refund details or refund not found.</div>
        </div>
    );
}

const getStatusVariant = (status: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const variants: Record<string, any> = {
        pending: 'warning',
        approved: 'default',
        completed: 'success',
        rejected: 'destructive',
        cancelled: 'secondary',
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
                        <h1 className="text-2xl font-bold tracking-tight">Refund {refund.refund_number}</h1>
                        <Badge variant={getStatusVariant(refund.status)}>
                            {refund.status.toUpperCase()}
                        </Badge>
                    </div>
                    <p className="text-muted-foreground mt-1">
                        Requested by {refund.requested_by_name} on {format(new Date(refund.requested_at), 'MMMM dd, yyyy')}
                    </p>
                </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
                {refund.status === 'pending' && (
                    <>
                        <Button
                            onClick={() => approveMutation.mutate()}
                            disabled={approveMutation.isPending}
                            className="bg-success hover:bg-green-700"
                        >
                            <CheckCircle className="mr-2 h-4 w-4" />
                            Approve
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() => rejectMutation.mutate()}
                            disabled={rejectMutation.isPending}
                        >
                            <XCircle className="mr-2 h-4 w-4" />
                            Reject
                        </Button>
                    </>
                )}
                {refund.status === 'approved' && (
                    <Button
                        onClick={() => completeMutation.mutate()}
                        disabled={completeMutation.isPending}
                    >
                        <CheckCircle className="mr-2 h-4 w-4" />
                        Mark Completed
                    </Button>
                )}
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Refund Details */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <DollarSign className="h-5 w-5 text-muted-foreground" />
                        Refund Information
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex justify-between items-center p-4 bg-muted rounded-lg border">
                        <span className="text-sm font-medium text-muted-foreground">Amount to Refund</span>
                        <span className="text-2xl font-bold text-foreground">
                            {formatCurrency(parseFloat(refund.amount))}
                        </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <h3 className="text-sm font-medium text-muted-foreground mb-1">Method</h3>
                            <p className="font-medium capitalize flex items-center gap-2">
                                <Wallet className="h-4 w-4 text-muted-foreground" />
                                {refund.refund_method.replace('_', ' ')}
                            </p>
                        </div>
                        <div>
                            <h3 className="text-sm font-medium text-muted-foreground mb-1">Reference</h3>
                            <p className="font-medium">{refund.reference_number || '-'}</p>
                        </div>
                    </div>

                    <Separator />

                    <div>
                        <h3 className="text-sm font-medium text-muted-foreground mb-2">Reason</h3>
                        <p className="text-sm bg-muted p-3 rounded-md min-h-[60px]">
                            {refund.reason}
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Related Information */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                        Related Information
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <User className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm font-medium text-muted-foreground">Customer</span>
                            </div>
                            <Link href={`/customers/${refund.customer}`} className="text-primary hover:underline">
                                {refund.customer_name}
                            </Link>
                        </div>

                        <Separator />

                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm font-medium text-muted-foreground">Invoice</span>
                            </div>
                            <Link href={`/billing/invoices/${refund.invoice}`} className="text-primary hover:underline">
                                View Invoice #{refund.invoice}
                            </Link>
                        </div>

                        <Separator />

                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm font-medium text-muted-foreground">Original Payment</span>
                            </div>
                            <Link href={`/billing/payments/${refund.original_payment}`} className="text-primary hover:underline">
                                View Payment #{refund.original_payment}
                            </Link>
                        </div>
                    </div>

                    <div className="bg-primary/10 dark:bg-orange-900/10 p-4 rounded-lg border border-orange-100 dark:border-orange-900">
                        <h4 className="text-sm font-semibold text-orange-900 dark:text-orange-100 mb-2">Audit Trail</h4>
                        <div className="space-y-2 text-xs">
                            <div className="flex justify-between">
                                <span className="text-primary dark:text-orange-300">Requested</span>
                                <span className="text-orange-900 dark:text-orange-100">
                                    {format(new Date(refund.requested_at), 'MMM dd, HH:mm')} by {refund.requested_by_name}
                                </span>
                            </div>
                            {refund.approved_at && (
                                <div className="flex justify-between">
                                    <span className="text-primary dark:text-orange-300">Approved</span>
                                    <span className="text-orange-900 dark:text-orange-100">
                                        {format(new Date(refund.approved_at), 'MMM dd, HH:mm')} by {refund.approved_by_name}
                                    </span>
                                </div>
                            )}
                            {refund.processed_at && (
                                <div className="flex justify-between">
                                    <span className="text-primary dark:text-orange-300">Processed</span>
                                    <span className="text-orange-900 dark:text-orange-100">
                                        {format(new Date(refund.processed_at), 'MMM dd, HH:mm')} by {refund.processed_by_name}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    </div>
);
}
