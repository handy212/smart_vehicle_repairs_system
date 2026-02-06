"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fixedAssetsApi } from "@/lib/api/fixed-assets";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Edit, Trash2, Tag, CheckCircle, XCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useToast } from "@/lib/hooks/useToast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PermissionGuard } from "@/components/auth/PermissionGuard";

interface AssetCategory {
    id: number;
    name: string;
    description?: string;
    default_useful_life_years: number;
    default_depreciation_method: string;
    is_active: boolean;
}

export default function AssetCategoriesPage() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<AssetCategory | null>(null);
    const [formData, setFormData] = useState({
        name: "",
        description: "",
        default_useful_life_years: 5,
        default_depreciation_method: "straight_line",
        is_active: true,
    });

    const { data: categoriesResponse, isLoading } = useQuery({
        queryKey: ["asset-categories-all"],
        queryFn: () => fixedAssetsApi.categories.list(),
    });

    // Handle both array and paginated response formats
    const categories = Array.isArray(categoriesResponse)
        ? categoriesResponse
        : categoriesResponse?.results || [];

    const createMutation = useMutation({
        mutationFn: (data: Partial<AssetCategory>) => fixedAssetsApi.categories.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["asset-categories"] });
            queryClient.invalidateQueries({ queryKey: ["asset-categories-all"] });
            toast({
                title: "Success",
                description: "Asset category created successfully",
            });
            handleCloseDialog();
        },
        onError: (error: any) => {
            toast({
                title: "Error",
                description: error.response?.data?.detail || "Failed to create category",
                variant: "destructive",
            });
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: number; data: Partial<AssetCategory> }) =>
            fixedAssetsApi.categories.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["asset-categories"] });
            queryClient.invalidateQueries({ queryKey: ["asset-categories-all"] });
            toast({
                title: "Success",
                description: "Asset category updated successfully",
            });
            handleCloseDialog();
        },
        onError: (error: any) => {
            toast({
                title: "Error",
                description: error.response?.data?.detail || "Failed to update category",
                variant: "destructive",
            });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: number) => fixedAssetsApi.categories.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["asset-categories"] });
            queryClient.invalidateQueries({ queryKey: ["asset-categories-all"] });
            toast({
                title: "Success",
                description: "Asset category deleted successfully",
            });
        },
        onError: (error: any) => {
            toast({
                title: "Error",
                description: error.response?.data?.detail || "Failed to delete category",
                variant: "destructive",
            });
        },
    });

    const handleOpenDialog = (category?: AssetCategory) => {
        if (category) {
            setEditingCategory(category);
            setFormData({
                name: category.name,
                description: category.description || "",
                default_useful_life_years: category.default_useful_life_years || 5,
                default_depreciation_method: category.default_depreciation_method || "straight_line",
                is_active: category.is_active,
            });
        } else {
            setEditingCategory(null);
            setFormData({
                name: "",
                description: "",
                default_useful_life_years: 5,
                default_depreciation_method: "straight_line",
                is_active: true,
            });
        }
        setIsDialogOpen(true);
    };

    const handleCloseDialog = () => {
        setIsDialogOpen(false);
        setEditingCategory(null);
        setFormData({
            name: "",
            description: "",
            default_useful_life_years: 5,
            default_depreciation_method: "straight_line",
            is_active: true,
        });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (editingCategory) {
            updateMutation.mutate({ id: editingCategory.id, data: formData });
        } else {
            createMutation.mutate(formData);
        }
    };

    const handleDelete = (category: AssetCategory) => {
        if (confirm(`Are you sure you want to delete "${category.name}"? This action cannot be undone.`)) {
            deleteMutation.mutate(category.id);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between px-4 pt-4">
                <div>
                    <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-1">
                        <Link href="/admin" className="hover:text-primary transition-colors">Admin</Link>
                        <span>/</span>
                        <Link href="/admin/settings" className="hover:text-primary transition-colors">Settings</Link>
                        <span>/</span>
                        <span className="text-foreground font-medium">Asset Categories</span>
                    </div>
                    <h1 className="text-xl font-bold text-foreground tracking-tight">Asset Categories</h1>
                </div>
                <PermissionGuard permission="manage_settings">
                    <Button size="sm" onClick={() => handleOpenDialog()} className="h-8">
                        <Plus className="w-3.5 h-3.5 mr-1.5" />
                        Add Category
                    </Button>
                </PermissionGuard>
            </div>

            <Card className="mx-4">
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <Tag className="h-5 w-5 text-primary" />
                        All Categories ({categories.length})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {categories.length > 0 ? (
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead>Default Life (Years)</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {categories.map((category: any) => (
                                        <TableRow key={category.id}>
                                            <TableCell className="font-medium">{category.name}</TableCell>
                                            <TableCell className="max-w-md">
                                                <p className="text-sm text-muted-foreground truncate">
                                                    {category.description || "No description"}
                                                </p>
                                            </TableCell>
                                            <TableCell>
                                                {category.default_useful_life_years || "-"}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={category.is_active ? "default" : "outline"}>
                                                    {category.is_active ? (
                                                        <>
                                                            <CheckCircle className="h-3 w-3 mr-1" />
                                                            Active
                                                        </>
                                                    ) : (
                                                        <>
                                                            <XCircle className="h-3 w-3 mr-1" />
                                                            Inactive
                                                        </>
                                                    )}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <PermissionGuard permission="manage_settings">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleOpenDialog(category)}
                                                        >
                                                            <Edit className="h-4 w-4" />
                                                        </Button>
                                                    </PermissionGuard>
                                                    <PermissionGuard permission="manage_settings">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleDelete(category)}
                                                        >
                                                            <Trash2 className="h-4 w-4 text-red-500" />
                                                        </Button>
                                                    </PermissionGuard>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    ) : (
                        <div className="text-center py-12 text-muted-foreground border rounded-lg bg-muted/5 border-dashed">
                            <Tag className="h-12 w-12 mx-auto mb-4 opacity-20" />
                            <h3 className="text-lg font-semibold mb-1 text-foreground">No Categories Yet</h3>
                            <p>Create your first asset category to get started.</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent>
                    <form onSubmit={handleSubmit}>
                        <DialogHeader>
                            <DialogTitle>{editingCategory ? "Edit Category" : "Add New Category"}</DialogTitle>
                            <DialogDescription>
                                {editingCategory
                                    ? "Update the details of this asset category."
                                    : "Add a new category for classifying fixed assets."}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Name *</Label>
                                <Input
                                    id="name"
                                    placeholder="e.g., Office Equipment"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="description">Description</Label>
                                <Textarea
                                    id="description"
                                    placeholder="Brief description of this category..."
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    rows={3}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="default_useful_life_years">Default Useful Life (Years)</Label>
                                <Input
                                    id="default_useful_life_years"
                                    type="number"
                                    placeholder="e.g., 5"
                                    value={formData.default_useful_life_years}
                                    onChange={(e) => {
                                        const val = parseInt(e.target.value);
                                        setFormData({ ...formData, default_useful_life_years: isNaN(val) ? 5 : val });
                                    }}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="default_depreciation_method">Default Depreciation Method</Label>
                                <Select
                                    value={formData.default_depreciation_method}
                                    onValueChange={(val) => setFormData({ ...formData, default_depreciation_method: val })}
                                >
                                    <SelectTrigger id="default_depreciation_method">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="straight_line">Straight Line</SelectItem>
                                        <SelectItem value="declining_balance">Declining Balance</SelectItem>
                                        <SelectItem value="double_declining">Double Declining</SelectItem>
                                        <SelectItem value="sum_of_years_digits">Sum of Years Digits</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex items-center space-x-2">
                                <Switch
                                    checked={formData.is_active}
                                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                                />
                                <Label htmlFor="is_active">Active</Label>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={handleCloseDialog}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                                {editingCategory ? "Update" : "Create"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
