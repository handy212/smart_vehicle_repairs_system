"use client";

import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { inventoryApi } from "@/lib/api/inventory";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/lib/hooks/useToast";
import { Package } from "lucide-react";

interface RecommendationDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSave: (data: any) => void;
    recommendation?: any;
    isLoading: boolean;
}

export function RecommendationDialog({
    open,
    onOpenChange,
    onSave,
    recommendation,
    isLoading,
}: RecommendationDialogProps) {
    const { toast } = useToast();
    const [formData, setFormData] = useState({
        recommendation_type: "repair" as const,
        description: "",
        priority: "necessary" as const,
        service_package_id: undefined as number | undefined,
        parts_needed: [] as any[],
        estimated_labor_hours: 0,
        estimated_parts_cost: 0,
        estimated_labor_cost: 0,
        estimated_total_cost: 0,
    });

    const { data: servicePackages } = useQuery({
        queryKey: ["service-packages"],
        queryFn: () => inventoryApi.listPackages({ is_active: true }),
        enabled: open, // Only fetch when open
    });

    const handlePackageChange = (packageId: string) => {
        const pkg = servicePackages?.results.find((p) => p.id === parseInt(packageId));
        if (pkg) {
            // Map package parts to parts_needed format
            // Assuming pkg.parts is available and has structure we need
            const partsNeeded = pkg.parts?.map((p: any) => ({
                name: p.part_name || p.part?.name,
                part_id: p.part?.id,
                quantity: p.quantity,
                unit_price: p.unit_price || p.part?.selling_price
            })) || [];

            setFormData(prev => ({
                ...prev,
                service_package_id: pkg.id,
                description: pkg.description || pkg.name,
                parts_needed: partsNeeded,
                estimated_labor_hours: parseFloat(pkg.estimated_labor_hours || "0"),
                estimated_parts_cost: parseFloat(pkg.total_parts_cost || "0"),
                estimated_labor_cost: 0,
                estimated_total_cost: 0,
            }));

            toast({
                title: "Package Selected",
                description: `Selected "${pkg.name}". Parts and estimates auto-populated.`,
            });
        }
    };


    useEffect(() => {
        if (recommendation) {
            // Edit mode - populate form with existing data
            setFormData({
                recommendation_type: recommendation.recommendation_type || "repair",
                description: recommendation.description || "",
                priority: recommendation.priority || "necessary",
                service_package_id: undefined,
                parts_needed: recommendation.parts_needed || [],
                estimated_labor_hours: parseFloat(recommendation.estimated_labor_hours || "0"),
                estimated_parts_cost: parseFloat(recommendation.estimated_parts_cost || "0"),
                estimated_labor_cost: parseFloat(recommendation.estimated_labor_cost || "0"),
                estimated_total_cost: parseFloat(recommendation.estimated_total_cost || "0"),
            });
        } else if (!open) {
            // Reset form when dialog closes (and not editing)
            setFormData({
                recommendation_type: "repair",
                description: "",
                priority: "necessary",
                service_package_id: undefined,
                parts_needed: [],
                estimated_labor_hours: 0,
                estimated_parts_cost: 0,
                estimated_labor_cost: 0,
                estimated_total_cost: 0,
            });
        }
    }, [open, recommendation]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave({
            recommendation_type: formData.recommendation_type,
            description: formData.description.trim(),
            priority: formData.priority,
            parts_needed: formData.parts_needed,
            estimated_labor_hours: formData.estimated_labor_hours,
            estimated_parts_cost: formData.estimated_parts_cost,
            estimated_labor_cost: formData.estimated_labor_cost,
            estimated_total_cost: formData.estimated_total_cost,
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl bg-card gap-0 p-0 border border-border shadow-xl sm:rounded-xl">
                <DialogHeader className="p-6 pb-2">
                    <DialogTitle className="text-xl font-bold text-foreground">
                        {recommendation ? "Edit Recommendation" : "Add Recommendation"}
                    </DialogTitle>
                    <DialogDescription className="text-sm text-gray-500">
                        {recommendation ? "Update the details below." : "Add a new repair recommendation for this vehicle."}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="flex flex-col">
                    <div className="p-6 pt-4 space-y-5">
                        <div className="space-y-2">
                            <Label htmlFor="service_package" className="text-sm font-medium text-card-foreground">
                                Quick Select (Service Package)
                            </Label>
                            <Select
                                value={formData.service_package_id?.toString() || "none"}
                                onValueChange={(val) => handlePackageChange(val)}
                            >
                                <SelectTrigger id="service_package" className="h-9 w-full bg-card border-border">
                                    <SelectValue placeholder="-- Select a Service Package --" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">-- Select a Service Package --</SelectItem>
                                    {servicePackages?.results.map((pkg: any) => (
                                        <SelectItem key={pkg.id} value={pkg.id.toString()}>
                                            {pkg.name} ({pkg.estimated_labor_hours}h)
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid gap-5 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="recommendation_type" className="text-sm font-medium text-card-foreground">
                                    Type <span className="text-red-500">*</span>
                                </Label>
                                <Select
                                    value={formData.recommendation_type}
                                    onValueChange={(val) => setFormData({ ...formData, recommendation_type: val as any })}
                                    required
                                >
                                    <SelectTrigger id="recommendation_type" className="h-9 w-full bg-card border-border">
                                        <SelectValue placeholder="Select type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="repair">Repair</SelectItem>
                                        <SelectItem value="replace">Replace</SelectItem>
                                        <SelectItem value="service">Service</SelectItem>
                                        <SelectItem value="adjust">Adjust</SelectItem>
                                        <SelectItem value="clean">Clean</SelectItem>
                                        <SelectItem value="inspect">Inspect</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="priority" className="text-sm font-medium text-card-foreground">
                                    Priority <span className="text-red-500">*</span>
                                </Label>
                                <Select
                                    value={formData.priority}
                                    onValueChange={(val) => setFormData({ ...formData, priority: val as any })}
                                    required
                                >
                                    <SelectTrigger id="priority" className="h-9 w-full bg-card border-border">
                                        <SelectValue placeholder="Select priority" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="critical">Critical</SelectItem>
                                        <SelectItem value="necessary">Necessary</SelectItem>
                                        <SelectItem value="recommended">Recommended</SelectItem>
                                        <SelectItem value="advisory">Advisory</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="description" className="text-sm font-medium text-card-foreground">
                                Description <span className="text-red-500">*</span>
                            </Label>
                            <Textarea
                                id="description"
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                placeholder="Describe the recommended repair or service..."
                                className="min-h-[120px] resize-none bg-card border-border focus:ring-1 focus:ring-primary"
                                required
                            />
                        </div>

                        <div className="bg-primary/5 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-800 rounded-lg p-3 flex gap-3">
                            <div className="shrink-0 mt-0.5">
                                <Package className="w-5 h-5 text-primary dark:text-primary" />
                            </div>
                            <div>
                                <h4 className="text-sm font-medium text-orange-900 dark:text-orange-100 mb-0.5">Parts & Labor</h4>
                                <p className="text-xs text-orange-700 dark:text-orange-300 leading-relaxed">
                                    {formData.parts_needed.length > 0 ? (
                                        <span className="font-semibold">
                                            Included: {formData.parts_needed.length} parts and {formData.estimated_labor_hours} hours labor.
                                        </span>
                                    ) : (
                                        "Select a service package above to auto-populate parts and labor."
                                    )}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center justify-end gap-3 p-6 pt-2 border-t border-border bg-muted/50 rounded-b-xl">
                        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="hover:bg-gray-200/50">
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isLoading} className="bg-primary hover:bg-primary/90 text-white min-w-[100px]">
                            {isLoading ? "Saving..." : recommendation ? "Update" : "Add Recommendation"}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
