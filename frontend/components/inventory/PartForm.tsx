"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { inventoryApi, Part } from "@/lib/api/inventory";
import { branchesApi } from "@/lib/api/branches";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CheckCircle2, Image as ImageIcon, X, Package } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useState } from "react";
import Image from "next/image";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

export const partSchema = z.object({
    part_number: z.string().min(1, "Part number is required"),
    name: z.string().min(1, "Name is required"),
    description: z.string().optional(),
    category: z.number().min(1, "Category is required"),
    branch: z.number().optional(),
    manufacturer: z.string().optional(),
    manufacturer_part_number: z.string().optional(),
    preferred_supplier: z.number().optional(),
    // quantity_in_stock removed - stock is managed via StockItem per branch
    reorder_point: z.number().min(0),
    reorder_quantity: z.number().min(0),
    minimum_stock: z.number().min(0),
    maximum_stock: z.number().min(0).optional(),
    unit: z.enum(["piece", "set", "pair", "gallon", "quart", "liter", "bottle", "can", "box", "package", "roll", "foot", "meter", "other"]),
    cost_price: z.number().min(0.01, "Cost price must be greater than 0").optional(),
    selling_price: z.number().min(0.01, "Selling price must be greater than 0").optional(),
    markup_percentage: z.number().min(0).optional(),
    list_price: z.number().min(0).optional(),
    bin_location: z.string().optional(),
    shelf: z.string().optional(),
    weight: z.number().min(0).optional(),
    dimensions: z.string().optional(),
    compatible_makes: z.string().optional(),
    compatible_models: z.string().optional(),
    compatible_years: z.string().optional(),
    warranty_months: z.number().min(0).optional(),
    warranty_notes: z.string().optional(),
    is_active: z.boolean(),
    is_taxable: z.boolean(),
    is_core: z.boolean(),
    core_charge: z.number().min(0).optional(),
});

export type PartFormData = z.infer<typeof partSchema>;

interface PartFormProps {
    initialData?: Partial<PartFormData> & { image?: string };
    onSubmit: (data: PartFormData, imageFile: File | null) => Promise<void>;
    isSubmitting: boolean;
    mode: "create" | "edit";
    onCancel?: () => void;
}

