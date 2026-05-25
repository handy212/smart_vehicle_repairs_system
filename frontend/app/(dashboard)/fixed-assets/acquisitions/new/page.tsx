"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fixedAssetsApi } from "@/lib/api/fixed-assets";
import { branchesApi } from "@/lib/api/branches";
import { inventoryApi } from "@/lib/api/inventory";
import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/lib/hooks/useToast";
import { getApiErrorMessage } from "@/lib/api/errors";

export default function NewAcquisitionPage() {
    return (
        <PermissionPageGuard permission="create_assets">
            <NewAcquisitionContent />
        </PermissionPageGuard>
    );
}

function NewAcquisitionContent() {
    const router = useRouter();
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [proposedAssetName, setProposedAssetName] = useState("");
    const [categoryId, setCategoryId] = useState<string>("");
    const [branchId, setBranchId] = useState<string>("");
    const [supplierId, setSupplierId] = useState<string>("none");
    const [expectedCost, setExpectedCost] = useState("");
    const [salvageValue, setSalvageValue] = useState("0");
    const [depreciationMethod, setDepreciationMethod] = useState<string>("");
    const [usefulLife, setUsefulLife] = useState<string>("");

    const { data: categories } = useQuery({
        queryKey: ["asset-categories"],
        queryFn: () => fixedAssetsApi.categories.active(),
    });

    const { data: branchesResponse } = useQuery({
        queryKey: ["branches"],
        queryFn: () => branchesApi.list({ is_active: true }),
    });

    const { data: suppliersResponse } = useQuery({
        queryKey: ["suppliers-active-acq"],
        queryFn: () => inventoryApi.listSuppliers({ is_active: true }),
    });

    const branches = branchesResponse ?? [];
    const suppliers = Array.isArray(suppliersResponse)
        ? suppliersResponse
        : suppliersResponse?.results || [];

    const createMutation = useMutation({
        mutationFn: () =>
            fixedAssetsApi.acquisitions.create({
                title: title.trim(),
                description: description.trim() || undefined,
                proposed_asset_name: proposedAssetName.trim(),
                category: Number(categoryId),
                branch: Number(branchId),
                supplier: supplierId === "none" ? null : Number(supplierId),
                expected_acquisition_cost: Number(expectedCost),
                salvage_value: Number(salvageValue || "0"),
                depreciation_method: depreciationMethod || null,
                useful_life_years: usefulLife ? Number(usefulLife) : null,
            }),
        onSuccess: (created) => {
            queryClient.invalidateQueries({ queryKey: ["fixed-assets-acquisitions"] });
            toast({ title: "Draft saved", description: created.request_number });
            router.push(`/fixed-assets/acquisitions/${created.id}`);
        },
        onError: (err: unknown) => {
            toast({
                title: "Error",
                description: getApiErrorMessage(err, "Could not create request"),
                variant: "destructive",
            });
        },
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim() || !proposedAssetName.trim() || !categoryId || !branchId) {
            toast({ title: "Missing fields", description: "Fill required fields.", variant: "destructive" });
            return;
        }
        const cost = Number(expectedCost);
        if (!Number.isFinite(cost) || cost <= 0) {
            toast({ title: "Invalid cost", description: "Expected acquisition cost must be > 0.", variant: "destructive" });
            return;
        }
        createMutation.mutate();
    };

    return (
        <div className="flex-1 overflow-auto p-4 max-w-2xl mx-auto space-y-4">
            <div className="flex items-center gap-3">
                <Link href="/fixed-assets/acquisitions">
                    <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-lg font-semibold">New acquisition request</h1>
                    <p className="text-xs text-muted-foreground">Creates a draft — submit for approval from the detail page.</p>
                </div>
            </div>

            <form onSubmit={handleSubmit}>
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Request details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-1.5">
                            <Label className="text-xs">Title *</Label>
                            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-9" required />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs">Description</Label>
                            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs">Proposed asset name *</Label>
                            <Input
                                value={proposedAssetName}
                                onChange={(e) => setProposedAssetName(e.target.value)}
                                className="h-9"
                                required
                            />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs">Category *</Label>
                                <Select value={categoryId} onValueChange={setCategoryId}>
                                    <SelectTrigger className="h-9">
                                        <SelectValue placeholder="Select category" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {categories?.map((c) => (
                                            <SelectItem key={c.id} value={String(c.id)}>
                                                {c.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">Branch *</Label>
                                <Select value={branchId} onValueChange={setBranchId}>
                                    <SelectTrigger className="h-9">
                                        <SelectValue placeholder="Select branch" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {branches.map((b: { id: number; name: string }) => (
                                            <SelectItem key={b.id} value={String(b.id)}>
                                                {b.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs">Supplier (optional)</Label>
                            <Select value={supplierId} onValueChange={setSupplierId}>
                                <SelectTrigger className="h-9">
                                    <SelectValue placeholder="None" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">None</SelectItem>
                                    {suppliers.map((s: { id: number; name: string }) => (
                                        <SelectItem key={s.id} value={String(s.id)}>
                                            {s.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs">Expected acquisition cost *</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    min={0.01}
                                    value={expectedCost}
                                    onChange={(e) => setExpectedCost(e.target.value)}
                                    className="h-9"
                                    required
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">Salvage value</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    min={0}
                                    value={salvageValue}
                                    onChange={(e) => setSalvageValue(e.target.value)}
                                    className="h-9"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs">Depreciation method override</Label>
                                <Select
                                    value={
                                        depreciationMethod === ""
                                            ? "default"
                                            : depreciationMethod === "none"
                                              ? "none_dep"
                                              : depreciationMethod
                                    }
                                    onValueChange={(v) => {
                                        if (v === "default") setDepreciationMethod("");
                                        else if (v === "none_dep") setDepreciationMethod("none");
                                        else setDepreciationMethod(v);
                                    }}
                                >
                                    <SelectTrigger className="h-9">
                                        <SelectValue placeholder="Use category default" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="default">Use category default</SelectItem>
                                        <SelectItem value="straight_line">Straight line</SelectItem>
                                        <SelectItem value="declining_balance">Declining balance</SelectItem>
                                        <SelectItem value="units_of_production">Units of production</SelectItem>
                                        <SelectItem value="none_dep">No depreciation</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">Useful life (years) override</Label>
                                <Input
                                    type="number"
                                    min={1}
                                    placeholder="Category default"
                                    value={usefulLife}
                                    onChange={(e) => setUsefulLife(e.target.value)}
                                    className="h-9"
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                            <Link href="/fixed-assets/acquisitions">
                                <Button type="button" variant="outline" size="sm">
                                    Cancel
                                </Button>
                            </Link>
                            <Button type="submit" size="sm" disabled={createMutation.isPending}>
                                Save draft
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </form>
        </div>
    );
}
