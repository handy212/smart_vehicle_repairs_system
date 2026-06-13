"use client";

import React, { useState } from "react";
import { CheckCircle, HandCoins, Receipt, Wallet } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { useCurrency } from "@/lib/hooks/useCurrency";

interface CloseWorkOrderFormProps {
    onSubmit: (data: any) => void;
    onCancel: () => void;
    isSubmitting: boolean;
    workOrder?: any;
}

export function CloseWorkOrderForm({
    onSubmit,
    onCancel,
    isSubmitting,
    workOrder,
}: CloseWorkOrderFormProps) {
    const { formatCurrency } = useCurrency();
    const invoiceSummary = workOrder?.invoice_summary;
    const invoiceTotal = invoiceSummary?.total ? Number.parseFloat(invoiceSummary.total) || 0 : 0;
    const amountPaid = invoiceSummary?.amount_paid ? Number.parseFloat(invoiceSummary.amount_paid) || 0 : 0;
    const amountDue = invoiceSummary?.amount_due ? Number.parseFloat(invoiceSummary.amount_due) || 0 : 0;
    const hasOutstandingBalance = amountDue > 0.01;
    const [closingNotes, setClosingNotes] = useState("");

    const handleSubmit = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        onSubmit({
            closing_notes: closingNotes,
        });
    };

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 overflow-y-auto px-6 pb-4">
                <div className="space-y-5">
                    <div className="rounded-xl border border-border/70 bg-background/60 p-4">
                        <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success/10 text-success">
                                <CheckCircle className="h-5 w-5" />
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm font-semibold text-foreground">Final handover and closeout</p>
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl border border-border/70 bg-background/60 p-4">
                            <div className="mb-3 flex items-center gap-2">
                                <Receipt className="h-4 w-4 text-primary" />
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    Invoice
                                </p>
                            </div>
                            {invoiceSummary?.invoice_number ? (
                                <div className="space-y-2">
                                    <p className="text-sm font-semibold text-foreground">
                                        {invoiceSummary.invoice_number}
                                    </p>
                                    <div className="space-y-1 text-sm text-muted-foreground">
                                        <div className="flex items-center justify-between gap-3">
                                            <span>Total</span>
                                            <span className="font-medium text-foreground">{formatCurrency(invoiceTotal)}</span>
                                        </div>
                                        <div className="flex items-center justify-between gap-3">
                                            <span>Paid</span>
                                            <span className="font-medium text-foreground">{formatCurrency(amountPaid)}</span>
                                        </div>
                                        <div className="flex items-center justify-between gap-3">
                                            <span>Balance</span>
                                            <span className={`font-semibold ${hasOutstandingBalance ? "text-amber-600 dark:text-amber-300" : "text-success"}`}>
                                                {formatCurrency(amountDue)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">No linked invoice summary found.</p>
                            )}
                        </div>

                        {/* <div className="rounded-xl border border-border/70 bg-background/60 p-4">
                            <div className="mb-3 flex items-center gap-2">
                                <Wallet className="h-4 w-4 text-primary" />
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    Payment status
                                </p>
                            </div>
                            <div className={`rounded-lg border px-3 py-2 text-sm ${
                                hasOutstandingBalance
                                    ? "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                                    : "border-success/20 bg-success/10 text-success"
                            }`}>
                                {hasOutstandingBalance
                                    ? "Payment is still outstanding. You can close the job now and let Accounts continue collection."
                                    : "No outstanding balance on the linked invoice."}
                            </div>
                        </div> */}
                    </div>

                    <div className="rounded-xl border border-border/70 bg-background/60 p-4">
                        <div className="mb-3 flex items-center gap-2">
                            <HandCoins className="h-4 w-4 text-primary" />
                            <Label htmlFor="closing_notes" className="text-sm font-semibold text-foreground">
                                Handover notes
                            </Label>
                            <span className="text-xs text-muted-foreground">Optional</span>
                        </div>
                        
                        <Label htmlFor="closing_notes" className="sr-only">
                            Closing Notes
                        </Label>
                        <Textarea
                            id="closing_notes"
                            value={closingNotes}
                            onChange={(e) => setClosingNotes(e.target.value)}
                            rows={4}
                            placeholder="Vehicle collected by customer, balance to be followed up by Accounts, final remarks..."
                            className="w-full border-border bg-muted/40 text-foreground"
                        />
                    </div>
                </div>
            </div>
            <DialogFooter className="shrink-0 border-t border-border/50 px-6 pb-6 pt-4">
                <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
                    Cancel
                </Button>
                <Button
                    type="button"
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    variant="default"
                    className="min-w-[160px]"
                >
                    {isSubmitting ? "Closing..." : "Confirm & Close"}
                </Button>
            </DialogFooter>
        </div>
    );
}
