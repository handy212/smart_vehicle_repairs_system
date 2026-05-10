"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, Calendar, CreditCard, Download, Edit, FileText, Package, ReceiptText, Truck, XCircle } from "lucide-react";
import { useState } from "react";

import { billingApi } from "@/lib/api/billing";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { usePrint } from "@/lib/hooks/usePrint";
import { useToast } from "@/lib/hooks/useToast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const statusClassNames: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    pending_approval: "bg-amber-100 text-amber-700 border-amber-200",
    rejected: "bg-red-100 text-red-700 border-red-200",
    open: "bg-blue-100 text-blue-700 border-blue-200",
    partially_paid: "bg-amber-100 text-amber-700 border-amber-200",
    paid: "bg-green-100 text-green-700 border-green-200",
    overdue: "bg-red-100 text-red-700 border-red-200",
    void: "bg-slate-100 text-slate-600 border-slate-200",
};

const paymentSchema = z.object({
    amount: z.string().min(1, "Amount is required"),
    payment_date: z.string().min(1, "Payment date is required"),
    payment_method: z.enum(["cash", "check", "bank_transfer", "mobile_money", "credit_card", "other"]),
    reference_number: z.string().optional(),
    notes: z.string().optional(),
});

type PaymentValues = z.infer<typeof paymentSchema>;

