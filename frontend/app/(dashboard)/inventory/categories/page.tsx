"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { inventoryApi, PartCategory } from "@/lib/api/inventory";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Edit, Trash2, FolderTree, MoreVertical } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/lib/hooks/useToast";

export default function PartCategoriesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [actionMenuOpen, setActionMenuOpen] = useState<number | null>(null);

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["part-categories", search],
    queryFn: () => inventoryApi.listCategories({ search: search || undefined }),
  });

  // NOTE: Category creation is handled on /inventory/categories/new (to match Suppliers UX).

  const deleteMutation = useMutation({
    mutationFn: (id: number) => inventoryApi.deleteCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["part-categories"] });
      queryClient.invalidateQueries({ queryKey: ["root-categories"] });
      toast({
        title: "Success",
        description: "Category deleted successfully",
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

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this category?")) {
      deleteMutation.mutate(id);
    }
  };

  // Dialog removed in favor of a dedicated New Category page.

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Part Categories</h1>
          <p className="mt-1 text-sm text-gray-500">
            Organize parts into categories and subcategories
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/inventory/categories/new">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              New Category
            </Button>
          </Link>
              </div>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <Input
              type="text"
              placeholder="Search categories..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Categories Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Categories ({categories.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {categories.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Full Path</TableHead>
                    <TableHead>Subcategories</TableHead>
                    <TableHead>Parts</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map((category) => (
                    <TableRow key={category.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center">
                          <FolderTree className="w-4 h-4 mr-2 text-gray-400" />
                          {category.name}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {category.full_path || category.name}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {category.subcategories_count || 0}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="default">
                          {category.parts_count || 0}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={category.is_active ? "success" : "secondary"}>
                          {category.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="relative flex justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setActionMenuOpen(actionMenuOpen === category.id ? null : category.id)}
                            className="h-8 w-8 p-0 dark:hover:bg-gray-700"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                          {actionMenuOpen === category.id && (
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                onClick={() => setActionMenuOpen(null)}
                              />
                              <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-20">
                                <div className="py-1">
                                  <Link
                                    href={`/inventory/categories/${category.id}/edit`}
                                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                    onClick={() => setActionMenuOpen(null)}
                                  >
                                    <Edit className="w-4 h-4" />
                                    Edit Category
                                  </Link>
                                  <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                                  <button
                                    onClick={() => {
                                      if (window.confirm(`Are you sure you want to delete category "${category.name}"? This action cannot be undone.`)) {
                                        handleDelete(category.id);
                                      }
                                      setActionMenuOpen(null);
                                    }}
                                    disabled={deleteMutation.isPending}
                                    className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                    Delete Category
                                  </button>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12">
              <FolderTree className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">No categories found.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

