"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fixedAssetsApi } from "@/lib/api/fixed-assets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Edit, PackageSearch, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useToast } from "@/lib/hooks/useToast";
import {
  Dialog,
  DialogContent,
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

type AssetCategoryForm = {
  name: string;
  description: string;
  default_useful_life_years: number;
  default_depreciation_method: string;
  is_active: boolean;
};

function getApiErrorMessage(error: unknown, fallback: string) {
  const data = (error as { response?: { data?: { detail?: string; error?: string; name?: string[] } } })?.response?.data;
  return data?.detail || data?.error || data?.name?.[0] || fallback;
}

const emptyForm: AssetCategoryForm = {
  name: "",
  description: "",
  default_useful_life_years: 5,
  default_depreciation_method: "straight_line",
  is_active: true,
};

const methodLabels: Record<string, string> = {
  straight_line: "Straight line",
  declining_balance: "Declining balance",
  double_declining: "Double declining",
  sum_of_years_digits: "Sum of years digits",
};

export default function AssetCategoriesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<AssetCategory | null>(null);
  const [formData, setFormData] = useState<AssetCategoryForm>(emptyForm);

  const { data: categoriesResponse, isLoading } = useQuery({
    queryKey: ["asset-categories-all"],
    queryFn: () => fixedAssetsApi.categories.list(),
  });

  const categories: AssetCategory[] = Array.isArray(categoriesResponse)
    ? categoriesResponse
    : categoriesResponse?.results || [];

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingCategory(null);
    setFormData(emptyForm);
  };

  const createMutation = useMutation({
    mutationFn: (data: AssetCategoryForm) => fixedAssetsApi.categories.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["asset-categories"] });
      queryClient.invalidateQueries({ queryKey: ["asset-categories-all"] });
      toast({ title: "Saved", description: "Asset category created" });
      closeDialog();
    },
    onError: (error: unknown) => {
      toast({ title: "Error", description: getApiErrorMessage(error, "Failed to create category"), variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: AssetCategoryForm }) => fixedAssetsApi.categories.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["asset-categories"] });
      queryClient.invalidateQueries({ queryKey: ["asset-categories-all"] });
      toast({ title: "Saved", description: "Asset category updated" });
      closeDialog();
    },
    onError: (error: unknown) => {
      toast({ title: "Error", description: getApiErrorMessage(error, "Failed to update category"), variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => fixedAssetsApi.categories.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["asset-categories"] });
      queryClient.invalidateQueries({ queryKey: ["asset-categories-all"] });
      toast({ title: "Deleted", description: "Asset category removed" });
    },
    onError: (error: unknown) => {
      toast({ title: "Error", description: getApiErrorMessage(error, "Failed to delete category"), variant: "destructive" });
    },
  });

  const openDialog = (category?: AssetCategory) => {
    setEditingCategory(category || null);
    setFormData(category ? {
      name: category.name,
      description: category.description || "",
      default_useful_life_years: category.default_useful_life_years || 5,
      default_depreciation_method: category.default_depreciation_method || "straight_line",
      is_active: category.is_active,
    } : emptyForm);
    setIsDialogOpen(true);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (editingCategory) {
      updateMutation.mutate({ id: editingCategory.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDelete = (category: AssetCategory) => {
    if (confirm(`Delete "${category.name}"?`)) {
      deleteMutation.mutate(category.id);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            <Link href="/fixed-assets" className="hover:text-primary">Fixed Assets</Link>
            <span>/</span>
            <span className="text-foreground">Asset Categories</span>
          </div>
          <h1 className="text-lg font-semibold text-foreground">Asset Categories</h1>
        </div>
        <PermissionGuard permission="manage_settings">
          <Button size="sm" onClick={() => openDialog()} className="h-8">
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Category
          </Button>
        </PermissionGuard>
      </div>

      <div className="p-4">
        <div className="overflow-hidden rounded-md border border-border bg-card">
          <div className="grid grid-cols-[1fr_96px_150px_90px_74px] border-b border-border bg-muted/60 px-3 py-2 text-xs font-semibold text-muted-foreground">
            <div>Category</div>
            <div>Life</div>
            <div>Method</div>
            <div>Status</div>
            <div className="text-right">Actions</div>
          </div>
          {isLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Loading categories...</div>
          ) : categories.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <PackageSearch className="mx-auto mb-2 h-5 w-5" />
              No asset categories yet.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {categories.map((category) => (
                <div key={category.id} className="grid grid-cols-[1fr_96px_150px_90px_74px] items-center gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">{category.name}</div>
                    {category.description ? (
                      <div className="truncate text-xs text-muted-foreground">{category.description}</div>
                    ) : null}
                  </div>
                  <div className="text-xs text-muted-foreground">{category.default_useful_life_years || "-"} years</div>
                  <div className="truncate text-xs text-muted-foreground">{methodLabels[category.default_depreciation_method] || category.default_depreciation_method}</div>
                  <div className="text-xs text-muted-foreground">{category.is_active ? "Active" : "Inactive"}</div>
                  <div className="flex justify-end gap-1">
                    <PermissionGuard permission="manage_settings">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openDialog(category)} title="Edit">
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-destructive" onClick={() => handleDelete(category)} title="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </PermissionGuard>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={(open) => (open ? setIsDialogOpen(true) : closeDialog())}>
        <DialogContent className="max-w-md">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{editingCategory ? "Edit Category" : "Add Category"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="category-name" className="text-xs">Name</Label>
                <Input id="category-name" value={formData.name} onChange={(event) => setFormData({ ...formData, name: event.target.value })} required className="h-8" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="category-description" className="text-xs">Description</Label>
                <Textarea id="category-description" value={formData.description} onChange={(event) => setFormData({ ...formData, description: event.target.value })} rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="life-years" className="text-xs">Useful Life</Label>
                  <Input
                    id="life-years"
                    type="number"
                    min={1}
                    value={formData.default_useful_life_years}
                    onChange={(event) => setFormData({ ...formData, default_useful_life_years: Number(event.target.value) || 1 })}
                    className="h-8"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Method</Label>
                  <Select value={formData.default_depreciation_method} onValueChange={(value) => setFormData({ ...formData, default_depreciation_method: value })}>
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="straight_line">Straight line</SelectItem>
                      <SelectItem value="declining_balance">Declining balance</SelectItem>
                      <SelectItem value="double_declining">Double declining</SelectItem>
                      <SelectItem value="sum_of_years_digits">Sum of years digits</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <Label htmlFor="category-active" className="text-xs">Active</Label>
                <Switch id="category-active" checked={formData.is_active} onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={closeDialog}>Cancel</Button>
              <Button type="submit" size="sm" disabled={createMutation.isPending || updateMutation.isPending || !formData.name.trim()}>
                {editingCategory ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
