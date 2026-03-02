"use client";

import React from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";

interface RequestApprovalFormProps {
    workOrder?: any;
    onSubmit: () => void;
    onCancel: () => void;
    isSubmitting: boolean;
    formatCurrency: (val: number) => string;
}

export function RequestApprovalForm({
    workOrder,
    onSubmit,
    onCancel,
    isSubmitting,
    formatCurrency,
}: RequestApprovalFormProps) {
    const hasDiagnosisNotes = !!workOrder?.diagnosis_notes;
    const estimatedTotal = parseFloat(workOrder?.estimated_total || "0");
    const hasEstimate = estimatedTotal > 0;
    const canSubmit = hasDiagnosisNotes && hasEstimate;

    return (
        <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto px-6 pb-4">
                <div className="space-y-4">
                    <div className="bg-primary/10 border border-primary/20 rounded-lg p-3">
                        <p className="text-sm text-primary">
                            <AlertCircle className="w-4 h-4 inline mr-1.5" />
                            This requires diagnosis notes and an estimated total greater than $0. The work order will move to &quot;Awaiting Approval&quot; status and notify the customer.
                        </p>
                    </div>

                    <div className="space-y-2 text-sm">
                        <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Diagnosis Notes:</span>
                            <span className={`font-medium ${hasDiagnosisNotes ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                                {hasDiagnosisNotes ? "✓ Set" : "✗ Missing"}
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Estimated Total:</span>
                            <span className={`font-medium ${hasEstimate ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                                {hasEstimate ? `✓ ${formatCurrency(estimatedTotal)}` : "✗ $0.00"}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
            <DialogFooter className="shrink-0 px-6 pb-6 pt-4 border-t border-border/50">
                <Button type="button" variant="secondary" onClick={onCancel}>
                    Cancel
                </Button>
                <Button
                    type="button"
                    onClick={onSubmit}
                    disabled={isSubmitting || !canSubmit}
                >
                    {isSubmitting ? "Requesting..." : "Request Approval"}
                </Button>
            </DialogFooter>
        </div>
    );
}
