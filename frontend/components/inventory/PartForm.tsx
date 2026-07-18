"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { inventoryApi, Part } from "@/lib/api/inventory";
import { branchesApi } from "@/lib/api/branches";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Image as ImageIcon, X, Package, ScanBarcode } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useState } from "react";
import Image from "next/image";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BarcodeScanner } from "@/components/shared/BarcodeScanner";
import { getMediaUrl } from "@/lib/api/utils";
import { RevenueProductSelect } from "@/components/accounting/RevenueProductSelect";
import { INCOME_CATEGORY_SHORT } from "@/lib/accounting/income-category-labels";

type PartProductType = "inventory" | "non_inventory" | "service";

export const partSchema = z.object({
    part_number: z.string().min(1, "Part number is required"),
    barcode: z.string().optional(),
    name: z.string().min(1, "Name is required"),
    description: z.string().optional(),
    category: z.number().min(1, "Category is required"),
    revenue_product: z.number().optional().nullable(),
    branch: z.number().optional(),
    item_type: z.enum(["inventory", "non_inventory", "service"]),
    inventory_start_date: z.string().optional(),
    initial_quantity: z.number().min(0).optional(),
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
    initialData?: Partial<PartFormData> & { image?: string | null };
    onSubmit: (data: PartFormData, imageFile: File | null, clearImage?: boolean) => Promise<void>;
    formId?: string;
    mode?: "create" | "edit";
    /** When set, type is fixed from the create flow (no type picker in form). */
    productType?: PartProductType;
}

export function PartForm({ initialData, onSubmit, formId, mode = "edit", productType }: PartFormProps) {
    const { formatCurrency } = useCurrency();
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [clearExistingImage, setClearExistingImage] = useState(false);
    const [imagePreview, setImagePreview] = useState<string | null>(
        initialData?.image ? getMediaUrl(initialData.image) : null
    );
    const [activeTab, setActiveTab] = useState("basic");
    const [showScanner, setShowScanner] = useState(false);

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

    const branches = branchesResponse ?? [];

    const {
        register,
        handleSubmit,
        formState: { errors },
        watch,
        setValue,
    } = useForm<PartFormData>({
        resolver: zodResolver(partSchema),
        defaultValues: {
            barcode: "",
            reorder_point: 10,
            reorder_quantity: 20,
            minimum_stock: 5,
            unit: "piece",
            item_type: productType ?? "inventory",
            markup_percentage: 0,
            is_active: true,
            is_taxable: true,
            is_core: false,
            core_charge: 0,
            revenue_product: null,
            ...initialData,
            ...(productType ? { item_type: productType } : {}),
        },
    });

    const costPrice = watch("cost_price");
    const markup = watch("markup_percentage") || 0;
    const itemType = productType ?? watch("item_type");
    const isService = itemType === "service";
    const isInventory = itemType === "inventory";
    const isNonInventory = itemType === "non_inventory";
    const calculatedSellingPrice = costPrice ? costPrice * (1 + markup / 100) : undefined;

    const nameLabel = isService ? "Service name" : "Product name";
    const skuLabel = isService ? "Service code" : "SKU / Item #";
    const skuPlaceholder = isService ? "SVC-001" : "SKU-001";
    const namePlaceholder = isService ? "Oil Change Service" : "Brake Pad Set";

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setImageFile(file);
            setClearExistingImage(false);
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
        setClearExistingImage(Boolean(initialData?.image));
    };

    const handleFormSubmit = (data: PartFormData) => {
        return onSubmit(data, imageFile, clearExistingImage);
    };

    return (
        <form id={formId} onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
            {productType && <input type="hidden" {...register("item_type")} value={productType} />}
            <Dialog open={showScanner} onOpenChange={setShowScanner}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Scan Barcode</DialogTitle>
                    </DialogHeader>
                    <div className="mt-4">
                        {showScanner && (
                            <BarcodeScanner
                                onScan={(result) => {
                                    register("barcode").onChange({ target: { value: result, name: "barcode" } });
                                    // Hack to force react-hook-form to update value immediately for the UI without submitting
                                    const event = new Event("input", { bubbles: true });
                                    const input = document.getElementById("barcode") as HTMLInputElement;
                                    if (input) {
                                        input.value = result;
                                        input.dispatchEvent(event);
                                    }
                                    setShowScanner(false);
                                }}
                                onClose={() => setShowScanner(false)}
                            />
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Main Form */}
                <div className="lg:col-span-3 space-y-6">
                    <Card>
                        <CardContent className="p-0">
                            <Tabs value={activeTab} onValueChange={setActiveTab}>
                                <div className="border-b px-4 pt-4 sm:px-6">
                                    <TabsList>
                                        <TabsTrigger value="basic">Basic info</TabsTrigger>
                                        {isInventory && <TabsTrigger value="inventory">Stock</TabsTrigger>}
                                        {!isService && isNonInventory && <TabsTrigger value="inventory">Units</TabsTrigger>}
                                        <TabsTrigger value="pricing">Pricing</TabsTrigger>
                                        {!isService && <TabsTrigger value="additional">Additional</TabsTrigger>}
                                    </TabsList>
                                </div>

                                {/* Basic Info Tab */}
                                <TabsContent value="basic" className="p-4 space-y-4 sm:p-6">
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                                        <div className="space-y-2">
                                            <Label htmlFor="part_number">{skuLabel} <span className="text-destructive">*</span></Label>
                                            <Input id="part_number" {...register("part_number")} className={errors.part_number ? "border-destructive" : ""} placeholder={skuPlaceholder} />
                                            {errors.part_number && <p className="text-xs text-destructive">{errors.part_number.message}</p>}
                                        </div>
                                        {!isService && (
                                        <div className="space-y-2">
                                            <Label htmlFor="barcode">Barcode (UPC/EAN)</Label>
                                            <div className="flex gap-2">
                                                <Input id="barcode" {...register("barcode")} placeholder="Scan or enter barcode" />
                                                <Button type="button" variant="outline" onClick={() => setShowScanner(true)}>
                                                    <ScanBarcode className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </div>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                                        <div className="space-y-2">
                                            <select
                                                id="category"
                                                {...register("category", { valueAsNumber: true })}
                                                className={cn(
                                                    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                                                    errors.category ? "border-destructive" : ""
                                                )}
                                            >
                                                <option value="">Select Category</option>

                                                {categories.map((cat: any) => (
                                                    <option key={cat.id} value={cat.id}>{cat.full_path || cat.name}</option>
                                                ))}
                                            </select>
                                            {errors.category && <p className="text-xs text-destructive">{errors.category.message}</p>}
                                        </div>
                                        {!isService && (
                                        <div className="space-y-2">
                                            <Label>{INCOME_CATEGORY_SHORT} override</Label>
                                            <RevenueProductSelect
                                                value={watch("revenue_product") ?? null}
                                                onChange={(value) => setValue("revenue_product", value, { shouldDirty: true })}
                                                revenueClass="part"
                                            />
                                            <p className="text-[10px] text-muted-foreground">
                                                Optional. When unset, billing uses the category default.
                                            </p>
                                        </div>
                                        )}
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="name">{nameLabel} <span className="text-destructive">*</span></Label>
                                        <Input id="name" {...register("name")} className={errors.name ? "border-destructive" : ""} placeholder={namePlaceholder} />
                                        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="description">Description</Label>
                                        <Textarea id="description" {...register("description")} rows={2} />
                                    </div>
                                    {isService && (
                                    <div className="space-y-2 max-w-xs">
                                        <Label htmlFor="unit">Unit</Label>
                                        <select
                                            id="unit"
                                            {...register("unit")}
                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                        >
                                            <option value="piece">Each</option>
                                            <option value="other">Other</option>
                                        </select>
                                    </div>
                                    )}
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                        {!isService && (
                                        <div className="space-y-2">
                                            <Label htmlFor="branch">Branch</Label>
                                            <select
                                                id="branch"
                                                {...register("branch", {
                                                    setValueAs: (v) => (v === "" ? undefined : Number(v)),
                                                })}
                                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                <option value="">Any Branch</option>
                                                {branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                                            </select>
                                        </div>
                                        )}
                                        {!isService && (
                                        <>
                                        <div className="space-y-2">
                                            <Label htmlFor="manufacturer">Manufacturer</Label>
                                            <Input id="manufacturer" {...register("manufacturer")} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="manufacturer_part_number">Mfr Part #</Label>
                                            <Input id="manufacturer_part_number" {...register("manufacturer_part_number")} />
                                        </div>
                                        </>
                                        )}
                                    </div>
                                </TabsContent>

                                {/* Stock / units tab */}
                                <TabsContent value="inventory" className="p-4 space-y-4 sm:p-6">
                                    {isInventory && mode === "create" && (
                                        <div className="space-y-2 max-w-xs">
                                            <Label htmlFor="initial_quantity">Opening quantity (active branch)</Label>
                                            <Input
                                                type="number"
                                                id="initial_quantity"
                                                min={0}
                                                {...register("initial_quantity", { valueAsNumber: true })}
                                                placeholder="0"
                                            />
                                        </div>
                                    )}
                                    {isInventory && (
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                                        <div className="space-y-2">
                                            <Label htmlFor="inventory_start_date">Inventory start date</Label>
                                            <Input id="inventory_start_date" type="date" {...register("inventory_start_date")} />
                                        </div>
                                    </div>
                                    )}
                                    {isInventory && (
                                    <>
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                        <div className="space-y-2">
                                            <Label htmlFor="minimum_stock">Min stock</Label>
                                            <Input type="number" id="minimum_stock" {...register("minimum_stock", { valueAsNumber: true })} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="reorder_point">Reorder point</Label>
                                            <Input type="number" id="reorder_point" {...register("reorder_point", { valueAsNumber: true })} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="reorder_quantity">Reorder qty</Label>
                                            <Input type="number" id="reorder_quantity" {...register("reorder_quantity", { valueAsNumber: true })} />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                                        <div className="space-y-2">
                                            <Label htmlFor="bin_location">Bin location</Label>
                                            <Input id="bin_location" {...register("bin_location")} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="shelf">Shelf</Label>
                                            <Input id="shelf" {...register("shelf")} />
                                        </div>
                                    </div>
                                    </>
                                    )}
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                                        <div className="space-y-2">
                                            <Label htmlFor="unit">Unit <span className="text-destructive">*</span></Label>
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
                                        {isInventory && (
                                        <div className="space-y-2">
                                            <Label htmlFor="maximum_stock">Max stock</Label>
                                            <Input type="number" id="maximum_stock" {...register("maximum_stock", { setValueAs: (v) => (v === "" ? undefined : Number(v)) })} placeholder="Optional" />
                                        </div>
                                        )}
                                    </div>
                                </TabsContent>

                                {/* Pricing Tab */}
                                <TabsContent value="pricing" className="p-4 space-y-4 sm:p-6">
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                                        {!isService && (
                                        <div className="space-y-2">
                                            <Label htmlFor="cost_price">Cost price</Label>
                                            <Input type="number" step="0.01" id="cost_price" {...register("cost_price", { setValueAs: (v) => (v === "" ? undefined : Number(v)) })} placeholder="0.00" />
                                            {errors.cost_price && <p className="text-xs text-destructive">{errors.cost_price.message}</p>}
                                        </div>
                                        )}
                                        {!isService && (
                                        <div className="space-y-2">
                                            <Label htmlFor="markup_percentage">Markup %</Label>
                                            <Input type="number" step="0.1" id="markup_percentage" {...register("markup_percentage", { setValueAs: (v) => (v === "" ? undefined : Number(v)) })} placeholder="0" />
                                        </div>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                                        <div className="space-y-2">
                                            <Label htmlFor="selling_price">{isService ? "Rate / price" : "Selling price"}</Label>
                                            <Input type="number" step="0.01" id="selling_price" {...register("selling_price", { setValueAs: (v) => (v === "" ? undefined : Number(v)) })} placeholder="0.00" />
                                            {calculatedSellingPrice && <p className="text-xs text-muted-foreground">Calculated: {formatCurrency(calculatedSellingPrice)}</p>}
                                            {errors.selling_price && <p className="text-xs text-destructive">{errors.selling_price.message}</p>}
                                        </div>
                                        {!isService && (
                                        <div className="space-y-2">
                                            <Label htmlFor="list_price">List price (MSRP)</Label>
                                            <Input type="number" step="0.01" id="list_price" {...register("list_price", { setValueAs: (v) => (v === "" ? undefined : Number(v)) })} placeholder="0.00" />
                                        </div>
                                        )}
                                    </div>
                                </TabsContent>

                                {/* Additional Tab */}
                                <TabsContent value="additional" className="p-4 space-y-4 sm:p-6">
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                                        <div className="space-y-2">
                                            <Label htmlFor="weight">Weight (lbs)</Label>
                                            <Input type="number" step="0.01" id="weight" {...register("weight", { setValueAs: (v) => (v === "" ? undefined : Number(v)) })} placeholder="0.00" />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="dimensions">Dimensions</Label>
                                            <Input id="dimensions" {...register("dimensions")} placeholder="10x5x3" />
                                        </div>
                                    </div>
                                    <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                                        <div>
                                            <Label className="text-sm font-medium">Vehicle Compatibility</Label>
                                            <p className="mt-0.5 text-xs text-muted-foreground">
                                                Leave blank if unknown. Use commas for multiple values.
                                                Enter &quot;universal&quot; only when the part truly fits all vehicles.
                                            </p>
                                        </div>
                                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                            <div className="space-y-1.5">
                                                <Label htmlFor="compatible_makes" className="text-xs text-muted-foreground">Makes</Label>
                                                <Input
                                                    id="compatible_makes"
                                                    {...register("compatible_makes")}
                                                    placeholder="Toyota, Honda"
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label htmlFor="compatible_models" className="text-xs text-muted-foreground">Models</Label>
                                                <Input
                                                    id="compatible_models"
                                                    {...register("compatible_models")}
                                                    placeholder="Camry, Corolla"
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label htmlFor="compatible_years" className="text-xs text-muted-foreground">Years</Label>
                                                <Input
                                                    id="compatible_years"
                                                    {...register("compatible_years")}
                                                    placeholder="2015-2023"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Warranty</Label>
                                        <div className="space-y-2">
                                            <Input type="number" {...register("warranty_months", { setValueAs: (v) => (v === "" ? undefined : Number(v)) })} placeholder="Months" />
                                            <Textarea {...register("warranty_notes")} placeholder="Warranty notes..." rows={2} />
                                        </div>
                                    </div>
                                </TabsContent>
                            </Tabs>
                        </CardContent>
                    </Card>


                </div>

                {/* Sidebar */}
                <div className="space-y-6 lg:sticky lg:top-20 lg:self-start">
                    <Card className="overflow-hidden">
                        <div className="relative aspect-square border-b border-border bg-muted/40 flex items-center justify-center">
                            {imagePreview ? (
                                <>
                                    <Image
                                        src={imagePreview}
                                        alt="Part preview"
                                        fill
                                        className="object-contain"
                                        unoptimized={imagePreview.startsWith("http") || imagePreview.startsWith("data:")}
                                    />
                                    <button
                                        type="button"
                                        onClick={removeImage}
                                        className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors"
                                        aria-label="Remove part image"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </>
                            ) : (
                                <div className="flex flex-col items-center justify-center text-muted-foreground">
                                    <ImageIcon className="w-12 h-12 mb-2 opacity-30" />
                                    <span className="text-sm font-medium">No Image</span>
                                </div>
                            )}
                        </div>
                        <CardContent className="p-4">
                            <label className="block w-full">
                                <div className="flex items-center justify-center w-full px-4 py-2 border border-dashed border-border rounded-md cursor-pointer hover:bg-muted transition-colors">
                                    <ImageIcon className="w-4 h-4 mr-2 text-muted-foreground" />
                                    <span className="text-sm text-muted-foreground">
                                        {imagePreview ? "Change Image" : "Upload Image"}
                                    </span>
                                    <input
                                        type="file"
                                        className="hidden"
                                        accept="image/*"
                                        onChange={handleImageChange}
                                    />
                                </div>
                            </label>
                            <p className="text-[10px] text-center text-muted-foreground mt-2">
                                Supports JPG, PNG, WebP
                            </p>
                        </CardContent>
                    </Card>

                    {!isService && (
                    <Card>
                        <CardHeader className="pb-3 border-b border-border">
                            <CardTitle className="text-base font-medium flex items-center gap-2">
                                <Package className="w-4 h-4 text-warning" />
                                Supplier
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4">
                            <select
                                {...register("preferred_supplier", {
                                    setValueAs: (v) => (v === "" ? undefined : Number(v)),
                                })}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <option value="">None</option>
                                {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name} ({s.supplier_code})</option>)}
                            </select>
                        </CardContent>
                    </Card>
                    )}

                    <Card>
                        <CardHeader className="pb-3 border-b border-border">
                            <CardTitle className="text-base font-medium">Status</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 space-y-3">
                            <label className="flex items-center space-x-2 cursor-pointer">
                                <input type="checkbox" {...register("is_active")} className="rounded border-border text-primary focus:ring-primary" />
                                <span className="text-sm">Active</span>
                            </label>
                            <label className="flex items-center space-x-2 cursor-pointer">
                                <input type="checkbox" {...register("is_taxable")} className="rounded border-border text-primary focus:ring-primary" />
                                <span className="text-sm">Taxable</span>
                            </label>
                            {!isService && (
                            <label className="flex items-center space-x-2 cursor-pointer">
                                <input type="checkbox" {...register("is_core")} className="rounded border-border text-primary focus:ring-primary" />
                                <span className="text-sm">Core part</span>
                            </label>
                            )}
                            {!isService && watch("is_core") && (
                                <div className="space-y-1 pl-6">
                                    <Label htmlFor="core_charge" className="text-xs">Core Charge</Label>
                                    <Input type="number" step="0.01" id="core_charge" {...register("core_charge", { setValueAs: (v) => (v === "" ? undefined : Number(v)) })} className="h-8 text-sm" />
                                </div>
                            )}
                            {!productType && mode === "edit" && (
                            <div className="pt-3 border-t space-y-2">
                                <Label htmlFor="item_type" className="text-xs text-muted-foreground">Product type</Label>
                                <select id="item_type" {...register("item_type")} className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                                    <option value="inventory">Inventory</option>
                                    <option value="non_inventory">Non-inventory</option>
                                    <option value="service">Service</option>
                                </select>
                            </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </form>
    );
}