export default function BillDetailPage() {
    const params = useParams();
    const router = useRouter();
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { formatCurrency } = useCurrency();
    const { downloadPDF, isDownloading } = usePrint();
    const id = Number.parseInt(params.id as string, 10);
    const isValidId = Number.isFinite(id) && id > 0;
    const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
    const [isApprovalDialogOpen, setIsApprovalDialogOpen] = useState(false);
    const [selectedApproverId, setSelectedApproverId] = useState("");

    const paymentForm = useForm<PaymentValues>({
        resolver: zodResolver(paymentSchema),
        defaultValues: {
            amount: "",
            payment_date: format(new Date(), "yyyy-MM-dd"),
            payment_method: "bank_transfer",
            reference_number: "",
            notes: "",
        },
    });

    const { data: bill, isLoading, error } = useQuery({
        queryKey: ["bill", id],
        queryFn: () => billingApi.bills.get(id),
        enabled: isValidId,
    });

    const { data: approvers = [] } = useQuery({
        queryKey: ["bill-approvers"],
        queryFn: billingApi.bills.approvers,
    });

    const recordPaymentMutation = useMutation({
        mutationFn: (data: PaymentValues) => billingApi.bills.recordPayment(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["bill", id] });
            queryClient.invalidateQueries({ queryKey: ["bills"] });
            setIsPaymentDialogOpen(false);
            paymentForm.reset({
                amount: "",
                payment_date: format(new Date(), "yyyy-MM-dd"),
                payment_method: "bank_transfer",
                reference_number: "",
                notes: "",
            });
            toast({ title: "Payment Recorded", description: "Vendor bill payment was recorded successfully." });
        },
        onError: (error: unknown) => {
            const apiError = error as { response?: { data?: { error?: string; detail?: string } } };
            toast({
                title: "Payment Failed",
                description: apiError.response?.data?.error || apiError.response?.data?.detail || "Failed to record bill payment.",
                variant: "destructive",
            });
        },
    });

    const voidMutation = useMutation({
        mutationFn: () => billingApi.bills.void(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["bill", id] });
            queryClient.invalidateQueries({ queryKey: ["bills"] });
            toast({ title: "Bill Voided", description: "The vendor bill was voided." });
        },
        onError: (error: unknown) => {
            const apiError = error as { response?: { data?: { error?: string; detail?: string } } };
            toast({
                title: "Void Failed",
                description: apiError.response?.data?.error || apiError.response?.data?.detail || "Failed to void bill.",
                variant: "destructive",
            });
        },
    });

    const submitApprovalMutation = useMutation({
        mutationFn: (approverId: number) => billingApi.bills.submitForApproval(id, approverId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["bill", id] });
            queryClient.invalidateQueries({ queryKey: ["bills"] });
            setIsApprovalDialogOpen(false);
            setSelectedApproverId("");
            toast({ title: "Submitted", description: "Standalone bill submitted for approval." });
        },
        onError: (error: unknown) => {
            const apiError = error as { response?: { data?: { error?: string; detail?: string } } };
            toast({
                title: "Submit Failed",
                description: apiError.response?.data?.error || apiError.response?.data?.detail || "Failed to submit bill.",
                variant: "destructive",
            });
        },
    });

    const approveMutation = useMutation({
        mutationFn: () => billingApi.bills.approve(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["bill", id] });
            queryClient.invalidateQueries({ queryKey: ["bills"] });
            toast({ title: "Approved", description: "Standalone bill approved and opened." });
        },
        onError: (error: unknown) => {
            const apiError = error as { response?: { data?: { error?: string; detail?: string } } };
            toast({
                title: "Approval Failed",
                description: apiError.response?.data?.error || apiError.response?.data?.detail || "Failed to approve bill.",
                variant: "destructive",
            });
        },
    });

    const rejectMutation = useMutation({
        mutationFn: (reason?: string) => billingApi.bills.reject(id, reason),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["bill", id] });
            queryClient.invalidateQueries({ queryKey: ["bills"] });
            toast({ title: "Rejected", description: "Standalone bill sent back for correction." });
        },
        onError: (error: unknown) => {
            const apiError = error as { response?: { data?: { error?: string; detail?: string } } };
            toast({
                title: "Reject Failed",
                description: apiError.response?.data?.error || apiError.response?.data?.detail || "Failed to reject bill.",
                variant: "destructive",
            });
        },
    });

    if (!isValidId) {
        return (
            <div className="space-y-4 p-8">
                <Button variant="ghost" onClick={() => router.back()}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                </Button>
                <Card className="border-destructive/20 bg-destructive/10">
                    <CardContent className="pt-6">
                        <p className="text-sm font-medium text-destructive">Invalid Bill ID</p>
                        <p className="mt-1 text-sm text-destructive">The bill ID in the URL is invalid.</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (isLoading) {
        return <div className="p-8 text-sm text-muted-foreground">Loading bill details...</div>;
    }

    if (error || !bill) {
        return (
            <div className="space-y-4 p-8">
                <Link href="/billing/bills">
                    <Button variant="ghost">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Bills
                    </Button>
                </Link>
                <p className="text-sm text-destructive">Error loading bill details or bill not found.</p>
            </div>
        );
    }

    const billDate = bill.bill_date ? format(new Date(bill.bill_date), "MMM d, yyyy") : "-";
    const dueDate = bill.due_date ? format(new Date(bill.due_date), "MMM d, yyyy") : "-";
    const statusLabel = bill.status.replace(/_/g, " ");
    const canRecordPayment = !["draft", "pending_approval", "rejected", "paid", "void"].includes(bill.status) && Number.parseFloat(bill.amount_due || "0") > 0;
    const canEditBill = ["draft", "rejected"].includes(bill.status) && Number.parseFloat(bill.amount_paid || "0") === 0;
    const isStandaloneBill = !bill.purchase_order;

    return (
        <div className="space-y-6 p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/billing/bills">
                        <Button variant="ghost" size="icon">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <div>
                        <div className="flex flex-wrap items-center gap-3">
                            <h1 className="text-2xl font-bold tracking-tight">Bill {bill.bill_number}</h1>
                            <Badge className={`capitalize ${statusClassNames[bill.status] || statusClassNames.draft}`}>
                                {statusLabel}
                            </Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Vendor bill from {bill.vendor_name || "Unknown vendor"}
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => downloadPDF({ documentType: "bill", documentId: id, documentNumber: bill.bill_number })}
                        disabled={isDownloading}
                    >
                        <Download className="mr-2 h-4 w-4" />
                        {isDownloading ? "Downloading..." : "PDF"}
                    </Button>
                    {canEditBill && (
                        <Link href={`/billing/bills/${id}/edit`}>
                            <Button variant="outline" size="sm">
                                <Edit className="mr-2 h-4 w-4" />
                                Edit
                            </Button>
                        </Link>
                    )}
                    {isStandaloneBill && ["draft", "rejected"].includes(bill.status) && (
                        <Dialog open={isApprovalDialogOpen} onOpenChange={setIsApprovalDialogOpen}>
                            <DialogTrigger asChild>
                                <Button size="sm" disabled={submitApprovalMutation.isPending}>
                                    Submit Approval
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Select Bill Approver</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-3">
                                    <FormLabel>Approver</FormLabel>
                                    <Select value={selectedApproverId} onValueChange={setSelectedApproverId}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Choose manager or admin" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {approvers.map((approver) => (
                                                <SelectItem key={approver.id} value={approver.id.toString()}>
                                                    {approver.full_name || `${approver.first_name} ${approver.last_name}`.trim() || approver.email} ({approver.role})
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {approvers.length === 0 && (
                                        <p className="text-sm text-muted-foreground">No active manager/admin users found.</p>
                                    )}
                                </div>
                                <DialogFooter>
                                    <Button
                                        type="button"
                                        disabled={!selectedApproverId || submitApprovalMutation.isPending}
                                        onClick={() => submitApprovalMutation.mutate(Number.parseInt(selectedApproverId, 10))}
                                    >
                                        {submitApprovalMutation.isPending ? "Submitting..." : "Submit"}
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    )}
                    {isStandaloneBill && bill.status === "pending_approval" && (
                        <>
                            <Button
                                size="sm"
                                onClick={() => approveMutation.mutate()}
                                disabled={approveMutation.isPending || rejectMutation.isPending}
                            >
                                {approveMutation.isPending ? "Approving..." : "Approve"}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="border-destructive/30 text-destructive hover:bg-destructive/5"
                                onClick={() => {
                                    const reason = prompt("Reason for rejecting this bill:");
                                    rejectMutation.mutate(reason || undefined);
                                }}
                                disabled={approveMutation.isPending || rejectMutation.isPending}
                            >
                                Reject
                            </Button>
                        </>
                    )}
                    {canRecordPayment && (
                        <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
                            <DialogTrigger asChild>
                                <Button size="sm">
                                    <CreditCard className="mr-2 h-4 w-4" />
                                    Record Payment
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Record Vendor Payment</DialogTitle>
                                </DialogHeader>
                                <Form {...paymentForm}>
                                    <form onSubmit={paymentForm.handleSubmit((data) => recordPaymentMutation.mutate(data))} className="space-y-4">
                                        <FormField control={paymentForm.control} name="amount" render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Amount</FormLabel>
                                                <FormControl><Input type="number" min="0.01" step="0.01" max={bill.amount_due} placeholder={bill.amount_due} {...field} /></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )} />
                                        <FormField control={paymentForm.control} name="payment_date" render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Payment Date</FormLabel>
                                                <FormControl><Input type="date" {...field} /></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )} />
                                        <FormField control={paymentForm.control} name="payment_method" render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Payment Method</FormLabel>
                                                <Select onValueChange={field.onChange} value={field.value}>
                                                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                                    <SelectContent>
                                                        <SelectItem value="cash">Cash</SelectItem>
                                                        <SelectItem value="check">Check</SelectItem>
                                                        <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                                                        <SelectItem value="mobile_money">Mobile Money</SelectItem>
                                                        <SelectItem value="credit_card">Credit Card</SelectItem>
                                                        <SelectItem value="other">Other</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )} />
                                        <FormField control={paymentForm.control} name="reference_number" render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Reference</FormLabel>
                                                <FormControl><Input placeholder="Payment reference" {...field} /></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )} />
                                        <FormField control={paymentForm.control} name="notes" render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Notes</FormLabel>
                                                <FormControl><Textarea placeholder="Payment notes..." {...field} /></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )} />
                                        <DialogFooter>
                                            <Button type="submit" disabled={recordPaymentMutation.isPending}>
                                                {recordPaymentMutation.isPending ? "Recording..." : "Record Payment"}
                                            </Button>
                                        </DialogFooter>
                                    </form>
                                </Form>
                            </DialogContent>
                        </Dialog>
                    )}
                    {["draft", "rejected"].includes(bill.status) && Number.parseFloat(bill.amount_paid || "0") === 0 && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="border-destructive/30 text-destructive hover:bg-destructive/5"
                            onClick={() => {
                                if (confirm("Void this bill?")) voidMutation.mutate();
                            }}
                            disabled={voidMutation.isPending}
                        >
                            <XCircle className="mr-2 h-4 w-4" />
                            Void
                        </Button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <Card>
                    <CardContent className="flex items-center justify-between p-4">
                        <div>
                            <p className="text-xs font-semibold uppercase text-muted-foreground">Total</p>
                            <p className="text-xl font-bold">{formatCurrency(Number.parseFloat(bill.total || "0"))}</p>
                        </div>
                        <ReceiptText className="h-5 w-5 text-muted-foreground" />
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="flex items-center justify-between p-4">
                        <div>
                            <p className="text-xs font-semibold uppercase text-muted-foreground">Amount Due</p>
                            <p className="text-xl font-bold">{formatCurrency(Number.parseFloat(bill.amount_due || "0"))}</p>
                        </div>
                        <CreditCard className="h-5 w-5 text-muted-foreground" />
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="flex items-center justify-between p-4">
                        <div>
                            <p className="text-xs font-semibold uppercase text-muted-foreground">Bill Date</p>
                            <p className="text-sm font-medium">{billDate}</p>
                        </div>
                        <Calendar className="h-5 w-5 text-muted-foreground" />
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="flex items-center justify-between p-4">
                        <div>
                            <p className="text-xs font-semibold uppercase text-muted-foreground">Due Date</p>
                            <p className="text-sm font-medium">{dueDate}</p>
                        </div>
                        <Calendar className="h-5 w-5 text-muted-foreground" />
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="lg:col-span-2">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Package className="h-5 w-5 text-muted-foreground" />
                                Bill Line Items
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Description</TableHead>
                                        <TableHead>Category</TableHead>
                                        <TableHead className="text-right">Qty</TableHead>
                                        <TableHead className="text-right">Unit Price</TableHead>
                                        <TableHead className="text-right">Total</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {bill.line_items?.map((item) => (
                                        <TableRow key={item.id || item.description}>
                                            <TableCell className="font-medium">{item.description}</TableCell>
                                            <TableCell>{item.expense_category || "-"}</TableCell>
                                            <TableCell className="text-right">{Number(item.quantity).toLocaleString()}</TableCell>
                                            <TableCell className="text-right">
                                                {formatCurrency(Number.parseFloat(item.unit_price || "0"))}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {formatCurrency(Number.parseFloat(item.total || "0"))}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    <TableRow className="border-t-2">
                                        <TableCell colSpan={4} className="text-right font-semibold">Subtotal</TableCell>
                                        <TableCell className="text-right font-semibold">
                                            {formatCurrency(Number.parseFloat(bill.subtotal || "0"))}
                                        </TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-right font-semibold">Tax</TableCell>
                                        <TableCell className="text-right font-semibold">
                                            {formatCurrency(Number.parseFloat(bill.tax_amount || "0"))}
                                        </TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-right text-lg font-bold">Total</TableCell>
                                        <TableCell className="text-right text-lg font-bold">
                                            {formatCurrency(Number.parseFloat(bill.total || "0"))}
                                        </TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Truck className="h-5 w-5 text-muted-foreground" />
                                Vendor & Procurement
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <p className="text-sm text-muted-foreground">Vendor</p>
                                <p className="font-medium">{bill.vendor_name || "-"}</p>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Vendor Reference</p>
                                <p className="font-medium">{bill.reference_number || "-"}</p>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Assigned Approver</p>
                                <p className="font-medium">{bill.assigned_approver_name || "-"}</p>
                            </div>
                            {bill.rejection_reason && (
                                <div>
                                    <p className="text-sm text-muted-foreground">Rejection Reason</p>
                                    <p className="font-medium text-destructive">{bill.rejection_reason}</p>
                                </div>
                            )}
                            <div>
                                <p className="text-sm text-muted-foreground">Purchase Order</p>
                                {bill.purchase_order ? (
                                    <Link
                                        href={`/inventory/purchase-orders/${bill.purchase_order}`}
                                        className="inline-flex items-center gap-2 font-medium text-primary hover:underline"
                                    >
                                        <FileText className="h-4 w-4" />
                                        {bill.purchase_order_number || `PO #${bill.purchase_order}`}
                                    </Link>
                                ) : (
                                    <p className="font-medium">-</p>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Payment Summary</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Amount Paid</span>
                                <span className="font-medium">{formatCurrency(Number.parseFloat(bill.amount_paid || "0"))}</span>
                            </div>
                            <div className="flex justify-between border-t pt-3 text-sm">
                                <span className="text-muted-foreground">Amount Due</span>
                                <span className="font-semibold">{formatCurrency(Number.parseFloat(bill.amount_due || "0"))}</span>
                            </div>
                            {bill.terms && (
                                <div className="border-t pt-3">
                                    <p className="text-sm text-muted-foreground">Terms</p>
                                    <p className="text-sm font-medium">{bill.terms}</p>
                                </div>
                            )}
                            {bill.notes && (
                                <div className="border-t pt-3">
                                    <p className="text-sm text-muted-foreground">Notes</p>
                                    <p className="text-sm">{bill.notes}</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Payments</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {bill.payments && bill.payments.length > 0 ? (
                                bill.payments.map((payment) => (
                                    <div key={payment.id} className="rounded-md border p-3 text-sm">
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="font-medium">{payment.payment_number}</span>
                                            <span className="font-semibold">{formatCurrency(Number.parseFloat(payment.amount || "0"))}</span>
                                        </div>
                                        <div className="mt-1 flex items-center justify-between gap-3 text-muted-foreground">
                                            <span className="capitalize">{payment.payment_method.replace("_", " ")}</span>
                                            <span>{format(new Date(payment.payment_date), "MMM d, yyyy")}</span>
                                        </div>
                                        {payment.reference_number && (
                                            <p className="mt-1 text-muted-foreground">Ref: {payment.reference_number}</p>
                                        )}
                                    </div>
                                ))
                            ) : (
                                <p className="text-sm text-muted-foreground">No vendor payments recorded.</p>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
