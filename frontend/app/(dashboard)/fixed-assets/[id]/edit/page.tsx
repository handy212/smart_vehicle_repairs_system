"use client";

import { useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fixedAssetsApi } from "@/lib/api/fixed-assets";
import { branchesApi } from "@/lib/api/branches";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Select } from "@/components/ui/select";
import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/lib/hooks/useToast";
import { PermissionGuard } from "@/components/auth/PermissionGuard";

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
        resolver: zodResolver(formSchema) as any,
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

    const branches = Array.isArray(branchesResponse)
        ? branchesResponse
        : branchesResponse?.results || [];

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
                manufacturer: asset.manufacturer || "",
                model_number: asset.model_number || "",
                serial_number: asset.serial_number || "",
            });
        }
    }, [asset, form]);

    const updateMutation = useMutation({
        mutationFn: (data: any) => fixedAssetsApi.update(assetId, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["fixed-assets"] });
            queryClient.invalidateQueries({ queryKey: ["fixed-asset", assetId] });
            toast({
                title: "Success",
                description: "Fixed asset updated successfully",
            });
            router.push("/fixed-assets");
        },
        onError: (error: any) => {
            toast({
                title: "Error",
                description: error.response?.data?.detail || "Failed to update fixed asset",
                variant: "destructive",
            });
        },
    });

    function onSubmit(values: FormValues) {
        updateMutation.mutate({
            ...values,
            category: parseInt(values.category),
            branch: parseInt(values.branch),
        });
    }

    if (isLoadingAsset) {
        return <div className="p-6">Loading asset details...</div>;
    }

    return (
        <div className="space-y-6 p-6 max-w-4xl mx-auto">
            <div className="flex items-center space-x-4">
                <Link href="/fixed-assets">
                    <Button variant="secondary" size="sm">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back
                    </Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white">
                        Edit Fixed Asset
                    </h1>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        Update details for asset {asset?.asset_number}
                    </p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Asset Details</CardTitle>
                </CardHeader>
                <CardContent>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <FormField
                                    control={form.control}
                                    name="asset_number"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Asset Number</FormLabel>
                                            <FormControl>
                                                <Input {...field} disabled />
                                            </FormControl>
                                            <FormDescription>
                                                Asset number cannot be changed
                                            </FormDescription>
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
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <FormField
                                    control={form.control}
                                    name="category"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Category</FormLabel>
                                            <FormControl>
                                                <Select {...field}>
                                                    <option value="">Select category</option>
                                                    {categories?.map((c) => (
                                                        <option key={c.id} value={c.id.toString()}>
                                                            {c.name}
                                                        </option>
                                                    ))}
                                                </Select>
                                            </FormControl>
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
                                            <FormControl>
                                                <Select {...field}>
                                                    <option value="">Select branch</option>
                                                    {branches.map((b) => (
                                                        <option key={b.id} value={b.id.toString()}>
                                                            {b.name}
                                                        </option>
                                                    ))}
                                                </Select>
                                            </FormControl>
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

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                                            <FormDescription>
                                                Expected number of years the asset will be useful
                                            </FormDescription>
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
                                            <FormControl>
                                                <Select {...field}>
                                                    <option value="straight_line">Straight Line</option>
                                                    <option value="declining_balance">Declining Balance</option>
                                                    <option value="double_declining">Double Declining</option>
                                                    <option value="sum_of_years_digits">Sum of Years Digits</option>
                                                </Select>
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <FormField
                                    control={form.control}
                                    name="status"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Status</FormLabel>
                                            <FormControl>
                                                <Select {...field}>
                                                    <option value="active">Active</option>
                                                    <option value="inactive">Inactive</option>
                                                    <option value="disposed">Disposed</option>
                                                    <option value="sold">Sold</option>
                                                    <option value="retired">Retired</option>
                                                </Select>
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
