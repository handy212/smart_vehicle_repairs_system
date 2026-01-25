"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useToast } from "@/lib/hooks/useToast";
import { inventoryApi } from "@/lib/api/inventory";

interface InlineInventoryFormProps {
    partName: string;
    partNumber: string;
    description?: string;
    onSubmit: (data: InventoryFormData) => void;
    onCancel: () => void;
    isSubmitting: boolean;
}

export interface InventoryFormData {
    part_name: string;
    part_number: string;
    description: string;
    cost_price: string;
    selling_price?: string;
    supplier_id: number;
    minimum_stock_level?: number;
}

export function InlineInventoryForm({
    partName,
    partNumber,
    description = "",
    onSubmit,
    onCancel,
    isSubmitting,
}: InlineInventoryFormProps) {
    const { toast } = useToast();
    const [formData, setFormData] = useState<InventoryFormData>({
        part_name: partName,
        part_number: partNumber,
        description: description,
        cost_price: "",
        selling_price: "",
        supplier_id: 0,
        minimum_stock_level: 1,
    });

    // Fetch suppliers for dropdown
    const { data: suppliersData, isLoading: loadingSuppliers } = useQuery({
        queryKey: ["suppliers"],
        queryFn: async () => {
            return await inventoryApi.listSuppliers();
        },
    });

    const suppliers = Array.isArray(suppliersData)
        ? suppliersData
        : (suppliersData as any)?.results || [];

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.supplier_id || formData.supplier_id === 0) {
            toast({ title: "Validation Error", description: "Please select a supplier", variant: "destructive" });
            return;
        }
        onSubmit(formData);
    };

    return (
        <Card className="p-4 border-amber-200 bg-amber-50/30 dark:bg-amber-900/10">
            <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                    <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                        Create Inventory Item
                    </h4>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={onCancel}
                    disabled={isSubmitting}
                >
                    <X className="w-4 h-4" />
                </Button>
            </div>

            <p className="text-xs text-amber-800 dark:text-amber-200 mb-4">
                This part doesn't exist in inventory. Create it now to proceed with the PO.
            </p>

            <form onSubmit={handleSubmit} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                        <Label htmlFor="part_name" className="text-xs">
                            Part Name <span className="text-red-500">*</span>
                        </Label>
                        <Input
                            id="part_name"
                            value={formData.part_name}
                            onChange={(e) =>
                                setFormData({ ...formData, part_name: e.target.value })
                            }
                            className="h-8 text-sm"
                            required
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="part_number" className="text-xs">
                            Part Number <span className="text-red-500">*</span>
                        </Label>
                        <Input
                            id="part_number"
                            value={formData.part_number}
                            onChange={(e) =>
                                setFormData({ ...formData, part_number: e.target.value })
                            }
                            className="h-8 text-sm"
                            required
                        />
                    </div>
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="cost_price" className="text-xs">
                        Cost Price <span className="text-red-500">*</span>
                    </Label>
                    <Input
                        id="cost_price"
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.cost_price}
                        onChange={(e) =>
                            setFormData({ ...formData, cost_price: e.target.value })
                        }
                        className="h-8 text-sm"
                        placeholder="0.00"
                        required
                    />
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="supplier" className="text-xs">
                        Supplier <span className="text-red-500">*</span>
                    </Label>
                    <Select
                        value={formData.supplier_id > 0 ? formData.supplier_id.toString() : ""}
                        onValueChange={(val) => {
                            setFormData({ ...formData, supplier_id: parseInt(val) || 0 });
                        }}
                    >
                        <SelectTrigger id="supplier" className="w-full">
                            <SelectValue placeholder="Select Supplier" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="0">Select supplier...</SelectItem>
                            {suppliers.map((s: any) => (
                                <SelectItem key={s.id} value={s.id.toString()}>
                                    {s.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={onCancel}
                        disabled={isSubmitting}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        size="sm"
                        className="bg-amber-600 hover:bg-amber-700"
                        disabled={isSubmitting || !formData.supplier_id}
                    >
                        {isSubmitting ? "Creating..." : "Create & Order"}
                    </Button>
                </div>
            </form >
        </Card >
    );
}
