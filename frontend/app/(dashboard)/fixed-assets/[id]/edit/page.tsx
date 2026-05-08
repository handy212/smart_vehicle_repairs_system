"use client";

import { useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fixedAssetsApi, type FixedAssetCategory, type FixedAssetUpdateData } from "@/lib/api/fixed-assets";
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
import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/lib/hooks/useToast";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { getApiErrorMessage } from "@/lib/api/errors";

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
    const { id } = use(params);
    const assetId = parseInt(id);

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
            router.push("/fixed-assets");
        },

        onError: (error: unknown) => {
            toast({
                title: "Error",
                description: getApiErrorMessage(error, "Failed to update fixed asset"),
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

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3">
                <Link href="/fixed-assets">
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
