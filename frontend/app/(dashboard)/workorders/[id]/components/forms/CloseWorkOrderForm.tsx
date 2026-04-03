"use client";

import React, { useState } from "react";
import { CheckCircle } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

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
}: CloseWorkOrderFormProps) {
    const [paymentReceived, setPaymentReceived] = useState(true);
    const [closingNotes, setClosingNotes] = useState("");

    const handleSubmit = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        onSubmit({
            payment_received: paymentReceived,
            closing_notes: closingNotes,
        });
    };

    return (
        <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto px-6 pb-4">
                <div className="space-y-4">
                    <div className="bg-success/10 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
                        <p className="text-sm text-green-800 dark:text-green-400">
                            <CheckCircle className="w-4 h-4 inline mr-1.5" />
                            This will mark the work order as closed. Make sure the vehicle has been handed over to the customer.
                        </p>
                    </div>

                    <div className="flex items-center space-x-3">
                        <Checkbox
                            id="payment_received"
                            checked={paymentReceived}
                            onCheckedChange={(checked) => setPaymentReceived(checked === true)}
                        />
                        <Label htmlFor="payment_received" className="cursor-pointer text-foreground">
                            Payment received
                        </Label>
                    </div>

                    <div>
                        <Label htmlFor="closing_notes" className="block mb-2 text-foreground">
                            Closing Notes <span className="text-muted-foreground">(Optional)</span>
                        </Label>
                        <Textarea
                            id="closing_notes"
                            value={closingNotes}
                            onChange={(e) => setClosingNotes(e.target.value)}
                            rows={4}
                            placeholder="Add any notes about the handover, customer feedback, or final observations..."
                            className="w-full bg-muted border-border text-foreground"
                        />
                    </div>
                </div>
            </div>
            <DialogFooter className="shrink-0 px-6 pb-6 pt-4 border-t border-border/50">
                <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
                    Cancel
                </Button>
                <Button type="button" onClick={handleSubmit} disabled={isSubmitting} variant="default">
                    {isSubmitting ? "Closing..." : "Close Work Order"}
                </Button>
            </DialogFooter>
        </div>
    );
}
