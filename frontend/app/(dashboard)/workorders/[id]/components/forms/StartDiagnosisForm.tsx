"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminApi, type User } from "@/lib/api/admin";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { CheckCircle } from "lucide-react";

interface StartDiagnosisFormProps {
    workOrder?: {
        branch?: number | { id: number };
        primary_technician?: number | { id: number } | null;
        assigned_technicians?: Array<number | { id: number }>;
        priority?: string;
    };
    onSubmit: (data: { primary_technician?: number; assigned_technicians?: number[]; priority?: string }) => void;
    onCancel: () => void;
    isSubmitting: boolean;
}

const getBranchId = (branch: unknown): number | undefined => {
    if (typeof branch === "number") return branch;
    if (branch && typeof branch === "object" && "id" in branch) {
        const id = (branch as { id?: unknown }).id;
        return typeof id === "number" ? id : undefined;
    }
    return undefined;
};

export function StartDiagnosisForm({
    workOrder,
    onSubmit,
    onCancel,
    isSubmitting,
}: StartDiagnosisFormProps) {
    const [primaryTechnician, setPrimaryTechnician] = useState<string>(() => {
        const tech = workOrder?.primary_technician;
        if (!tech || tech === null) return "";
        if (typeof tech === "object" && "id" in tech) return String(tech.id);
        if (typeof tech === "number") return String(tech);
        return "";
    });
    const [assignedTechnicians, setAssignedTechnicians] = useState<string[]>(() => {
        const assigned = workOrder?.assigned_technicians;
        if (!Array.isArray(assigned)) return [];
        return assigned
            .map((tech) => {
                if (typeof tech === "number") return String(tech);
                if (tech && typeof tech === "object" && "id" in tech) return String(tech.id);
                return "";
            })
            .filter(Boolean);
    });
    const [priority, setPriority] = useState(workOrder?.priority || "normal");
    const branchId = getBranchId(workOrder?.branch);

    const { data: technicians } = useQuery({
        queryKey: ["technicians", "diagnosis-assignment", branchId],
        queryFn: () => adminApi.users.technicians(branchId ? { branch: branchId } : undefined),
    });

    const techniciansList = technicians || [];

    const handleSubmit = (e?: React.FormEvent) => {
        if (e) e.preventDefault();

        const assignedIds = assignedTechnicians.map(Number).filter(Number.isFinite);
        const data: { primary_technician?: number; assigned_technicians?: number[]; priority?: string } = {};

        if (primaryTechnician && primaryTechnician !== "") {
            data.primary_technician = Number(primaryTechnician);
        }
        if (assignedIds.length > 0) {
            data.assigned_technicians = assignedIds;
            if (!data.primary_technician) {
                data.primary_technician = assignedIds[0];
            }
        }
        if (priority && priority !== workOrder?.priority) {
            data.priority = priority;
        }

        onSubmit(data);
    };

    const toggleAssignedTechnician = (id: string) => {
        setAssignedTechnicians((current) => {
            if (current.includes(id)) {
                const next = current.filter((value) => value !== id);
                if (primaryTechnician === id) {
                    setPrimaryTechnician(next[0] || "");
                }
                return next;
            }
            if (!primaryTechnician) {
                setPrimaryTechnician(id);
            }
            return [...current, id];
        });
    };

    return (
        <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto px-6 pb-4">
                <div className="space-y-4">
                    <div className="bg-primary/10 border border-primary/20 rounded-lg p-3">
                        <p className="text-sm text-primary">
                            <CheckCircle className="w-4 h-4 inline mr-1.5" />
                            <strong>Assign to Mechanic/Technician:</strong>
                        </p>
                    </div>

                    <div>
                        <Label htmlFor="primary_technician" className="block mb-2 text-foreground">
                            Assign to:
                        </Label>
                        <select
                            id="primary_technician"
                            value={primaryTechnician}
                            onChange={(e) => setPrimaryTechnician(e.target.value)}
                            className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-muted text-foreground"
                        >
                            <option value="">Select Mechanic/Technician</option>
                            {techniciansList.map((tech: User) => (
                                <option key={tech.id} value={String(tech.id)}>
                                    {tech.full_name || `${tech.first_name || ""} ${tech.last_name || ""}`.trim() || `User ${tech.id}`}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <Label className="block mb-2 text-foreground">
                            Assigned mechanic team
                        </Label>
                        <div className="rounded-md border border-border bg-muted p-2">
                            {techniciansList.length === 0 ? (
                                <p className="px-1 py-2 text-sm text-muted-foreground">
                                    No active technicians are available for this work order branch.
                                </p>
                            ) : (
                                <div className="max-h-44 space-y-1 overflow-y-auto">
                                    {techniciansList.map((tech: User) => {
                                        const id = String(tech.id);
                                        return (
                                            <label key={tech.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-background">
                                                <input
                                                    type="checkbox"
                                                    checked={assignedTechnicians.includes(id)}
                                                    onChange={() => toggleAssignedTechnician(id)}
                                                    className="h-4 w-4 rounded border-border"
                                                />
                                                <span>
                                                    {tech.full_name || `${tech.first_name || ""} ${tech.last_name || ""}`.trim() || `User ${tech.id}`}
                                                    {tech.branch_name ? ` - ${tech.branch_name}` : ""}
                                                </span>
                                            </label>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    <div>
                        <Label htmlFor="priority" className="block mb-2 text-foreground">
                            Priority (Optional)
                        </Label>
                        <select
                            id="priority"
                            value={priority}
                            onChange={(e) => setPriority(e.target.value)}
                            className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-muted text-foreground"
                        >
                            <option value="low">Low</option>
                            <option value="normal">Normal</option>
                            <option value="high">High</option>
                            <option value="urgent">Urgent</option>
                        </select>
                    </div>
                </div>
            </div>
            <DialogFooter className="shrink-0 px-6 pb-6 pt-4 border-t border-border/50">
                <Button type="button" variant="secondary" onClick={onCancel}>
                    Cancel
                </Button>
                <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
                    {isSubmitting ? "Starting..." : "Start Diagnosis"}
                </Button>
            </DialogFooter>
        </div>
    );
}
