"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fixedAssetsApi, type FixedAssetCategory, type FixedAssetCreateData } from "@/lib/api/fixed-assets";
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
    acquisition_cost: z.number().min(0.01, "Cost must be at least 0.01"),
    acquisition_date: z.string().min(1, "Acquisition date is required"),
    useful_life_years: z.number().min(1, "Useful life must be at least 1 year"),
    salvage_value: z.number().min(0, "Salvage value must be positive"),
    depreciation_method: z.string(),
    status: z.enum(["active", "inactive", "disposed", "sold", "retired"]),
    location: z.string().optional(),
    assigned_to: z.string().optional(),
    manufacturer: z.string().optional(),
    model_number: z.string().optional(),
    serial_number: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function NewFixedAssetPage() {
    return (
        <PermissionGuard permission="create_assets">
            <NewFixedAssetContent />
        </PermissionGuard>
    );
}

function NewFixedAssetContent() {
    const router = useRouter();
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
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
            status: "active" as const,
            location: "",
            assigned_to: "none",
            manufacturer: "",
            model_number: "",
            serial_number: "",
        },
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

    const branches = branchesResponse ?? [];

    const staffMembers = Array.isArray(staffResponse)
        ? staffResponse
        : staffResponse?.results || [];

    const createMutation = useMutation({
        mutationFn: (data: FixedAssetCreateData) => fixedAssetsApi.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["fixed-assets"] });
            toast({
                title: "Success",
                description: "Fixed asset created successfully",
            });
            router.push("/fixed-assets");
        },

        onError: (error: unknown) => {
            toast({
                title: "Error",
                description: getApiErrorMessage(error, "Failed to create fixed asset"),
                variant: "destructive",
            });
        },
    });

    function onSubmit(values: FormValues) {
        createMutation.mutate({
            ...values,
            category: parseInt(values.category),
            branch: parseInt(values.branch),
            assigned_to: values.assigned_to && values.assigned_to !== "none" ? parseInt(values.assigned_to) : null,
            depreciation_start_date: values.acquisition_date, // Default to acquisition date
        });
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
                        New Fixed Asset
                    </h1>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Register a new asset for tracking and depreciation
                    </p>
                </div>
            </div>

            <Card>
                <CardHeader className="px-4 py-3">
                    <CardTitle className="text-sm font-semibold">Asset Details</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit, () => {
                            toast({
                                title: "Validation Error",
                                description: "Please check the form for errors.",
                                variant: "destructive",
                            });
                        })} className="space-y-4">
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <FormField
                                    control={form.control}
                                    name="asset_number"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Asset Number</FormLabel>
                                            <FormControl>
                                                <Input placeholder="e.g. FA-2024-001" {...field} />
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
                                            {categories && categories.length === 0 && (
                                                <div className="text-[0.8rem] font-medium text-destructive mt-2 p-3 bg-destructive/10 rounded-md border border-destructive/20">
                                                    <p className="mb-1">No asset categories available</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        Please <Link href="/fixed-assets/categories" className="underline text-primary font-semibold">create a category</Link> first to continue.
                                                    </p>
                                                </div>
                                            )}
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
                                            {branches.length === 0 && (
                                                <p className="text-[0.8rem] font-medium text-destructive mt-2">
                                                    No active branches found. Please create a branch first.
                                                </p>
                                            )}
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
                                                    onChange={(e) => {
                                                        const val = parseFloat(e.target.value);
                                                        field.onChange(isNaN(val) || e.target.value === '' ? undefined : val);
                                                    }}
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
                                                    onChange={(e) => {
                                                        const val = parseFloat(e.target.value);
                                                        field.onChange(isNaN(val) || e.target.value === '' ? undefined : val);
                                                    }}
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
                                                    onChange={(e) => {
                                                        const val = parseInt(e.target.value);
                                                        field.onChange(isNaN(val) ? "" : val);
                                                    }}
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
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                                <Button type="submit" disabled={createMutation.isPending}>
                                    <Save className="w-4 h-4 mr-2" />
                                    {createMutation.isPending ? "Creating..." : "Create Asset"}
                                </Button>
                            </div>
                        </form>
                    </Form>
                </CardContent>
            </Card>
        </div>
    );
}
