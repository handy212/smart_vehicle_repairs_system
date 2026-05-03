"use client";

import React from "react";
import { ListChecks, CheckCircle2, Wrench, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { QualityChecklist, QualityCheckWorkOrder } from "./QualityCheckForm";

interface ChecklistProps {
    checklist: QualityChecklist;
    handleChecklistChange: (key: keyof QualityChecklist) => void;
    workOrder?: QualityCheckWorkOrder;
    allChecksPassed: boolean;
}

export function Checklist({
    checklist,
    handleChecklistChange,
    workOrder,
    allChecksPassed,
}: ChecklistProps) {
    const doneCount = Object.values(checklist).filter((v) => v).length;
    const totalCount = Object.values(checklist).length;

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                    <ListChecks className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">Verification Checklist</h3>
                </div>
                {allChecksPassed ? (
                    <Badge variant="success" className="h-5 gap-1 px-1.5 py-0 text-[10px]">
                        <CheckCircle2 className="w-3 h-3" />
                        Verified
                    </Badge>
                ) : (
                    <Badge variant="outline" className="h-5 text-[10px] text-muted-foreground">
                        {doneCount}/{totalCount} Done
                    </Badge>
                )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-border bg-background">
                    <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                        <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-[10px] font-semibold uppercase text-muted-foreground">Execution</span>
                    </div>
                    <div className="divide-y divide-border">
                        <CheckItem
                            id="allTasksCompleted"
                            checked={checklist.allTasksCompleted}
                            label="Technical Tasks"
                            helper="All assigned work completed"
                            onChange={() => handleChecklistChange("allTasksCompleted")}
                        />
                        <CheckItem
                            id="allPartsInstalled"
                            checked={checklist.allPartsInstalled}
                            label="Parts Verification"
                            helper="All parts installed or returned"
                            onChange={() => handleChecklistChange("allPartsInstalled")}
                        />
                        <CheckItem
                            id="testDrivePassed"
                            checked={checklist.testDrivePassed}
                            label="Test Drive"
                            helper="Operational check passed"
                            onChange={() => handleChecklistChange("testDrivePassed")}
                        />
                    </div>
                </div>

                <div className="rounded-md border border-border bg-background">
                    <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                        <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-[10px] font-semibold uppercase text-muted-foreground">Quality & Care</span>
                    </div>
                    <div className="divide-y divide-border">
                        <CheckItem
                            id="afterRepairsInspection"
                            checked={checklist.afterRepairsInspection}
                            label="Post-Repair Inspection"
                            helper="Final inspection confirmed"
                            onChange={() => handleChecklistChange("afterRepairsInspection")}
                        />
                        <CheckItem
                            id="noDamage"
                            checked={checklist.noDamage}
                            label="Condition Integrity"
                            helper="No new damage found"
                            onChange={() => handleChecklistChange("noDamage")}
                        />
                        <CheckItem
                            id="vehicleClean"
                            checked={checklist.vehicleClean}
                            label="Cleanliness"
                            helper="Ready for delivery"
                            onChange={() => handleChecklistChange("vehicleClean")}
                        />
                        <CheckItem
                            id="customerSatisfied"
                            checked={checklist.customerSatisfied}
                            label="Internal QC Approved"
                            helper="Workshop standards met"
                            onChange={() => handleChecklistChange("customerSatisfied")}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

function CheckItem({
    id,
    checked,
    label,
    helper,
    onChange,
}: {
    id: string;
    checked: boolean;
    label: string;
    helper: string;
    onChange: () => void;
}) {
    return (
        <label htmlFor={id} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40">
            <Checkbox
                id={id}
                checked={checked}
                onCheckedChange={onChange}
                className="shrink-0"
            />
            <span className="min-w-0">
                <span className="block text-sm font-medium leading-tight text-foreground">{label}</span>
                <span className="block text-xs leading-tight text-muted-foreground">{helper}</span>
            </span>
        </label>
    );
}