export function PartForm({ initialData, onSubmit, isSubmitting, mode, onCancel }: PartFormProps) {
    const { formatCurrency } = useCurrency();
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(initialData?.image || null);
    const [activeTab, setActiveTab] = useState("basic");

    const { data: categories = [] } = useQuery({
        queryKey: ["part-categories"],
        queryFn: () => inventoryApi.listCategories(),
    });

    const { data: suppliersResponse } = useQuery({
        queryKey: ["suppliers"],
        queryFn: () => inventoryApi.listSuppliers(),
    });

    const suppliers = Array.isArray(suppliersResponse) ? suppliersResponse : suppliersResponse?.results || [];

    const { data: branchesResponse } = useQuery({
        queryKey: ["branches"],
        queryFn: () => branchesApi.list(),
    });

    const branches = Array.isArray(branchesResponse) ? branchesResponse : branchesResponse?.results || [];

    const {
        register,
        handleSubmit,
        formState: { errors },
        watch,
    } = useForm<PartFormData>({
        resolver: zodResolver(partSchema),
        defaultValues: {
            // quantity_in_stock removed - stock is managed via StockItem per branch
            reorder_point: 10,
            reorder_quantity: 20,
            minimum_stock: 5,
            unit: "piece",
            markup_percentage: 0,
            is_active: true,
            is_taxable: true,
            is_core: false,
            core_charge: 0,
            ...initialData,
        },
    });

    const costPrice = watch("cost_price");
    const markup = watch("markup_percentage") || 0;
    const calculatedSellingPrice = costPrice ? costPrice * (1 + markup / 100) : undefined;

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setImageFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setImagePreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const removeImage = () => {
        setImageFile(null);
        setImagePreview(null);
    };

    const handleFormSubmit = (data: PartFormData) => {
        onSubmit(data, imageFile);
    };

    return (
        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Main Form */}
                <div className="lg:col-span-3 space-y-6">
                    <Card>
                        <CardContent className="p-0">
                            <Tabs value={activeTab} onValueChange={setActiveTab}>
                                <div className="border-b px-6 pt-4">
                                    <TabsList>
                                        <TabsTrigger value="basic">Basic Info</TabsTrigger>
                                        <TabsTrigger value="inventory">Inventory</TabsTrigger>
                                        <TabsTrigger value="pricing">Pricing</TabsTrigger>
                                        <TabsTrigger value="additional">Additional</TabsTrigger>
                                    </TabsList>
                                </div>

                                {/* Basic Info Tab */}
                                <TabsContent value="basic" className="p-6 space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="part_number">Part Number <span className="text-red-500">*</span></Label>
                                            <Input id="part_number" {...register("part_number")} className={errors.part_number ? "border-red-500" : ""} placeholder="PART-001" />
                                            {errors.part_number && <p className="text-xs text-red-500">{errors.part_number.message}</p>}
                                        </div>
                                        <div className="space-y-2">
                                            <select
                                                id="category"
                                                {...register("category", { valueAsNumber: true })}
                                                className={cn(
                                                    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                                                    errors.category ? "border-red-500" : ""
                                                )}
                                            >
                                                <option value="">Select Category</option>
                                                {categories.map((cat: any) => (
                                                    <option key={cat.id} value={cat.id}>{cat.full_path || cat.name}</option>
                                                ))}
                                            </select>
                                            {errors.category && <p className="text-xs text-red-500">{errors.category.message}</p>}
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="name">Part Name <span className="text-red-500">*</span></Label>
                                        <Input id="name" {...register("name")} className={errors.name ? "border-red-500" : ""} placeholder="Brake Pad Set" />
                                        {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="description">Description</Label>
                                        <Textarea id="description" {...register("description")} rows={2} />
                                    </div>
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="branch">Branch</Label>
                                            <select
                                                id="branch"
                                                {...register("branch", { valueAsNumber: true })}
                                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                <option value="">Any Branch</option>
                                                {branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                                            </select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="manufacturer">Manufacturer</Label>
                                            <Input id="manufacturer" {...register("manufacturer")} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="manufacturer_part_number">Mfr Part #</Label>
                                            <Input id="manufacturer_part_number" {...register("manufacturer_part_number")} />
                                        </div>
                                    </div>
                                </TabsContent>

                                {/* Inventory Tab */}
                                <TabsContent value="inventory" className="p-6 space-y-4">
                                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-3 mb-4">
                                        <p className="text-sm text-blue-800 dark:text-blue-200">
                                            <strong>Note:</strong> Stock quantities are managed per branch via Stock Items. 
                                            Set initial stock after creating the part, or use purchase orders to receive inventory.
                                        </p>
                                        </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="unit">Unit <span className="text-red-500">*</span></Label>
                                            <select
                                                id="unit"
                                                {...register("unit")}
                                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                <option value="piece">Piece</option>
                                                <option value="set">Set</option>
                                                <option value="pair">Pair</option>
                                                <option value="gallon">Gallon</option>
                                                <option value="quart">Quart</option>
                                                <option value="liter">Liter</option>
                                                <option value="bottle">Bottle</option>
                                                <option value="can">Can</option>
                                                <option value="box">Box</option>
                                                <option value="package">Package</option>
                                                <option value="roll">Roll</option>
                                                <option value="foot">Foot</option>
                                                <option value="meter">Meter</option>
                                                <option value="other">Other</option>
                                            </select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="maximum_stock">Max Stock</Label>
                                            <Input type="number" id="maximum_stock" {...register("maximum_stock", { valueAsNumber: true })} placeholder="Optional" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="minimum_stock">Min Stock</Label>
                                            <Input type="number" id="minimum_stock" {...register("minimum_stock", { valueAsNumber: true })} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="reorder_point">Reorder Point</Label>
                                            <Input type="number" id="reorder_point" {...register("reorder_point", { valueAsNumber: true })} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="reorder_quantity">Reorder Qty</Label>
                                            <Input type="number" id="reorder_quantity" {...register("reorder_quantity", { valueAsNumber: true })} />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="bin_location">Bin Location</Label>
                                            <Input id="bin_location" {...register("bin_location")} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="shelf">Shelf</Label>
                                            <Input id="shelf" {...register("shelf")} />
                                        </div>
                                    </div>
                                </TabsContent>

                                {/* Pricing Tab */}
                                <TabsContent value="pricing" className="p-6 space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="cost_price">Cost Price</Label>
                                            <Input type="number" step="0.01" id="cost_price" {...register("cost_price", { valueAsNumber: true })} placeholder="0.00" />
                                            {errors.cost_price && <p className="text-xs text-red-500">{errors.cost_price.message}</p>}
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="markup_percentage">Markup %</Label>
                                            <Input type="number" step="0.1" id="markup_percentage" {...register("markup_percentage", { valueAsNumber: true })} placeholder="0" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="selling_price">Selling Price</Label>
                                            <Input type="number" step="0.01" id="selling_price" {...register("selling_price", { valueAsNumber: true })} placeholder="0.00" />
                                            {calculatedSellingPrice && <p className="text-xs text-muted-foreground">Calculated: {formatCurrency(calculatedSellingPrice)}</p>}
                                            {errors.selling_price && <p className="text-xs text-red-500">{errors.selling_price.message}</p>}
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="list_price">List Price (MSRP)</Label>
                                            <Input type="number" step="0.01" id="list_price" {...register("list_price", { valueAsNumber: true })} placeholder="0.00" />
                                        </div>
                                    </div>
                                </TabsContent>

                                {/* Additional Tab */}
                                <TabsContent value="additional" className="p-6 space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="weight">Weight (lbs)</Label>
                                            <Input type="number" step="0.01" id="weight" {...register("weight", { valueAsNumber: true })} placeholder="0.00" />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="dimensions">Dimensions</Label>
                                            <Input id="dimensions" {...register("dimensions")} placeholder="10x5x3" />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Compatibility</Label>
                                        <div className="space-y-2">
                                            <Input {...register("compatible_makes")} placeholder="Makes (e.g. Toyota, Honda)" />
                                            <Input {...register("compatible_models")} placeholder="Models (e.g. Camry, Accord)" />
                                            <Input {...register("compatible_years")} placeholder="Years (e.g. 2015-2023)" />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Warranty</Label>
                                        <div className="space-y-2">
                                            <Input type="number" {...register("warranty_months", { valueAsNumber: true })} placeholder="Months" />
                                            <Textarea {...register("warranty_notes")} placeholder="Warranty notes..." rows={2} />
                                        </div>
                                    </div>
                                </TabsContent>
                            </Tabs>
                        </CardContent>
                    </Card>


                </div>

                {/* Sidebar */}
                <div className="space-y-6">
                    <Card>
                        <CardHeader className="pb-3 border-b border-gray-100 dark:border-gray-800">
                            <CardTitle className="text-base font-medium flex items-center gap-2">
                                <Package className="w-4 h-4 text-orange-500" />
                                Supplier
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4">
                            <select
                                {...register("preferred_supplier", { valueAsNumber: true })}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <option value="">None</option>
                                {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name} ({s.supplier_code})</option>)}
                            </select>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-3 border-b border-gray-100 dark:border-gray-800">
                            <CardTitle className="text-base font-medium">Status</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 space-y-3">
                            <label className="flex items-center space-x-2 cursor-pointer">
                                <input type="checkbox" {...register("is_active")} className="rounded border-gray-300 text-primary focus:ring-primary" />
                                <span className="text-sm">Active</span>
                            </label>
                            <label className="flex items-center space-x-2 cursor-pointer">
                                <input type="checkbox" {...register("is_taxable")} className="rounded border-gray-300 text-primary focus:ring-primary" />
                                <span className="text-sm">Taxable</span>
                            </label>
                            <label className="flex items-center space-x-2 cursor-pointer">
                                <input type="checkbox" {...register("is_core")} className="rounded border-gray-300 text-primary focus:ring-primary" />
                                <span className="text-sm">Core Part</span>
                            </label>
                            {watch("is_core") && (
                                <div className="space-y-1 pl-6">
                                    <Label htmlFor="core_charge" className="text-xs">Core Charge</Label>
                                    <Input type="number" step="0.01" id="core_charge" {...register("core_charge", { valueAsNumber: true })} className="h-8 text-sm" />
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-3 border-b border-gray-100 dark:border-gray-800">
                            <CardTitle className="text-base font-medium">Actions</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 space-y-3">
                            <Button type="submit" className="w-full" disabled={isSubmitting}>
                                {isSubmitting ? (
                                    <div className="flex items-center gap-2">
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Saving...
                                    </div>
                                ) : (
                                    <>
                                        <CheckCircle2 className="w-4 h-4 mr-2" />
                                        {mode === 'create' ? "Create Part" : "Save Changes"}
                                    </>
                                )}
                            </Button>
                            <Button type="button" variant="ghost" className="w-full" onClick={onCancel}>
                                Cancel
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </form>
    );
}
