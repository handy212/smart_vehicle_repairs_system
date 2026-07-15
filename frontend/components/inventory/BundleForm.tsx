"use client";

import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { inventoryApi, ServiceBundle, Part } from "@/lib/api/inventory";
import { vehiclesApi } from "@/lib/api/vehicles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Trash2, Plus, Search, Box } from "lucide-react";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { cn } from "@/lib/utils/cn";
import { Label } from "@/components/ui/label";
import { useState, useEffect } from "react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

const bundleItemSchema = z.object({
    part_id: z.number().min(1, "Part is required"),
    part_name: z.string().optional(),
    quantity: z.number().min(0.01, "Quantity must be at least 0.01"),
});

const bundleSchema = z.object({
    name: z.string().min(1, "Name is required"),
    description: z.string().optional(),
    service_type: z.number().optional().nullable(),
    is_active: z.boolean(),
    items: z.array(bundleItemSchema).min(1, "At least one part is required"),
});

export type BundleFormData = z.infer<typeof bundleSchema>;

interface BundleFormProps {
    initialData?: Partial<ServiceBundle>;
    onSubmit: (data: BundleFormData) => Promise<void>;
    isSubmitting: boolean;
    mode: "create" | "edit";
    onCancel?: () => void;
    showHeader?: boolean;
}

