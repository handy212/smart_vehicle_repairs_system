"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { inspectionsApi } from "@/lib/api/inspections";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ArrowLeft, Edit, Plus, Trash2, Settings, Folder, List } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/lib/hooks/useToast";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export default function TemplateDetailPage() {
  const params = useParams();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Parse templateId with validation
  const templateIdParam = typeof params.id === 'string' ? params.id : undefined;
  const templateId = templateIdParam ? parseInt(templateIdParam, 10) : NaN;
  const isValidId = !isNaN(templateId) && templateId > 0;

  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [showItemDialog, setShowItemDialog] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editingCategory, setEditingCategory] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editingItem, setEditingItem] = useState<any>(null);
  const [categoryName, setCategoryName] = useState("");
  const [categoryDescription, setCategoryDescription] = useState("");
  const [itemName, setItemName] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [itemType, setItemType] = useState<"pass_fail" | "measurement" | "percentage" | "rating" | "condition" | "text">("pass_fail");
  const [itemMeasurementUnit, setItemMeasurementUnit] = useState("");
  const [itemMinAcceptable, setItemMinAcceptable] = useState("");
  const [itemMaxAcceptable, setItemMaxAcceptable] = useState("");
  const [itemIsCritical, setItemIsCritical] = useState(false);

  const { data: template, isLoading } = useQuery({
    queryKey: ["template", templateId],
    queryFn: () => {
      if (!isValidId) {
        throw new Error("Invalid template ID");
      }
      return inspectionsApi.templates.get(templateId);
    },
    enabled: isValidId && !!templateIdParam,
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const updateTemplateMutation = useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: (data: any) => inspectionsApi.templates.update(templateId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["template", templateId] });
      toast({ title: "Success", description: "Template updated", variant: "success" });
    },
  });

  const addCategoryMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; order: number }) => {
      if (editingCategory) {
        return inspectionsApi.templates.updateCategory(templateId, editingCategory.id, data);
      }
      return inspectionsApi.templates.addCategory(templateId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["template", templateId] });
      setShowCategoryDialog(false);
      setCategoryName("");
      setCategoryDescription("");
      setEditingCategory(null);
      toast({
        title: "Success",
        description: editingCategory ? "Category updated" : "Category added",
        variant: "success",
      });
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to save category",
        variant: "destructive",
      });
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (categoryId: number) => {
      return inspectionsApi.templates.deleteCategory(templateId, categoryId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["template", templateId] });
      toast({ title: "Success", description: "Category deleted", variant: "success" });
    },
  });

  const addItemMutation = useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: async (data: any) => {
      if (editingItem) {
        return inspectionsApi.templates.updateItem(templateId, editingItem.id, data);
      }
      if (!selectedCategoryId) throw new Error("Category is required");
      return inspectionsApi.templates.addItem(templateId, selectedCategoryId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["template", templateId] });
      setShowItemDialog(false);
      setEditingItem(null);
      setItemName("");
      setItemDescription("");
      setSelectedCategoryId(null);
      toast({
        title: "Success",
        description: editingItem ? "Item updated" : "Item added",
        variant: "success",
      });
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to save item",
        variant: "destructive",
      });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: number) => {
      return inspectionsApi.templates.deleteItem(templateId, itemId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["template", templateId] });
      toast({ title: "Success", description: "Item deleted", variant: "success" });
    },
  });

  const handleSetDefault = async () => {
    try {
      await inspectionsApi.templates.setDefault(templateId);
      queryClient.invalidateQueries({ queryKey: ["template", templateId] });
      queryClient.invalidateQueries({ queryKey: ["inspection-templates"] });
      toast({ title: "Success", description: "Template set as default", variant: "success" });
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      toast({ title: "Error", description: "Failed to set default", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Template not found</p>
        <Link href="/inspections/templates">
          <Button variant="secondary" className="mt-4">
            Back to Templates
          </Button>
        </Link>
      </div>
    );
  }

  const categories = template.categories || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/inspections/templates">
            <Button variant="secondary" size="icon">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold text-foreground">{template.name}</h1>
              {template.is_default && (
                <Badge className="bg-orange-100 text-orange-800">Default</Badge>
              )}
              <Badge
                className={
                  template.is_active
                    ? "bg-green-100 text-green-800"
                    : "bg-muted text-foreground"
                }
              >
                {template.is_active ? "Active" : "Inactive"}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {template.description || "No description"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!template.is_default && (
            <Button variant="secondary" onClick={handleSetDefault}>
              Set as Default
            </Button>
          )}
          <Link href={`/inspections/templates/${templateId}/edit`}>
            <Button variant="secondary">
              <Edit className="w-4 h-4 mr-2" />
              Edit Template
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Categories</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{categories.length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Items</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{template.total_items || 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Created</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              {format(new Date(template.created_at), "MMM dd, yyyy")}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              by {template.created_by_name || "Unknown"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Template Structure</CardTitle>
          <Button
            onClick={() => {
              setEditingCategory(null);
              setCategoryName("");
              setCategoryDescription("");
              setShowCategoryDialog(true);
            }}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Category
          </Button>
        </CardHeader>
        <CardContent>
          {categories.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Folder className="mx-auto h-12 w-12 text-muted-foreground mb-2" />
              <p>No categories yet. Add your first category to get started.</p>
            </div>
          ) : (
            <Accordion type="multiple" className="w-full">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {categories.map((category: any) => (
                <AccordionItem key={category.id} value={`category-${category.id}`}>
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center justify-between w-full mr-4">
                      <div className="flex items-center gap-3">
                        <span className="font-semibold">{category.name}</span>
                        <Badge variant="secondary">{category.item_count || category.items?.length || 0} items</Badge>
                      </div>
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <div
                          className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors hover:bg-muted hover:text-foreground h-8 px-3 cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCategoryId(category.id);
                            setItemName("");
                            setItemDescription("");
                            setItemType("pass_fail");
                            setItemMeasurementUnit("");
                            setItemMinAcceptable("");
                            setItemMaxAcceptable("");
                            setItemIsCritical(false);
                            setEditingItem(null);
                            setShowItemDialog(true);
                          }}
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Add Item
                        </div>
                        <div
                          className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors hover:bg-muted hover:text-foreground h-8 w-8 p-0 cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingCategory(category);
                            setCategoryName(category.name);
                            setCategoryDescription(category.description || "");
                            setShowCategoryDialog(true);
                          }}
                        >
                          <Edit className="w-4 h-4" />
                        </div>
                        <div
                          className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors hover:bg-red-100 hover:text-red-900 h-8 w-8 p-0 cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Delete category "${category.name}"? This will also delete all items in this category.`)) {
                              deleteCategoryMutation.mutate(category.id);
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </div>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2 pt-2">
                      {category.items && category.items.length > 0 ? (
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        category.items.map((item: any) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between p-3 bg-muted rounded border border-border"
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{item.name}</span>
                                <Badge variant="secondary" className="text-xs">
                                  {item.item_type_display || item.item_type}
                                </Badge>
                                {item.is_critical && (
                                  <Badge className="bg-red-100 text-red-800 text-xs">
                                    Critical
                                  </Badge>
                                )}
                              </div>
                              {item.description && (
                                <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditingItem(item);
                                  setSelectedCategoryId(category.id);
                                  setItemName(item.name);
                                  setItemDescription(item.description || "");
                                  setItemType(item.item_type);
                                  setItemMeasurementUnit(item.measurement_unit || "");
                                  setItemMinAcceptable(item.min_acceptable?.toString() || "");
                                  setItemMaxAcceptable(item.max_acceptable?.toString() || "");
                                  setItemIsCritical(item.is_critical || false);
                                  setShowItemDialog(true);
                                }}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  if (confirm(`Delete item "${item.name}"?`)) {
                                    deleteItemMutation.mutate(item.id);
                                  }
                                }}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground py-2">No items in this category</p>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>

      {/* Add Category Dialog */}
      <Dialog open={showCategoryDialog} onOpenChange={setShowCategoryDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingCategory ? "Edit Category" : "Add Category"}
            </DialogTitle>
            <DialogDescription>
              {editingCategory
                ? "Update category details"
                : "Add a new category to this template"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="category-name">Category Name *</Label>
              <Input
                id="category-name"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder="e.g., Brakes, Engine, Electrical"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="category-description">Description</Label>
              <Textarea
                id="category-description"
                value={categoryDescription}
                onChange={(e) => setCategoryDescription(e.target.value)}
                placeholder="Category description..."
                rows={3}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setShowCategoryDialog(false);
                setEditingCategory(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!categoryName.trim()) {
                  toast({ title: "Error", description: "Category name is required", variant: "destructive" });
                  return;
                }
                addCategoryMutation.mutate({
                  name: categoryName,
                  description: categoryDescription,
                  order: categories.length,
                });
              }}
              disabled={addCategoryMutation.isPending}
            >
              {addCategoryMutation.isPending ? "Saving..." : editingCategory ? "Update" : "Add Category"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Item Dialog */}
      <Dialog open={showItemDialog} onOpenChange={setShowItemDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? "Edit Item" : "Add Inspection Item"}
            </DialogTitle>
            <DialogDescription>
              {editingItem
                ? "Update inspection item details"
                : "Add a new inspection item to this category"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="item-name">Item Name *</Label>
              <Input
                id="item-name"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder="e.g., Brake Pad Thickness"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="item-description">Description</Label>
              <Textarea
                id="item-description"
                value={itemDescription}
                onChange={(e) => setItemDescription(e.target.value)}
                placeholder="Item description..."
                rows={2}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="item-type">Item Type *</Label>
              <select
                id="item-type"
                value={itemType}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                onChange={(e) => setItemType(e.target.value as any)}
                className="w-full rounded-md border border-border px-3 py-2 text-sm mt-1"
              >
                <option value="pass_fail">Pass/Fail</option>
                <option value="measurement">Measurement</option>
                <option value="percentage">Percentage</option>
                <option value="rating">Rating (1-5)</option>
                <option value="condition">Condition Assessment</option>
                <option value="text">Text Note</option>
              </select>
            </div>

            {itemType === "measurement" && (
              <>
                <div>
                  <Label htmlFor="measurement-unit">Measurement Unit</Label>
                  <Input
                    id="measurement-unit"
                    value={itemMeasurementUnit}
                    onChange={(e) => setItemMeasurementUnit(e.target.value)}
                    placeholder="e.g., mm, psi, %"
                    className="mt-1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="min-acceptable">Min Acceptable</Label>
                    <Input
                      id="min-acceptable"
                      type="number"
                      value={itemMinAcceptable}
                      onChange={(e) => setItemMinAcceptable(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="max-acceptable">Max Acceptable</Label>
                    <Input
                      id="max-acceptable"
                      type="number"
                      value={itemMaxAcceptable}
                      onChange={(e) => setItemMaxAcceptable(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="is-critical"
                checked={itemIsCritical}
                onChange={(e) => setItemIsCritical(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              <Label htmlFor="is-critical" className="cursor-pointer">
                Critical Safety Item
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setShowItemDialog(false);
                setEditingItem(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!itemName.trim()) {
                  toast({ title: "Error", description: "Item name is required", variant: "destructive" });
                  return;
                }
                if (!editingItem && !selectedCategoryId) {
                  toast({ title: "Error", description: "Category is required", variant: "destructive" });
                  return;
                }

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const itemData: any = {
                  name: itemName,
                  description: itemDescription || "",
                  item_type: itemType,
                  is_critical: itemIsCritical,
                };

                if (itemType === "measurement") {
                  itemData.measurement_unit = itemMeasurementUnit || "";
                  if (itemMinAcceptable) itemData.min_acceptable = parseFloat(itemMinAcceptable);
                  if (itemMaxAcceptable) itemData.max_acceptable = parseFloat(itemMaxAcceptable);
                }

                addItemMutation.mutate(itemData);
              }}
              disabled={addItemMutation.isPending}
            >
              {editingItem ? "Update" : "Add Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

