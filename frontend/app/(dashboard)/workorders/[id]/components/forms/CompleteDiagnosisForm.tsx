"use client";

import React, { useState } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

interface CompleteDiagnosisFormProps {
    onSubmit: (data: any) => void;
    onCancel: () => void;
    isSubmitting: boolean;
}

export function CompleteDiagnosisForm({
    onSubmit,
    onCancel,
    isSubmitting,
}: CompleteDiagnosisFormProps) {
    const [diagnosisNotes, setDiagnosisNotes] = useState("");
    const [requiresApproval, setRequiresApproval] = useState(true);
    const [estimatedLaborHours, setEstimatedLaborHours] = useState("");
    const [estimatedLaborCost, setEstimatedLaborCost] = useState("");
    const [estimatedPartsCost, setEstimatedPartsCost] = useState("");
    const [validationError, setValidationError] = useState<string | null>(null);

    const handleSubmit = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        setValidationError(null);

        if (requiresApproval) {
            const hasLaborCost = estimatedLaborCost && estimatedLaborCost.trim() !== '' && parseFloat(estimatedLaborCost) > 0;
            const hasPartsCost = estimatedPartsCost && estimatedPartsCost.trim() !== '' && parseFloat(estimatedPartsCost) > 0;

            if (!hasLaborCost && !hasPartsCost) {
                setValidationError("When customer approval is required, you must provide at least one cost estimate (labor cost or parts cost).");
                return;
            }
        }

        const data: any = {
            diagnosis_notes: diagnosisNotes,
            requires_approval: requiresApproval,
        };

        if (estimatedLaborHours && estimatedLaborHours.trim() !== '') {
            data.estimated_labor_hours = parseFloat(estimatedLaborHours);
        }
        if (estimatedLaborCost && estimatedLaborCost.trim() !== '') {
            data.estimated_labor_cost = estimatedLaborCost;
        }
        if (estimatedPartsCost && estimatedPartsCost.trim() !== '') {
            data.estimated_parts_cost = estimatedPartsCost;
        }

        onSubmit(data);
    };

    return (
        <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto px-6 pb-4">
                <div className="space-y-4">
                    {validationError && (
                        <div className="bg-destructive/10 dark:bg-red-900/20 border border-destructive/20 dark:border-red-800 text-destructive dark:text-red-400 px-4 py-3 rounded-lg text-sm">
                            {validationError}
                        </div>
                    )}
                    <div>
                        <Label htmlFor="diagnosis_notes" className="block mb-2 text-foreground">
                            Diagnosis Notes *
                        </Label>
                        <Textarea
                            id="diagnosis_notes"
                            value={diagnosisNotes}
                            onChange={(e) => setDiagnosisNotes(e.target.value)}
                            required
                            rows={4}
                            className="w-full bg-muted border-border text-foreground"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="estimated_labor_hours" className="block mb-2 text-foreground">
                                Estimated Labor Hours
                            </Label>
                            <Input
                                id="estimated_labor_hours"
                                type="number"
                                step="0.1"
                                value={estimatedLaborHours}
                                onChange={(e) => setEstimatedLaborHours(e.target.value)}
                                className="w-full bg-muted border-border text-foreground"
                            />
                        </div>
                        <div>
                            <Label htmlFor="estimated_labor_cost" className="block mb-2 text-foreground">
                                Estimated Labor Cost
                            </Label>
                            <Input
                                id="estimated_labor_cost"
                                type="number"
                                step="0.01"
                                value={estimatedLaborCost}
                                onChange={(e) => setEstimatedLaborCost(e.target.value)}
                                className="w-full bg-muted border-border text-foreground"
                            />
                        </div>
                    </div>
                    <div>
                        <Label htmlFor="estimated_parts_cost" className="block mb-2 text-foreground">
                            Estimated Parts Cost
                        </Label>
                        <Input
                            id="estimated_parts_cost"
                            type="number"
                            step="0.01"
                            value={estimatedPartsCost}
                            onChange={(e) => setEstimatedPartsCost(e.target.value)}
                            className="w-full bg-muted border-border text-foreground"
                        />
                    </div>
                    <div className="flex items-center space-x-3">
                        <Checkbox
                            id="requires_approval"
                            checked={requiresApproval}
                            onCheckedChange={(checked) => setRequiresApproval(checked === true)}
                        />
                        <Label htmlFor="requires_approval" className="cursor-pointer text-foreground">
                            Requires Customer Approval
                        </Label>
                    </div>
                </div>
            </div>
            <DialogFooter className="shrink-0 px-6 pb-6 pt-4 border-t border-border/50">
                <Button type="button" variant="secondary" onClick={onCancel}>
                    Cancel
                </Button>
                <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
                    {isSubmitting ? "Completing..." : "Complete Diagnosis"}
                </Button>
            </DialogFooter>
        </div>
    );
}
