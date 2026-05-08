"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { inventoryApi } from "@/lib/api/inventory";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
// eslint-disable-next-line @typescript-eslint/no-unused-vars 
import { Plus, Search, Edit, Trash2, FolderTree, MoreVertical, X, ChevronDown, Download, Upload } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/lib/hooks/useToast";
// eslint-disable-next-line @typescript-eslint/no-unused-vars 
import { AdvancedFilters, FilterOption, QuickFilter } from "@/components/ui/advanced-filters";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Stats Grid Component

const StatsGrid = ({ stats, loading }: { stats: any, loading: boolean }) => {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="border-none shadow-sm bg-muted/50">
          <CardContent className="p-4">
            <div className="h-4 w-24 bg-border rounded mb-2 animate-pulse" />
            <div className="h-8 w-16 bg-border rounded animate-pulse" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!stats) return null;


  const items = [
    { label: "Total Categories", value: stats.total_categories, icon: FolderTree, color: "text-primary" },
  ];

};

export default function PartCategoriesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");

  const [advancedFilters, setAdvancedFilters] = useState<Record<string, any>>({});

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["part-categories", searchQuery, advancedFilters],
    queryFn: () => inventoryApi.listCategories({
      search: searchQuery || undefined,
      // Assuming listCategories supports filtering by status if needed
      // is_active: advancedFilters.is_active === 'true' ? true : advancedFilters.is_active === 'false' ? false : undefined,
    }),
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["category-stats"],
    queryFn: () => inventoryApi.categoriesDashboardStats(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => inventoryApi.deleteCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["part-categories"] });
      queryClient.invalidateQueries({ queryKey: ["category-stats"] });
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars 
  const filterOptions: FilterOption[] = [
    // No filters defined yet for categories in original code, but we can add Status
    /*
    {
        key: "is_active",
        label: "Status",
        type: "select",
        options: [
            { value: "true", label: "Active" },
            { value: "false", label: "Inactive" },
        ],
    },
    */
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col space-y-4">
        <div className="flex justify-between items-center pt-2">
          <div>
            <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-1">
              <Link href="/dashboard" className="hover:text-primary transition-colors">Dashboard</Link>
              <span>/</span>
              <Link href="/inventory" className="hover:text-primary transition-colors">Inventory</Link>
              <span>/</span>
              <span className="text-foreground font-medium">Categories</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Part Categories
            </h1>
          </div>
        </div>

        <StatsGrid stats={stats} loading={statsLoading} />
      </div>

      {/* Unified Toolbar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card/50 p-1 rounded-lg">
        <div className="flex items-center gap-2 flex-1 w-full md:w-auto">
          <div className="relative flex-1 md:flex-none md:w-64">
            <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              type="text"
              placeholder="Search categories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-sm bg-muted border-none focus:ring-1 transition-all"
            />
          </div>
          {/* 
                 <AdvancedFilters
                    filters={filterOptions}
                    activeFilters={advancedFilters}
                    onFiltersChange={setAdvancedFilters}
                    onClear={() => setAdvancedFilters({})}
                    title="Filter Categories"
                />
                */}
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          {/* 
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-9 bg-card">
                            Actions
                            <ChevronDown className="w-3.5 h-3.5 ml-2" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                         <DropdownMenuItem disabled>
                            <Download className="w-4 h-4 mr-2" />
                            Export Excel
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
                */}
          <Link href="/inventory/categories/new">
            <Button size="sm" className="h-9 bg-primary hover:bg-primary/90 text-white shadow-sm">
              <Plus className="w-4 h-4 mr-2" />
              New Category
            </Button>
          </Link>
        </div>
      </div>

      {/* Categories Table */}
      <Card className="border-none shadow-sm overflow-hidden ring-1 ring-border">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6"><TableSkeleton rows={8} columns={6} /></div>
          ) : categories.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50 border-y border-border">
                  <TableRow className="hover:bg-transparent border-none">
                    <TableHead className="h-9 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4">Name</TableHead>
                    <TableHead className="h-9 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4">Full Path</TableHead>
                    <TableHead className="h-9 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4 text-center">Subcategories</TableHead>
                    <TableHead className="h-9 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4 text-center">Parts</TableHead>
                    <TableHead className="h-9 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4">Status</TableHead>
                    <TableHead className="h-9 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map((category) => (
                    <TableRow
                      key={category.id}
                      className="group hover:bg-muted/50 hover:bg-muted/50 border-b border-border cursor-pointer transition-colors"
                    >
                      <TableCell className="px-4 py-2">
                        <div className="flex items-center">
                          <FolderTree className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                          <span className="text-sm font-medium text-foreground">{category.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-2 text-xs text-muted-foreground font-mono">
                        {category.full_path || category.name}
                      </TableCell>
                      <TableCell className="px-4 py-2 text-center">
                        <Badge variant="secondary" className="bg-border text-muted-foreground hover:bg-muted">
                          {category.subcategories_count || 0}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-4 py-2 text-center">
                        <Badge variant="outline" className="border-border text-muted-foreground">
                          {category.parts_count || 0}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-4 py-2">
                        <Badge variant={category.is_active ? "success" : "secondary"} className="text-[10px] px-2 py-0">
                          {category.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-4 py-2 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-muted text-muted-foreground">
                              <MoreVertical className="w-3.5 h-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem asChild>
                              <Link href={`/inventory/categories/${category.id}/edit`} className="flex items-center cursor-pointer">
                                <Edit className="w-4 h-4 mr-2" />
                                Edit
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleDelete(category.id)}
                              className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12">
              <FolderTree className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground">No categories found</h3>
              <p className="text-muted-foreground max-w-sm mx-auto mt-1 mb-4">
                Get started by adding a new category to organize your parts.
              </p>
              <Link href="/inventory/categories/new">
                <Button variant="outline" size="sm">
                  <Plus className="w-3.5 h-3.5 mr-2" />
                  Add Category
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