export function BundleForm({ initialData, onSubmit, isSubmitting, mode, onCancel, showHeader = true }: BundleFormProps) {
    const [partSearch, setPartSearch] = useState("");

    const { data: serviceTypesResponse } = useQuery({
        queryKey: ["service-types"],
        queryFn: () => vehiclesApi.getServiceTypes(),
    });

    const serviceTypes = (serviceTypesResponse?.results || []).filter((type: any) => {
        // Show all active service types
        return type.is_active !== false;
    });

    const { data: partsResponse } = useQuery({
        queryKey: ["parts-search", partSearch],
        queryFn: () => inventoryApi.list({ search: partSearch, is_active: true }),
        enabled: partSearch.length > 2,
    });
    const parts = partsResponse?.results || [];

    const {
        register,
        handleSubmit,
        control,
        formState: { errors },
        setValue,
        watch,
    } = useForm<BundleFormData>({
        resolver: zodResolver(bundleSchema),
        defaultValues: {
            name: initialData?.name || "",
            description: initialData?.description || "",
            service_type: initialData?.service_type || null,
            is_active: initialData?.is_active ?? true,
            items: initialData?.items?.map(item => ({
                part_id: item.part,
                part_name: item.part_name,
                quantity: Number(item.quantity),
            })) || [],
        },
    });

    const { fields, append, remove } = useFieldArray({
        control,
        name: "items",
    });

    // Auto-fill bundle name when service type is selected (if name is currently empty)
    const selectedServiceTypeId = watch("service_type");
    const currentName = watch("name");

    useEffect(() => {
        if (selectedServiceTypeId && !currentName) {
            const selectedType = serviceTypes.find(t => t.id === selectedServiceTypeId);
            if (selectedType) {
                setValue("name", selectedType.name);
            }
        }
    }, [selectedServiceTypeId, currentName, serviceTypes, setValue]);

    const handleAddPart = (part: Part) => {
        // Check if part already exists in bundle
        const existingItems = watch("items");
        if (existingItems.some(item => item.part_id === part.id)) {
            return;
        }

        append({
            part_id: part.id,
            part_name: part.name,
            quantity: 1,
        });
        setPartSearch("");
    };

    const handleFormSubmit = (data: BundleFormData) => {
        onSubmit(data);
    };

    return (
        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Info */}
                <div className="lg:col-span-2 space-y-6">
                    <Card>
                        {showHeader && (
                        <CardHeader>
                            <CardTitle className="text-lg">Bundle information</CardTitle>
                        </CardHeader>
                        )}
                        <CardContent className={showHeader ? "space-y-4" : "pt-6 space-y-4"}>
                            <div className="space-y-2">
                                <Label htmlFor="name">Bundle Name <span className="text-destructive">*</span></Label>
                                <Input id="name" {...register("name")} placeholder="e.g. Major Service Kit" />
                                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="service_type">Linked Service Type</Label>
                                <select
                                    id="service_type"
                                    {...register("service_type", {
                                        setValueAs: (v) => v === "" ? null : Number(v)
                                    })}
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <option value="">None</option>

                                    {serviceTypes.map((type: any) => {
                                        const isAlreadyBundled = type.has_bundle && !(mode === "edit" && type.id === initialData?.service_type);
                                        return (
                                            <option key={type.id} value={type.id} disabled={isAlreadyBundled}>
                                                {type.name} {isAlreadyBundled ? "(Already Bundled)" : ""}
                                            </option>
                                        );
                                    })}
                                </select>
                                <p className="text-[10px] text-muted-foreground">Linking to a service type allows auto-populating these parts in work orders.</p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="description">Description</Label>
                                <Textarea id="description" {...register("description")} rows={3} placeholder="What is included in this bundle?" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-lg">Bundle items</CardTitle>
                            <div className="relative w-64">
                                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                                <Input
                                    placeholder="Search parts to add..."
                                    className="pl-8 h-8 text-xs"
                                    value={partSearch}
                                    onChange={(e) => setPartSearch(e.target.value)}
                                />
                                {partSearch.length > 2 && parts.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-card border rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
                                        {parts.map(part => (
                                            <button
                                                key={part.id}
                                                type="button"
                                                className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center justify-between"
                                                onClick={() => handleAddPart(part)}
                                            >
                                                <div>
                                                    <p className="font-medium">{part.name}</p>
                                                    <p className="text-[10px] text-muted-foreground">{part.part_number}</p>
                                                </div>
                                                <Plus className="w-4 h-4 text-primary" />
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent>
                            {fields.length === 0 ? (
                                <div className="text-center py-8 border-2 border-dashed rounded-lg">
                                    <Box className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                                    <p className="text-sm text-muted-foreground">No parts added yet. Search for parts above.</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="text-[11px] uppercase">Part Name</TableHead>
                                                <TableHead className="w-32 text-[11px] uppercase">Quantity</TableHead>
                                                <TableHead className="w-16"></TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {fields.map((field, index) => (
                                                <TableRow key={field.id}>
                                                    <TableCell>
                                                        <span className="text-sm font-medium">{watch(`items.${index}.part_name`)}</span>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Input
                                                            type="number"
                                                            step="0.01"
                                                            {...register(`items.${index}.quantity`, { valueAsNumber: true })}
                                                            className="h-8 text-sm"
                                                        />
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                                            onClick={() => remove(index)}
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                    {errors.items && <p className="text-xs text-destructive">{errors.items.message}</p>}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Sidebar */}
                <div className="space-y-6 lg:sticky lg:top-20 lg:self-start">
                    <Card>
                        <CardHeader className="pb-3 border-b border-border">
                            <CardTitle className="text-base font-medium">Status & Settings</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 space-y-4">
                            <label className="flex items-center space-x-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    {...register("is_active")}
                                    className="rounded border-border text-primary focus:ring-primary"
                                />
                                <span className="text-sm font-medium">Bundle is Active</span>
                            </label>

                            <div className="pt-4 border-t space-y-3">
                                <Button type="submit" className="w-full shadow-workshop" disabled={isSubmitting}>
                                    {isSubmitting ? (
                                        <div className="flex items-center gap-2">
                                            <div className="w-4 h-4 border-2 border-card/30 border-t-white rounded-full animate-spin" />
                                            Saving...
                                        </div>
                                    ) : (
                                        <>
                                            <CheckCircle2 className="w-4 h-4 mr-2" />
                                            {mode === "create" ? "Create Bundle" : "Save Changes"}
                                        </>
                                    )}
                                </Button>
                                <Button type="button" variant="ghost" className="w-full" onClick={onCancel}>
                                    Cancel
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </form>
    );
}
