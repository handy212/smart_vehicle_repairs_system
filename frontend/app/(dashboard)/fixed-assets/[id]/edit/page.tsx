"use client";

import { useEffect, use, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fixedAssetsApi, type FixedAsset, type FixedAssetCategory, type FixedAssetUpdateData } from "@/lib/api/fixed-assets";
import { documentsApi } from "@/lib/api/documents";
import { branchesApi } from "@/lib/api/branches";
import { hrApi } from "@/lib/api/hr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save, FileText, Trash2 } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/lib/hooks/useToast";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { PermissionButton } from "@/components/auth/PermissionButton";
import { getApiErrorMessage } from "@/lib/api/errors";
import { usePermissions } from "@/lib/hooks/usePermissions";

type BranchOption = {
    id: number;
    name: string;
};

type StaffOption = {
    id: number;
    full_name: string;
};

const formSchema = z.object({
    asset_number: z.string().min(1, "Asset number is required"),
    name: z.string().min(1, "Name is required"),
    description: z.string().optional(),
    category: z.string().min(1, "Category is required"),
    branch: z.string().min(1, "Branch is required"),
    acquisition_cost: z.coerce.number().min(0, "Cost must be positive").default(0),
    acquisition_date: z.string().min(1, "Acquisition date is required"),
    useful_life_years: z.coerce.number().min(1, "Useful life must be at least 1 year").default(5),
    salvage_value: z.coerce.number().min(0, "Salvage value must be positive").default(0),
    depreciation_method: z.string().default("straight_line"),
    status: z.enum(["active", "inactive", "disposed", "sold", "retired"]).default("active"),
    location: z.string().optional(),
    assigned_to: z.string().optional(),
    manufacturer: z.string().optional(),
    model_number: z.string().optional(),
    serial_number: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function EditFixedAssetPage({ params }: { params: Promise<{ id: string }> }) {
    return (
        <PermissionGuard permission="edit_assets">
            <EditFixedAssetContent params={params} />
        </PermissionGuard>
    );
}

function EditFixedAssetContent({ params }: { params: Promise<{ id: string }> }) {
    const router = useRouter();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { hasPermission } = usePermissions();
    const { id } = use(params);
    const assetId = parseInt(id);
    const [invoiceReceiptKind, setInvoiceReceiptKind] = useState<"invoice" | "receipt">("invoice");

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema) as Resolver<FormValues>,
        defaultValues: {
            asset_number: "",
            name: "",
            description: "",
            category: "",
            branch: "",
            acquisition_cost: 0,
            acquisition_date: new Date().toISOString().split("T")[0],
            useful_life_years: 5,
            salvage_value: 0,
            depreciation_method: "straight_line",
            status: "active",
            location: "",
            assigned_to: "none",
            manufacturer: "",
            model_number: "",
            serial_number: "",
        },
    });

    // Fetch existing asset data
    const { data: asset, isLoading: isLoadingAsset } = useQuery({
        queryKey: ["fixed-asset", assetId],
        queryFn: () => fixedAssetsApi.get(assetId),
        enabled: !isNaN(assetId),
    });

    const { data: categories } = useQuery({
        queryKey: ["asset-categories"],
        queryFn: () => fixedAssetsApi.categories.active(),
    });

    const { data: branchesResponse } = useQuery({
        queryKey: ["branches"],
        queryFn: () => branchesApi.list({ is_active: true }),
    });

    const { data: staffResponse } = useQuery({
        queryKey: ["staff-list"],
        queryFn: async () => (await hrApi.staff.list({ employment_status: "active" })).data,
    });


    const branches = Array.isArray(branchesResponse)
        ? branchesResponse
        : branchesResponse?.results || [];

    const staffMembers = Array.isArray(staffResponse)
        ? staffResponse
        : staffResponse?.results || [];

    // Pre-fill form when asset data is loaded
    useEffect(() => {
        if (asset) {
            form.reset({
                asset_number: asset.asset_number,
                name: asset.name,
                description: asset.description || "",
                category: asset.category.toString(),
                branch: asset.branch.toString(),
                acquisition_cost: parseFloat(asset.acquisition_cost.toString()),
                acquisition_date: asset.acquisition_date,
                useful_life_years: asset.useful_life_years,
                salvage_value: parseFloat((asset.salvage_value || 0).toString()),
                depreciation_method: asset.depreciation_method,
                status: asset.status,
                location: asset.location || "",
                assigned_to: asset.assigned_to?.toString() || "none",
                manufacturer: asset.manufacturer || "",
                model_number: asset.model_number || "",
                serial_number: asset.serial_number || "",
            });
        }
    }, [asset, form]);

    const updateMutation = useMutation({
        mutationFn: (data: FixedAssetUpdateData) => fixedAssetsApi.update(assetId, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["fixed-assets"] });
            queryClient.invalidateQueries({ queryKey: ["fixed-asset", assetId] });
            toast({
                title: "Success",
                description: "Fixed asset updated successfully",
            });
            router.push(`/fixed-assets/${assetId}`);
        },

        onError: (error: unknown) => {
            toast({
                title: "Error",
                description: getApiErrorMessage(error, "Failed to update fixed asset"),
                variant: "destructive",
            });
        },
    });

    const uploadDocMutation = useMutation({
        mutationFn: async (file: File) => {
            const fd = new FormData();
            fd.append(
                "title",
                `${invoiceReceiptKind === "invoice" ? "Invoice" : "Receipt"} — ${asset?.asset_number ?? assetId}`,
            );
            fd.append("file", file);
            fd.append("fixed_asset", String(assetId));
            fd.append("acquisition_document_kind", invoiceReceiptKind);
            return documentsApi.create(fd);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["fixed-asset", assetId] });
            toast({ title: "File uploaded" });
        },
        onError: (error: unknown) => {
            toast({
                title: "Upload failed",
                description: getApiErrorMessage(error, "Could not upload document"),
                variant: "destructive",
            });
        },
    });

    const deleteDocMutation = useMutation({
        mutationFn: (docId: number) => documentsApi.delete(docId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["fixed-asset", assetId] });
            toast({ title: "Document removed" });
        },
        onError: (error: unknown) => {
            toast({
                title: "Delete failed",
                description: getApiErrorMessage(error, "Could not delete document"),
                variant: "destructive",
            });
        },
    });

    function onSubmit(values: FormValues) {
        updateMutation.mutate({
            ...values,
            category: parseInt(values.category),
            branch: parseInt(values.branch),
            assigned_to: values.assigned_to && values.assigned_to !== "none" ? parseInt(values.assigned_to) : null,
        });
    }

    if (isLoadingAsset) {
        return <div className="text-sm text-muted-foreground">Loading asset details...</div>;
    }

    if (!asset) {
        return <div className="text-sm text-muted-foreground">Asset not found</div>;
    }

    const invoiceDocs = asset.invoice_receipt_documents ?? [];

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3">
                <Link href={`/fixed-assets/${assetId}`}>
                    <Button variant="ghost" size="sm">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back
                    </Button>
                </Link>
                <div>
                    <h1 className="text-xl font-semibold tracking-tight text-foreground">
                        Edit Fixed Asset
                    </h1>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Update details for asset {asset?.asset_number}
                    </p>
                </div>
            </div>

            <Card>
                <CardHeader className="px-4 py-3">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                        <FileText className="h-4 w-4" />
                        Invoice & receipt
                    </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-4">
                    {asset.source_acquisition_request_id ? (
                        <p className="text-xs text-muted-foreground">
                            Includes files from{" "}
                            <Link
                                href={`/fixed-assets/acquisitions/${asset.source_acquisition_request_id}`}
                                className="font-medium text-primary hover:underline"
                            >
                                acquisition {asset.source_acquisition_request_number}
                            </Link>
                            . You can add additional files linked to this asset below.
                        </p>
                    ) : (
                        <p className="text-xs text-muted-foreground">
                            Upload invoice or receipt files for this asset. Supported formats match document uploads
                            (PDF, images, Word, Excel).
                        </p>
                    )}
                    {invoiceDocs.length > 0 ? (
                        <ul className="divide-y rounded-md border border-border">
                            {invoiceDocs.map((d) => (
                                <li
                                    key={d.id}
                                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                                >
                                    <div className="min-w-0">
                                        <span className="font-medium capitalize">{d.acquisition_document_kind}</span>
                                        <span className="text-muted-foreground"> — </span>
                                        <span className="truncate">{d.original_filename}</span>
                                    </div>
                                    <PermissionButton
                                        permission="delete_documents"
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 text-destructive hover:text-destructive"
                                        disabled={deleteDocMutation.isPending}
                                        onClick={() => {
                                            if (confirm(`Remove "${d.original_filename}"?`)) {
                                                deleteDocMutation.mutate(d.id);
                                            }
                                        }}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </PermissionButton>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-sm text-muted-foreground">No files yet.</p>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                        <select
                            value={invoiceReceiptKind}
                            onChange={(e) => setInvoiceReceiptKind(e.target.value as "invoice" | "receipt")}
                            className="h-9 rounded-md border border-border bg-background px-3 text-xs"
                        >
                            <option value="invoice">Invoice</option>
                            <option value="receipt">Receipt</option>
                        </select>
                        {hasPermission("upload_documents") ? (
                            <label className="inline-flex h-9 cursor-pointer items-center rounded-md border border-border bg-background px-3 text-xs font-medium hover:bg-muted/60">
                                <input
                                    type="file"
                                    className="sr-only"
                                    accept=".pdf,.png,.jpg,.jpeg,.gif,.doc,.docx,.xls,.xlsx"
                                    disabled={uploadDocMutation.isPending}
                                    onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        if (f) uploadDocMutation.mutate(f);
                                        e.target.value = "";
                                    }}
                                />
                                {uploadDocMutation.isPending ? "Uploading…" : "Upload file"}
                            </label>
                        ) : (
                            <span className="text-xs text-muted-foreground">Upload requires document upload permission.</span>
                        )}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="px-4 py-3">
                    <CardTitle className="text-sm font-semibold">Asset Details</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <FormField
                                    control={form.control}
                                    name="asset_number"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Asset Number</FormLabel>
                                            <FormControl>
                                                <Input {...field} disabled />
                                            </FormControl>
                                                <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Asset Name</FormLabel>
                                            <FormControl>
                                                <Input placeholder="e.g. Office Laptop" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <FormField
                                    control={form.control}
                                    name="category"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Category</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select category" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {categories?.map((c: FixedAssetCategory) => (
                                                        <SelectItem key={c.id} value={c.id.toString()}>
                                                            {c.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="branch"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Branch</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select branch" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {branches.map((b: BranchOption) => (
                                                        <SelectItem key={b.id} value={b.id.toString()}>
                                                            {b.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <FormField
                                control={form.control}
                                name="description"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Description</FormLabel>
                                        <FormControl>
                                            <Textarea
                                                placeholder="Detailed description of the asset..."
                                                className="resize-none"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                                <FormField
                                    control={form.control}
                                    name="acquisition_cost"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Acquisition Cost</FormLabel>
                                            <FormControl>
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    {...field}
                                                    value={field.value ?? ""}
                                                    onChange={(e) => field.onChange(e.target.valueAsNumber)}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="salvage_value"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Salvage Value</FormLabel>
                                            <FormControl>
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    {...field}
                                                    value={field.value ?? ""}
                                                    onChange={(e) => field.onChange(e.target.valueAsNumber)}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="acquisition_date"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Acquisition Date</FormLabel>
                                            <FormControl>
                                                <Input type="date" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <FormField
                                    control={form.control}
                                    name="useful_life_years"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Useful Life (Years)</FormLabel>
                                            <FormControl>
                                                <Input
                                                    type="number"
                                                    {...field}
                                                    value={field.value ?? ""}
                                                    onChange={(e) => field.onChange(e.target.valueAsNumber)}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="depreciation_method"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Depreciation Method</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select method" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="straight_line">Straight Line</SelectItem>
                                                    <SelectItem value="declining_balance">Declining Balance</SelectItem>
                                                    <SelectItem value="units_of_production">Units of Production</SelectItem>
                                                    <SelectItem value="none">No Depreciation</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <FormField
                                    control={form.control}
                                    name="status"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Status</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select status" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="active">Active</SelectItem>
                                                    <SelectItem value="inactive">Inactive</SelectItem>
                                                    <SelectItem value="disposed">Disposed</SelectItem>
                                                    <SelectItem value="sold">Sold</SelectItem>
                                                    <SelectItem value="retired">Retired</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <FormField
                                    control={form.control}
                                    name="manufacturer"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Manufacturer</FormLabel>
                                            <FormControl>
                                                <Input placeholder="e.g. Dell, Toyota" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="model_number"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Model Number</FormLabel>
                                            <FormControl>
                                                <Input {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="serial_number"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Serial Number</FormLabel>
                                            <FormControl>
                                                <Input {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="location"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Physical Location</FormLabel>
                                            <FormControl>
                                                <Input placeholder="e.g. Building A, Room 101" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="assigned_to"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Assigned To</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select staff member" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="none">Unassigned</SelectItem>
                                                    {staffMembers.map((s: StaffOption) => (
                                                        <SelectItem key={s.id} value={s.id.toString()}>
                                                            {s.full_name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <div className="flex justify-end pt-4">
                                <Button type="submit" disabled={updateMutation.isPending}>
                                    <Save className="w-4 h-4 mr-2" />
                                    {updateMutation.isPending ? "Saving..." : "Save Changes"}
                                </Button>
                            </div>
                        </form>
                    </Form>
                </CardContent>
            </Card>
        </div>
    );
}
