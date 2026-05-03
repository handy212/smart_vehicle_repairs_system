"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { workordersApi, type WorkOrder } from "@/lib/api/workorders";
import { inspectionsApi, type VehicleInspection } from "@/lib/api/inspections";
import { useToast } from "@/lib/hooks/useToast";
import { DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";

// Sub-components
import { MileageRecording } from "./MileageRecording";
import { Checklist } from "./Checklist";
import { NotesSection } from "./NotesSection";
import { SignatureSection } from "./SignatureSection";

interface QualityCheckFormProps {
    onSubmit: (data: QualityCheckPayload) => void;
    onCancel: () => void;
    isSubmitting: boolean;
    workOrderId?: number;
}

type QualityCheckPayload = {
    passed: boolean;
    notes: string;
    checklist: QualityChecklist;
    signature: string | null;
    odometer_out?: number;
};

export type QualityChecklist = {
    allTasksCompleted: boolean;
    allPartsInstalled: boolean;
    vehicleClean: boolean;
    noDamage: boolean;
    testDrivePassed: boolean;
    customerSatisfied: boolean;
    afterRepairsInspection: boolean;
};

export type QualityCheckWorkOrder = WorkOrder & {
    tasks?: Array<{ status: string }>;
    parts?: Array<{ status: string }>;
};

export function QualityCheckForm({
    onSubmit,
    onCancel,
    isSubmitting,
    workOrderId,
}: QualityCheckFormProps) {
    const { toast } = useToast();
    const [passed, setPassed] = useState(true);
    const [notes, setNotes] = useState("");
    const [checklist, setChecklist] = useState<QualityChecklist>({
        allTasksCompleted: false,
        allPartsInstalled: false,
        vehicleClean: false,
        noDamage: false,
        testDrivePassed: false,
        customerSatisfied: false,
        afterRepairsInspection: false,
    });
    const [signature, setSignature] = useState<string | null>(null);
    const [odometerOut, setOdometerOut] = useState<number | "">("");
    const [isAiLoading, setIsAiLoading] = useState(false);

    // Fetch work order data to verify tasks and parts
    const { data: workOrder } = useQuery<QualityCheckWorkOrder>({
        queryKey: ["workorder", workOrderId],
        queryFn: async () => workordersApi.get(workOrderId!) as Promise<QualityCheckWorkOrder>,
        enabled: !!workOrderId,
    });

    // Fetch initial inspection for comparison
    const { data: initialInspection } = useQuery<VehicleInspection | null>({
        queryKey: ["initial-inspection", workOrderId],
        queryFn: async () => {
            const response = await inspectionsApi.list({
                work_order: workOrderId,
                ordering: 'created_at'
            });
            return response.results[0] || null;
        },
        enabled: !!workOrderId,
    });

    // Auto-check items based on actual data
    React.useEffect(() => {
        if (workOrder) {
            const tasks = workOrder.tasks || [];
            const allTasksDone = tasks.length > 0 && tasks.every((t) =>
                t.status === 'completed' || t.status === 'skipped'
            );

            const parts = workOrder.parts || [];
            const allPartsInstalled = parts.length === 0 || parts.every((p) =>
                p.status === 'installed' || p.status === 'returned'
            );

            setChecklist(prev => ({
                ...prev,
                allTasksCompleted: allTasksDone,
                allPartsInstalled: allPartsInstalled,
            }));

            // Pre-fill odometer out with the most relevant current value
            const intakeMileage = initialInspection?.odometer_reading || workOrder.odometer_in || 0;
            const currentValue = workOrder.odometer_out || intakeMileage;

            setOdometerOut(Math.max(Number(currentValue), Number(intakeMileage)));
        }
    }, [workOrder, initialInspection]);

    const handleChecklistChange = (key: keyof QualityChecklist) => {
        setChecklist(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const allChecksPassed = Object.values(checklist).every(v => v === true);

    const handleSubmit = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const finalPassed = allChecksPassed && passed;

        onSubmit({
            passed: finalPassed,
            notes,
            checklist: checklist,
            signature: signature,
            odometer_out: odometerOut !== "" ? Number(odometerOut) : undefined,
        });
    };

    const handleSuggestNotes = async () => {
        if (!workOrderId) return;
        setIsAiLoading(true);
        try {
            const response = await workordersApi.suggestQCNotes(workOrderId);
            setNotes(response.notes);
            toast({
                title: "AI Suggestion Generated",
                description: "Review and edit the suggested quality check notes below.",
            });
        } catch (error) {
            toast({
                title: "AI Suggestion Failed",
                description: "Could not generate suggested notes. Please try again or write manually.",
                variant: "destructive",
            });
        } finally {
            setIsAiLoading(false);
        }
    };

    return (
        <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto px-4 py-3">
                <div className="space-y-3">
                    <Checklist
                        checklist={checklist}
                        handleChecklistChange={handleChecklistChange}
                        workOrder={workOrder}
                        allChecksPassed={allChecksPassed}
                    />

                    <div className="grid gap-3 lg:grid-cols-[220px_1fr]">
                        <MileageRecording
                            initialInspection={initialInspection}
                            workOrder={workOrder}
                            odometerOut={odometerOut}
                            setOdometerOut={setOdometerOut}
                        />

                        <NotesSection
                            passed={passed}
                            setPassed={setPassed}
                            notes={notes}
                            setNotes={setNotes}
                            isAiLoading={isAiLoading}
                            handleSuggestNotes={handleSuggestNotes}
                            workOrderId={workOrderId}
                        />
                    </div>

                    <SignatureSection
                        signature={signature}
                        setSignature={setSignature}
                    />
                </div>
            </div>

            <DialogFooter className="shrink-0 border-t border-border px-4 py-3">
                <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
                    Cancel
                </Button>
                <Button
                    type="button"
                    onClick={handleSubmit}
                    disabled={isSubmitting || !allChecksPassed || !signature}
                    className={passed ? "font-medium" : "bg-destructive font-medium hover:bg-destructive/90"}
                >
                    {isSubmitting ? (
                        "Processing..."
                    ) : passed ? (
                        <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4" />
                            Completed & Verified
                        </div>
                    ) : (
                        "Flag for Rework"
                    )}
                </Button>
            </DialogFooter>
        </div>
    );
}
