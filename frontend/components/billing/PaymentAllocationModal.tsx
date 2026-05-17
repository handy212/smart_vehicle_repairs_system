"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { billingApi, PaymentAllocation, AllocationInput } from "@/lib/api/billing";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/lib/hooks/useToast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Badge } from "@/components/ui/badge";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { AlertCircle, CheckCircle, DollarSign } from "lucide-react";

import { useCurrency } from "@/lib/hooks/useCurrency";
interface PaymentAllocationModalProps {
    paymentId: number;
    paymentAmount: string;
    customerId: number;
    open: boolean;
    onClose: () => void;
}

export function PaymentAllocationModal({
    paymentId,
    paymentAmount,
    customerId,
    open,
    onClose,
}: PaymentAllocationModalProps) {
    const { formatCurrency } = useCurrency();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [allocations, setAllocations] = useState<Record<number, string>>({});

    // Get payment's current allocations
    const { data: existingAllocations } = useQuery({
        queryKey: ["payment-allocations", paymentId],
        queryFn: () => billingApi.payments.allocations(paymentId),
        enabled: open && !!paymentId,
    });

    // Get unallocated amount
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { data: unallocatedData } = useQuery({
        queryKey: ["payment-unallocated", paymentId],
        queryFn: () => billingApi.payments.unallocatedAmount(paymentId),
        enabled: open && !!paymentId,
    });

    // Get customer's outstanding invoices
    const { data: invoicesData, isLoading: loadingInvoices } = useQuery({
        queryKey: ["invoices", customerId],
        queryFn: () => billingApi.invoices.list({
            customer: customerId,
            // Fetch all invoices for customer, we filter by balance > 0 below
            ordering: "-invoice_date"
        }),
        enabled: open && !!customerId,
    });

    const outstandingInvoices = invoicesData?.results?.filter(
        (inv) => parseFloat(inv.balance_due || inv.total || "0") > 0
    ) || [];

    // Initialize allocations from existing data
    useEffect(() => {
        if (existingAllocations && existingAllocations.length > 0) {
            const initialAllocations: Record<number, string> = {};
            existingAllocations.forEach((alloc) => {
                initialAllocations[alloc.invoice] = alloc.amount;
            });
            setAllocations(initialAllocations);
        }
    }, [existingAllocations]);

    const allocatePaymentMutation = useMutation({
        mutationFn: (data: { payment_id: number; allocations: AllocationInput[] }) =>
            billingApi.paymentAllocations.allocatePayment(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["payment-allocations"] });
            queryClient.invalidateQueries({ queryKey: ["payment-unallocated"] });
            queryClient.invalidateQueries({ queryKey: ["invoices"] });
            queryClient.invalidateQueries({ queryKey: ["payments"] });
            toast({
                title: "Success",
                description: "Payment allocated successfully",
            });
            onClose();
        },

        onError: (error: any) => {
            toast({
                title: "Error",
                description: error.response?.data?.error || "Failed to allocate payment",
                variant: "destructive",
            });
        },
    });

    const autoAllocateMutation = useMutation({
        mutationFn: (paymentId: number) =>
            billingApi.paymentAllocations.autoAllocate(paymentId),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["payment-allocations"] });
            queryClient.invalidateQueries({ queryKey: ["payment-unallocated"] });
            queryClient.invalidateQueries({ queryKey: ["invoices"] });
            queryClient.invalidateQueries({ queryKey: ["payments"] });

            const unallocated = parseFloat(data.unallocated_amount);
            toast({
                title: "Auto-Allocation Complete",
                description: unallocated > 0
                    ? `Payment allocated to oldest invoices. ${formatCurrency(unallocated)} remains unallocated.`
                    : "Payment fully allocated to invoices.",
            });
            onClose();
        },

        onError: (error: any) => {
            toast({
                title: "Auto-Allocation Failed",
                description: error.response?.data?.error || "Failed to auto-allocate payment",
                variant: "destructive",
            });
        },
    });

    const handleAllocationChange = (invoiceId: number, value: string) => {
        setAllocations((prev) => ({
            ...prev,
            [invoiceId]: value,
        }));
    };

    const handleAllocateAll = (invoiceId: number, maxAmount: string) => {
        const remaining = getRemainingAmount();
        const invoiceBalance = parseFloat(maxAmount);
        const amountToAllocate = Math.min(remaining, invoiceBalance).toFixed(2);

        handleAllocationChange(invoiceId, amountToAllocate);
    };

    const getTotalAllocated = (): number => {
        return Object.values(allocations).reduce(
            (sum, amount) => sum + (parseFloat(amount) || 0),
            0
        );
    };

    const getRemainingAmount = (): number => {
        const payment = parseFloat(paymentAmount);
        const allocated = getTotalAllocated();
        return Math.max(0, payment - allocated);
    };

    const handleSubmit = () => {
        const allocationInputs: AllocationInput[] = Object.entries(allocations)
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            .filter(([_, amount]) => parseFloat(amount || "0") > 0)
            .map(([invoiceId, amount]) => ({
                invoice_id: parseInt(invoiceId),
                amount: amount,
            }));

        if (allocationInputs.length === 0) {
            toast({
                title: "No allocations",
                description: "Please allocate amounts to at least one invoice",
                variant: "destructive",
            });
            return;
        }

        const totalAllocated = getTotalAllocated();
        const payment = parseFloat(paymentAmount);

        if (totalAllocated > payment) {
            toast({
                title: "Invalid allocation",
                description: `Total allocation (${formatCurrency(totalAllocated)}) exceeds payment amount (${formatCurrency(payment)})`,
                variant: "destructive",
            });
            return;
        }

        // Warn if partial allocation (not fully allocated)
        const remaining = getRemainingAmount();
        if (remaining > 0.01) {
            const confirmed = window.confirm(
                `Warning: This payment has ${formatCurrency(remaining)} remaining unallocated.\n\n` +
                `Do you want to proceed with partial allocation?\n\n` +
                `You can allocate the remaining balance later.`
            );

            if (!confirmed) {
                return;
            }
        }

        allocatePaymentMutation.mutate({
            payment_id: paymentId,
            allocations: allocationInputs,
        });
    };

    const totalAllocated = getTotalAllocated();
    const remainingAmount = getRemainingAmount();
    const paymentAmountNum = parseFloat(paymentAmount);
    const isOverAllocated = totalAllocated > paymentAmountNum;

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Allocate Payment</DialogTitle>
                    <DialogDescription>
                        Distribute this payment across multiple invoices for this customer.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6">
                    {/* Payment Summary */}
                    <div className="grid grid-cols-1 gap-4 p-4 bg-muted rounded-lg sm:grid-cols-3">
                        <div>
                            <Label className="text-xs text-muted-foreground">Payment Amount</Label>
                            <div className="text-lg font-bold text-foreground">
                                {formatCurrency(paymentAmountNum)}
                            </div>
                        </div>
                        <div>
                            <Label className="text-xs text-muted-foreground">Allocated</Label>
                            <div className={`text-lg font-bold ${isOverAllocated ? 'text-destructive' : 'text-success'}`}>
                                {formatCurrency(totalAllocated)}
                            </div>
                        </div>
                        <div>
                            <Label className="text-xs text-muted-foreground">Remaining</Label>
                            <div className={`text-lg font-bold ${remainingAmount < 0 ? 'text-destructive' : 'text-primary'}`}>
                                {formatCurrency(remainingAmount)}
                            </div>
                        </div>
                    </div>

                    {/* Validation Message */}
                    {isOverAllocated && (
                        <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                            <AlertCircle className="w-4 h-4 text-destructive" />
                            <span className="text-sm text-destructive">
                                Total allocation exceeds payment amount
                            </span>
                        </div>
                    )}

                    {/* Outstanding Invoices */}
                    <div>
                        <Label className="text-sm font-semibold mb-2 block">
                            Customer's Outstanding Invoices
                        </Label>

                        {loadingInvoices ? (
                            <div className="text-center py-8 text-muted-foreground">Loading invoices...</div>
                        ) : outstandingInvoices.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                No outstanding invoices for this customer
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Invoice #</TableHead>
                                        <TableHead>Date</TableHead>
                                        <TableHead className="text-right">Total</TableHead>
                                        <TableHead className="text-right">Balance Due</TableHead>
                                        <TableHead className="text-right">Allocate Amount</TableHead>
                                        <TableHead></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {outstandingInvoices.map((invoice) => {
                                        const balanceDue = parseFloat(invoice.balance_due || invoice.total || "0");
                                        const currentAllocation = parseFloat(allocations[invoice.id] || "0");
                                        const isInvalid = currentAllocation > balanceDue;

                                        return (
                                            <TableRow key={invoice.id}>
                                                <TableCell className="font-mono text-sm">
                                                    {invoice.invoice_number}
                                                </TableCell>
                                                <TableCell className="text-sm">
                                                    {new Date(invoice.invoice_date).toLocaleDateString()}
                                                </TableCell>
                                                <TableCell className="text-right font-medium">
                                                    {formatCurrency(parseFloat(invoice.total))}
                                                </TableCell>
                                                <TableCell className="text-right font-bold text-destructive">
                                                    {formatCurrency(balanceDue)}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        min="0"
                                                        max={balanceDue}
                                                        value={allocations[invoice.id] || ""}
                                                        onChange={(e) => handleAllocationChange(invoice.id, e.target.value)}
                                                        className={`w-32 text-right ${isInvalid ? 'border-destructive' : ''}`}
                                                        placeholder="0.00"
                                                    />
                                                    {isInvalid && (
                                                        <p className="text-xs text-destructive mt-1">
                                                            Exceeds balance
                                                        </p>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleAllocateAll(invoice.id, invoice.balance_due || invoice.total)}
                                                        disabled={remainingAmount <= 0}
                                                    >
                                                        Max
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex justify-between items-center gap-3 pt-4 border-t">
                        <Button
                            variant="outline"
                            onClick={() => autoAllocateMutation.mutate(paymentId)}
                            disabled={autoAllocateMutation.isPending || outstandingInvoices.length === 0}
                            className="text-primary hover:text-orange-700 border-orange-200 hover:bg-primary/10"
                        >
                            {autoAllocateMutation.isPending ? "Auto-Allocating..." : "⚡ Auto-Allocate"}
                        </Button>

                        <div className="flex gap-3">
                            <Button variant="outline" onClick={onClose}>
                                Cancel
                            </Button>
                            <Button
                                onClick={handleSubmit}
                                disabled={
                                    allocatePaymentMutation.isPending ||
                                    totalAllocated === 0 ||
                                    isOverAllocated
                                }
                            >
                                {allocatePaymentMutation.isPending ? "Allocating..." : "Allocate Payment"}
                            </Button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
