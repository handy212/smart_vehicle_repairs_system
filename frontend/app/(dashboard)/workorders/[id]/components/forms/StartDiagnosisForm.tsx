"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api/admin";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { CheckCircle } from "lucide-react";

interface StartDiagnosisFormProps {
    workOrder?: any;
    onSubmit: (data: { primary_technician?: number; priority?: string }) => void;
    onCancel: () => void;
    isSubmitting: boolean;
}

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
    const [priority, setPriority] = useState(workOrder?.priority || "normal");

    const { data: technicians } = useQuery({
        queryKey: ["technicians"],
        queryFn: () => adminApi.users.technicians(),
    });

    const techniciansList = technicians || [];

    const handleSubmit = (e?: React.FormEvent) => {
        if (e) e.preventDefault();

        const data: { primary_technician?: number; priority?: string } = {};

        if (primaryTechnician && primaryTechnician !== "") {
            data.primary_technician = Number(primaryTechnician);
        }
        if (priority && priority !== workOrder?.priority) {
            data.priority = priority;
        }

        onSubmit(data);
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
                            {techniciansList.map((tech: any) => (
                                <option key={tech.id} value={String(tech.id)}>
                                    {tech.full_name || `${tech.first_name || ""} ${tech.last_name || ""}`.trim() || `User ${tech.id}`}
                                </option>
                            ))}
                        </select>
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
