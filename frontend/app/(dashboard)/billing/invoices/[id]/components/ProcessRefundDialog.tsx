"use client";

import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { billingApi } from "@/lib/api/billing";
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

interface ProcessRefundDialogProps {
    payment: any;
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

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
        mutationFn: (data: { refund_amount: string; refund_reason: string }) =>
            billingApi.payments.refund(payment.id, data),
        onSuccess: () => {
            toast({
                title: "Refund Processed",
                description: "The refund has been recorded successfully.",
            });
            queryClient.invalidateQueries({ queryKey: ["payments"] });
            queryClient.invalidateQueries({ queryKey: ["invoice"] });
            onSuccess();
        },
        onError: (error: any) => {
            toast({
                title: "Refund Failed",
                description: error.response?.data?.error || "Error processing refund.",
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
                        <DollarSign className="h-5 w-5 text-red-600" />
                        Process Refund
                    </DialogTitle>
                    <DialogDescription>
                        Refund payment for Transaction #{payment.payment_number}.
                        Max available: {formatCurrency(maxRefund)}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="refund-amount">Refund Amount ($)</Label>
                        <div className="relative">
                            <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
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
                        <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm border border-red-100">
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
                        {refundMutation.isPending ? "Processing..." : "Confirm Refund"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default ProcessRefundDialog;
