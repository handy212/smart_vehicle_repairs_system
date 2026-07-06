"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { refundApi } from "@/lib/api/till-refund";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/lib/hooks/useToast";
import { AlertCircle, DollarSign } from "lucide-react";

import { useCurrency } from "@/lib/hooks/useCurrency";
import { getUserFacingError } from "@/lib/api/errors";

interface ProcessRefundDialogProps {
    payment: {
        id: number;
        invoice: number | { id: number };
        customer?: number | { id: number };
        amount: string;
        refund_amount?: string;
        payment_number?: string;
    };
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

type ApiError = { response?: { data?: { error?: string } } };

const ProcessRefundDialog: React.FC<ProcessRefundDialogProps> = ({
    payment,
    open,
    onClose,
    onSuccess,
}) => {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { formatCurrency } = useCurrency();
    const [amount, setAmount] = useState<string>(
        (parseFloat(payment.amount) - parseFloat(payment.refund_amount || "0")).toFixed(2)
    );
    const [reason, setReason] = useState("");

    const refundMutation = useMutation({
        mutationFn: (data: { refund_amount: string; refund_reason: string }) => {
            const invoiceId =
                typeof payment.invoice === "number" ? payment.invoice : payment.invoice?.id;
            const customerId =
                typeof payment.customer === "number" ? payment.customer : payment.customer?.id;

            if (!invoiceId || !customerId) {
                throw new Error("Payment is missing the invoice or customer required for a refund.");
            }

            return refundApi.create({
                original_payment: payment.id,
                invoice: invoiceId,
                customer: customerId,
                amount: data.refund_amount,
                reason: data.refund_reason,
                refund_method: "original_method",
            });
        },
        onSuccess: () => {
            toast({
                title: "Refund Requested",
                description: "The refund request was created for approval and completion.",
            });
            queryClient.invalidateQueries({ queryKey: ["payments"] });
            queryClient.invalidateQueries({ queryKey: ["invoice"] });
            onSuccess();
        },

        onError: (error: ApiError) => {
            toast({
                title: "Refund Failed",
                description: getUserFacingError(error, "Error processing refund."),
                variant: "destructive",
            });
        },
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!amount || parseFloat(amount) <= 0) {
            toast({
                title: "Invalid Amount",
                description: "Please enter a valid refund amount.",
                variant: "destructive",
            });
            return;
        }

        if (!reason) {
            toast({
                title: "Reason Required",
                description: "Please provide a reason for the refund.",
                variant: "destructive",
            });
            return;
        }

        refundMutation.mutate({
            refund_amount: amount,
            refund_reason: reason,
        });
    };

    const maxRefund = parseFloat(payment.amount) - parseFloat(payment.refund_amount || "0");

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <DollarSign className="h-5 w-5 text-destructive" />
                        Request Refund
                    </DialogTitle>
                    <DialogDescription>
                        Refund payment for Transaction #{payment.payment_number}.
                        Max available: {formatCurrency(maxRefund)}
                        {" "}Track approval and completion on the{" "}
                        <Link href="/billing/refunds" className="text-primary hover:underline">
                            Refunds
                        </Link>{" "}
                        page.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="refund-amount">Refund Amount ($)</Label>
                        <div className="relative">
                            <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                id="refund-amount"
                                type="number"
                                step="0.01"
                                min="0.01"
                                max={maxRefund}
                                className="pl-9"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="0.00"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="refund-reason">Reason for Refund</Label>
                        <Textarea
                            id="refund-reason"
                            placeholder="E.g., Customer overpaid, service cancelled..."
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            rows={3}
                        />
                    </div>

                    {parseFloat(amount) > maxRefund && (
                        <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg text-sm border border-destructive/10">
                            <AlertCircle className="h-4 w-4" />
                            <span>Refund amount cannot exceed remaining payment balance.</span>
                        </div>
                    )}
                </form>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={handleSubmit}
                        disabled={refundMutation.isPending || parseFloat(amount) > maxRefund || parseFloat(amount) <= 0}
                    >
                        {refundMutation.isPending ? "Requesting..." : "Create Refund Request"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default ProcessRefundDialog;
