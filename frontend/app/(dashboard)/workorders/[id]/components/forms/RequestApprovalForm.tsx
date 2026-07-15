"use client";

import React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { diagnosisApi } from "@/lib/api/diagnosis";

interface RequestApprovalFormProps {
    workOrder?: {
        id?: number;
        diagnosis_notes?: string;
        estimated_total?: string | number;
        estimate_summary?: { id?: number; total?: string; estimate_number?: string };
    };
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
    const workOrderId = workOrder?.id;

    const { data: diagnosis, isLoading: diagnosisLoading } = useQuery({
        queryKey: ["diagnosis", "workorder", workOrderId],
        queryFn: () => diagnosisApi.getByWorkOrder(workOrderId!),
        enabled: !!workOrderId,
    });

    const recommendations = diagnosis?.repair_recommendations ?? [];
    const quotedRecommendations = recommendations.filter(
        (rec) => parseFloat(String(rec.estimated_total_cost || "0")) > 0
    );
    const pendingCustomerDecisions = recommendations.filter(
        (rec) =>
            rec.approval_status &&
            ["pending_approval", "deferred"].includes(rec.approval_status) &&
            !rec.converted_to_task_id
    );

    const hasDiagnosisNotes = Boolean((workOrder?.diagnosis_notes || "").trim());
    const hasDiagnosisContent =
        hasDiagnosisNotes ||
        Boolean(diagnosis?.root_cause) ||
        Boolean(diagnosis?.customer_complaint);
    const diagnosisTotal = parseFloat(String(diagnosis?.total_estimated_cost || "0"));
    const estimateSummaryTotal = parseFloat(String(workOrder?.estimate_summary?.total || "0"));
    const workOrderEstimated = parseFloat(String(workOrder?.estimated_total || "0"));
    const estimatedTotal = Math.max(workOrderEstimated, diagnosisTotal, estimateSummaryTotal);
    const hasEstimate = estimatedTotal > 0;
    const hasDiagnosisRecord = Boolean(diagnosis);
    const diagnosisComplete = diagnosis?.status === "completed" || diagnosis?.is_completed;

    const canSubmit =
        hasDiagnosisContent &&
        hasEstimate &&
        hasDiagnosisRecord &&
        pendingCustomerDecisions.length === 0;

    return (
        <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto px-6 pb-4">
                <div className="space-y-4">
                    <div className="bg-primary/10 border border-primary/20 rounded-lg p-3">
                        <p className="text-sm text-primary">
                            <AlertCircle className="w-4 h-4 inline mr-1.5" />
                            Send the customer an approval request. Diagnosis content, a priced estimate, and
                            resolved recommendation decisions are required.
                        </p>
                    </div>

                    {workOrderId && (
                        <Button variant="outline" size="sm" className="w-full" asChild>
                            <Link href={`/workorders/${workOrderId}/diagnosis`}>
                                <ExternalLink className="w-4 h-4 mr-2" />
                                Open diagnosis workspace
                            </Link>
                        </Button>
                    )}

                    <div className="space-y-2 text-sm rounded-md border border-border p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Readiness checklist
                        </p>
                        <ChecklistRow
                            label="Diagnosis record"
                            ok={hasDiagnosisRecord}
                            pending={diagnosisLoading}
                            detail={hasDiagnosisRecord ? (diagnosisComplete ? "Completed" : "In progress") : "Start diagnosis first"}
                        />
                        <ChecklistRow
                            label="Diagnosis notes / findings"
                            ok={hasDiagnosisContent}
                            detail={hasDiagnosisNotes ? "Work order notes set" : diagnosis?.root_cause ? "Root cause captured" : "Add notes or root cause"}
                        />
                        <ChecklistRow
                            label="Recommendations quoted"
                            ok={quotedRecommendations.length > 0 || hasEstimate}
                            detail={`${quotedRecommendations.length} priced · ${recommendations.length} total`}
                        />
                        <ChecklistRow
                            label="Estimated total"
                            ok={hasEstimate}
                            detail={hasEstimate ? formatCurrency(estimatedTotal) : "Add labor/parts totals"}
                        />
                        <ChecklistRow
                            label="Customer decisions"
                            ok={pendingCustomerDecisions.length === 0}
                            detail={
                                pendingCustomerDecisions.length === 0
                                    ? "All recommendations decided"
                                    : `${pendingCustomerDecisions.length} still pending`
                            }
                        />
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
                    disabled={isSubmitting || !canSubmit || diagnosisLoading}
                >
                    {isSubmitting ? "Requesting..." : "Request Approval"}
                </Button>
            </DialogFooter>
        </div>
    );
}

function ChecklistRow({
    label,
    ok,
    detail,
    pending,
}: {
    label: string;
    ok: boolean;
    detail?: string;
    pending?: boolean;
}) {
    return (
        <div className="flex items-start justify-between gap-3">
            <div>
                <span className="text-muted-foreground">{label}</span>
                {detail && <p className="text-xs text-muted-foreground mt-0.5">{detail}</p>}
            </div>
            <span
                className={`font-medium shrink-0 ${
                    pending ? "text-muted-foreground" : ok ? "text-success dark:text-success" : "text-destructive dark:text-destructive"
                }`}
            >
                {pending ? "…" : ok ? "✓ Ready" : "✗ Missing"}
            </span>
        </div>
    );
}
