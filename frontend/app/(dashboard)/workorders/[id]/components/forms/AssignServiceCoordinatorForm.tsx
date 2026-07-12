"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { workordersApi } from "@/lib/api/workorders";
import { adminApi } from "@/lib/api/admin";
import { useToast } from "@/lib/hooks/useToast";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DialogFooter } from "@/components/ui/dialog";
import { Sparkles } from "lucide-react";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { LIST_SERVICE_COORDINATORS_PERMISSIONS } from "@/lib/utils/permissions";

interface AssignServiceCoordinatorFormProps {
    workOrder?: any;
    onSubmit: (data: { serviceCoordinatorId: number; initialObservations?: string }) => void;
    onCancel: () => void;
    isSubmitting: boolean;
}

export function AssignServiceCoordinatorForm({
    workOrder,
    onSubmit,
    onCancel,
    isSubmitting,
}: AssignServiceCoordinatorFormProps) {
    const [serviceCoordinatorId, setServiceCoordinatorId] = useState<string>("");
    const [initialObservations, setInitialObservations] = useState<string>("");
    const [isGeneratingAI, setIsGeneratingAI] = useState(false);
    const { toast } = useToast();
    const { hasAnyPermission } = usePermissions();

    const branchId =
        typeof workOrder?.branch === "object" && workOrder?.branch
            ? workOrder.branch.id
            : typeof workOrder?.branch === "number"
              ? workOrder.branch
              : undefined;

    const handleGenerateAI = async () => {
        if (!workOrder?.id) return;

        setIsGeneratingAI(true);
        try {
            const data = await workordersApi.suggestObservations(workOrder.id);
            setInitialObservations(data.observations);
            toast({
                title: "AI Generated",
                description: "Initial observations have been drafted based on customer concerns.",
                variant: "success",
            });
        } catch (error) {
            console.error("Failed to generate AI observations:", error);
            toast({
                title: "AI Generation Failed",
                description: "Could not generate observations automatically.",
                variant: "destructive",
            });
        } finally {
            setIsGeneratingAI(false);
        }
    };

    const { data: serviceCoordinators } = useQuery({
        queryKey: ["service-coordinators", branchId],
        queryFn: () => adminApi.users.serviceCoordinators(branchId ? { branch: branchId } : undefined),
        enabled: hasAnyPermission([...LIST_SERVICE_COORDINATORS_PERMISSIONS]),
    });

    const serviceCoordinatorsList = serviceCoordinators || [];

    const handleSubmit = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!serviceCoordinatorId) return;
        onSubmit({
            serviceCoordinatorId: Number(serviceCoordinatorId),
            initialObservations: initialObservations.trim() || undefined,
        });
    };

    return (
        <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto px-6 pb-4">
                <div className="space-y-4">
                    <div>
                        <Label htmlFor="service_coordinator" className="block mb-2 text-foreground">
                            Service Coordinator <span className="text-destructive">*</span>
                        </Label>
                        <select
                            id="service_coordinator"
                            value={serviceCoordinatorId}
                            onChange={(e) => setServiceCoordinatorId(e.target.value)}
                            required
                            className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-muted text-foreground"
                        >
                            <option value="">Select Service Coordinator</option>
                            {serviceCoordinatorsList.map((coord: any) => (
                                <option key={coord.id} value={String(coord.id)}>
                                    {coord.full_name || `${coord.first_name || ""} ${coord.last_name || ""}`.trim() || `User ${coord.id}`}
                                    {coord.branch_name ? ` — ${coord.branch_name}` : ""}
                                </option>
                            ))}
                        </select>
                        {serviceCoordinatorsList.length === 0 && (
                            <p className="text-xs text-muted-foreground mt-1">
                                {branchId
                                    ? "No service coordinators available for this work order branch."
                                    : "No service coordinators available. Please ensure there are users with the Service Coordinator role."}
                            </p>
                        )}
                        {branchId ? (
                            <p className="text-xs text-muted-foreground mt-1">
                                Only coordinators for this work order&apos;s branch are listed.
                            </p>
                        ) : null}
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <Label htmlFor="initial_observations" className="text-foreground">
                                Initial Observations (Optional)
                            </Label>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleGenerateAI}
                                disabled={isGeneratingAI}
                                className="h-7 text-[11px] gap-1.5 px-2.5 border-primary/30 hover:border-primary/50 hover:bg-primary/5 font-medium transition-all"
                            >
                                <Sparkles className={`w-3.5 h-3.5 ${isGeneratingAI ? "animate-pulse" : ""} text-primary`} />
                                {isGeneratingAI ? "Generating..." : "Generate with AI"}
                            </Button>
                        </div>
                        <Textarea
                            id="initial_observations"
                            value={initialObservations}
                            onChange={(e) => setInitialObservations(e.target.value)}
                            placeholder="Quick notes or initial observations before detailed testing..."
                            rows={4}
                            className="w-full bg-muted border-border text-foreground focus-visible:ring-primary/30"
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
                    onClick={handleSubmit}
                    disabled={isSubmitting || !serviceCoordinatorId || serviceCoordinatorsList.length === 0}
                >
                    {isSubmitting ? "Assigning..." : "Assign & Continue"}
                </Button>
            </DialogFooter>
        </div>
    );
}
