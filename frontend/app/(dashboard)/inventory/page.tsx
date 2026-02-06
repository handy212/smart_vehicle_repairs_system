"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { inventoryApi } from "@/lib/api/inventory";
import { branchesApi } from "@/lib/api/branches";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Package, AlertTriangle, Trash2, Download, Upload, MoreVertical, Eye, Edit, Search, X, ChevronDown, DollarSign } from "lucide-react";
import { ImportDialog } from "@/components/ui/import-dialog";
import { downloadPartTemplate } from "@/lib/utils/import-templates";
import { exportPartsForImport } from "@/lib/utils/export-templates";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/lib/hooks/useToast";
import { exportToCSV } from "@/lib/utils/export";
import { useBulkSelection } from "@/lib/hooks/useBulkSelection";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { AdvancedFilters, FilterOption, QuickFilter } from "@/components/ui/advanced-filters";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Stats Grid Component
// Stats Grid Component
const StatsGrid = ({ stats, loading }: { stats: any, loading: boolean }) => {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="shadow-sm border bg-muted/50">
            <CardContent className="p-3">
              <div className="h-4 w-20 bg-border rounded mb-2 animate-pulse" />
              <div className="h-6 w-12 bg-border rounded animate-pulse" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const items = [
    { label: "Total Parts", value: stats.total_parts, color: "text-primary" },
    { label: "Low Stock", value: stats.low_stock, color: "text-amber-600" },
    { label: "Out of Stock", value: stats.out_of_stock, color: "text-red-600" },
    { label: "Total Value", value: stats.total_value, isCurrency: true, color: "text-success" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      {items.map((item, index) => (
        <Card key={index} className="shadow-sm border bg-card">
          <CardContent className="p-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{item.label}</span>
            <span className={`text-lg font-bold ${item.color || 'text-foreground'} text-foreground`}>
              {item.isCurrency ? <CurrencyValue value={item.value} /> : item.value?.toLocaleString() || 0}
            </span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

// Helper component for currency to use the hook correctly
const CurrencyValue = ({ value }: { value: any }) => {
  const { formatCurrency } = useCurrency();
  return <>{formatCurrency(value)}</>;
};

export default function InventoryPage() {
  const { formatCurrency } = useCurrency();
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();

  // Unified Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [advancedFilters, setAdvancedFilters] = useState<Record<string, any>>({});

  // Fetch Lists
  const { data, isLoading, error } = useQuery({
    queryKey: ["inventory", page, searchQuery, advancedFilters],
    queryFn: () =>
      inventoryApi.list({
        page,
        search: searchQuery || undefined,
        category: advancedFilters.category,
        is_active: advancedFilters.is_active === 'true' ? true : advancedFilters.is_active === 'false' ? false : undefined,
        low_stock: advancedFilters.stock_status === 'low_stock' ? true : undefined,
        out_of_stock: advancedFilters.stock_status === 'out_of_stock' ? true : undefined,
        needs_reorder: advancedFilters.stock_status === 'needs_reorder' ? true : undefined,
        branch: advancedFilters.branch ? parseInt(advancedFilters.branch) : undefined,
      }),
  });

  // Fetch Stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["inventory-stats"],
    queryFn: () => inventoryApi.partsDashboardStats(),
  });

  // Fetch Branches for filter
  const { data: branchesData } = useQuery({
    queryKey: ["branches-active"],
    queryFn: () => branchesApi.list({ is_active: true }),
  });

  const branches = Array.isArray(branchesData) ? branchesData : branchesData?.results || [];

  const parts = data?.results || [];
  const bulkSelection = useBulkSelection(parts);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => inventoryApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-stats"] });
      toast({ title: "Success", description: "Part deleted successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to delete part",
        variant: "destructive",
      });
    },
  });

  const handleDelete = (part: any) => {
    if (confirm(`Are you sure you want to delete part "${part.name}" (${part.part_number})? This action cannot be undone.`)) {
      deleteMutation.mutate(part.id);
    }
  };

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await Promise.all(ids.map((id) => inventoryApi.delete(id)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-stats"] });
      bulkSelection.clearSelection();
      toast({ title: "Success", description: `${bulkSelection.selectedCount} parts deleted successfully` });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to delete parts",
        variant: "destructive",
      });
    },
  });

  const handleBulkDelete = () => {
    if (confirm(`Are you sure you want to delete ${bulkSelection.selectedCount} part(s)? This action cannot be undone.`)) {
      bulkDeleteMutation.mutate(bulkSelection.selectedIds);
    }
  };

  const handleExport = () => {
    if (!data?.results || data.results.length === 0) {
      toast({ title: "No Data", description: "No parts to export", variant: "destructive" });
      return;
    }
    exportToCSV(data.results, "inventory", [
      { key: "part_number", label: "Part Number" },
      { key: "name", label: "Name" },
      { key: "category", label: "Category" },
      { key: "quantity_in_stock", label: "Stock" },
      { key: "minimum_stock", label: "Min Stock" },
      { key: "cost_price", label: "Cost Price" },
      { key: "selling_price", label: "Selling Price" },
      { key: "is_active", label: "Status" },
    ]);
    toast({ title: "Success", description: "Inventory exported successfully" });
  };

  const isLowStock = (part: any) => part.quantity_in_stock <= part.minimum_stock;

  // Filter Options
  const quickFilters: QuickFilter[] = [
    { label: "All Parts", value: "all", filters: { stock_status: null } },
    { label: "Low Stock", value: "low_stock", filters: { stock_status: "low_stock" } },
    { label: "Out of Stock", value: "out_of_stock", filters: { stock_status: "out_of_stock" } },
    { label: "Needs Reorder", value: "needs_reorder", filters: { stock_status: "needs_reorder" } },
  ];

  const filterOptions: FilterOption[] = [
    {
      key: "is_active",
      label: "Status",
      type: "select",
      options: [
        { value: "true", label: "Active" },
        { value: "false", label: "Inactive" },
      ],
    },
    {
      key: "branch",
      label: "Branch",
      type: "select",
      options: branches.map(b => ({ value: String(b.id), label: b.name })),
    },
  ];

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
        Error loading inventory. Please try again.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Stats */}
      <div className="flex flex-col space-y-4">
        <div className="flex justify-between items-center pt-2">
          <div>
            <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-1">
              <Link href="/dashboard" className="hover:text-primary transition-colors">Dashboard</Link>
              <span>/</span>
              <span className="text-foreground font-medium">Inventory</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Inventory Parts
            </h1>
          </div>
        </div>

        <StatsGrid stats={stats} loading={statsLoading} />
      </div>

      {/* Unified Toolbar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card/50 p-1 rounded-lg">
        <div className="flex items-center gap-2 flex-1 w-full md:w-auto">
          {/* Search */}
          <div className="relative flex-1 md:flex-none md:w-64">
            <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              type="text"
              placeholder="Search parts..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="pl-9 h-9 text-sm bg-muted border-none focus:ring-1 transition-all"
            />
          </div>

          {/* Advanced Filters */}
          <AdvancedFilters
            filters={filterOptions}
            quickFilters={quickFilters}
            activeFilters={advancedFilters}
            onFiltersChange={(filters) => {
              setAdvancedFilters(filters);
              setPage(1);
            }}
            onClear={() => {
              setAdvancedFilters({});
              setPage(1);
            }}
            title="Filter Inventory"
          />

          {/* Clear Filters (Icon only) */}
          {(searchQuery || Object.keys(advancedFilters).length > 0) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchQuery("");
                setAdvancedFilters({});
                setPage(1);
              }}
              className="h-9 w-9 p-0 text-muted-foreground hover:text-red-600"
              title="Clear all filters"
            >
              <X className="w-4 h-4" />
            </Button>
          )}

          {/* Active Filter Badges */}
          <div className="hidden lg:flex flex-wrap items-center gap-1.5 ml-2">
            {Object.entries(advancedFilters).map(([key, value]) => {
              if (!value || (typeof value === 'string' && value === '') || value === null) return null;
              // Filter out internal filter keys like stock_status if they shouldn't be badges? 
              // Or format them nicely.
              // For stock_status, map value to label
              let displayLabel = key;
              let displayValue = String(value);

              const filter = filterOptions.find((f) => f.key === key);
              if (filter) {
                displayLabel = filter.label;
                if (filter.type === 'select') {
                  const option = filter.options?.find(o => o.value === String(value));
                  if (option) displayValue = option.label;
                }
              } else if (key === 'stock_status') {
                displayLabel = "Stock Status";
                const qFilter = quickFilters.find(q => q.filters.stock_status === value);
                if (qFilter) displayValue = qFilter.label;
              }

              return (
                <Badge key={key} variant="secondary" className="text-[10px] px-1.5 h-6 flex items-center gap-1 bg-border text-muted-foreground font-normal">
                  {displayLabel}: {displayValue}
                  <X
                    className="w-3 h-3 cursor-pointer hover:text-red-500"
                    onClick={() => {
                      const newFilters = { ...advancedFilters };
                      delete newFilters[key];
                      setAdvancedFilters(newFilters);
                      setPage(1);
                    }}
                  />
                </Badge>
              );
            })}
            {/* Bulk Actions Badge if selection active */}
            {bulkSelection.selectedCount > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 h-6 flex items-center gap-1 bg-primary/10 text-primary border-orange-100 font-normal">
                {bulkSelection.selectedCount} selected
                <X
                  className="w-3 h-3 cursor-pointer hover:text-orange-900"
                  onClick={bulkSelection.clearSelection}
                />
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          {bulkSelection.selectedCount > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleBulkDelete}
              className="h-9 text-xs"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Delete ({bulkSelection.selectedCount})
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 bg-card">
                Actions
                <ChevronDown className="w-3.5 h-3.5 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <PermissionGuard permission="import_inventory">
                <DropdownMenuItem onClick={() => setShowImportDialog(true)}>
                  <Upload className="w-4 h-4 mr-2" />
                  Import CSV
                </DropdownMenuItem>
              </PermissionGuard>
              <PermissionGuard permission="export_inventory">
                <DropdownMenuItem onClick={handleExport} disabled={!data?.results || data.results.length === 0}>
                  <Download className="w-4 h-4 mr-2" />
                  Export CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { if (data?.results) exportPartsForImport(data.results); }} disabled={!data?.results || data.results.length === 0}>
                  <Download className="w-4 h-4 mr-2" />
                  Export for Import
                </DropdownMenuItem>
              </PermissionGuard>
            </DropdownMenuContent>
          </DropdownMenu>

          <PermissionGuard permission="create_parts">
            <Link href="/inventory/new">
              <Button size="sm" className="h-9 bg-primary hover:bg-primary/90 text-white shadow-sm">
                <Plus className="w-4 h-4 mr-2" />
                Add Part
              </Button>
            </Link>
          </PermissionGuard>
        </div>
      </div>

      {/* Main Content Card */}
      <Card className="border-none shadow-sm overflow-hidden ring-1 ring-gray-200 dark:ring-gray-800">
        <div className="relative">
          {isLoading ? (
            <div className="p-6"><TableSkeleton rows={8} columns={8} /></div>
          ) : (data?.results || []).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Package className="w-12 h-12 text-gray-300 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-foreground">No parts found</h3>
              <p className="text-muted-foreground max-w-sm mt-1 mb-4">
                {searchQuery || Object.keys(advancedFilters).length > 0
                  ? "Try adjusting your search terms or filters."
                  : "Get started by adding a new part to your inventory."}
              </p>
              <PermissionGuard permission="create_parts">
                <Link href="/inventory/new">
                  <Button size="sm">
                    <Plus className="w-4 h-4 mr-2" />
                    Add New Part
                  </Button>
                </Link>
              </PermissionGuard>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50 border-y border-border">
                  <TableRow className="hover:bg-transparent border-none">
                    <TableHead className="w-10 px-4">
                      <input
                        type="checkbox"
                        checked={bulkSelection.isAllSelected}
                        ref={(input) => { if (input) input.indeterminate = bulkSelection.isIndeterminate; }}
                        onChange={bulkSelection.toggleSelectAll}
                        className="h-3.5 w-3.5 text-primary focus:ring-primary border-border rounded cursor-pointer"
                      />
                    </TableHead>
                    <TableHead className="h-9 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4">Part #</TableHead>
                    <TableHead className="h-9 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4">Name</TableHead>
                    <TableHead className="h-9 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4">Category</TableHead>
                    <TableHead className="h-9 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4 text-center">Stock</TableHead>
                    <TableHead className="h-9 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4 text-right">Cost</TableHead>
                    <TableHead className="h-9 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4 text-right">Sell</TableHead>
                    <TableHead className="h-9 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4">Status</TableHead>
                    <TableHead className="h-9 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-4 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parts.map((part) => (
                    <TableRow
                      key={part.id}
                      className="group hover:bg-muted/50 hover:bg-muted/50 border-b border-border cursor-pointer transition-colors"
                      onClick={() => router.push(`/inventory/${part.id}`)}
                    >
                      <TableCell className="px-4 py-2 w-10" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={bulkSelection.isSelected(part.id)}
                          onChange={() => bulkSelection.toggleSelection(part.id)}
                          className="h-3.5 w-3.5 text-primary focus:ring-primary border-border rounded cursor-pointer"
                        />
                      </TableCell>
                      <TableCell className="px-4 py-2 font-mono text-xs font-medium text-card-foreground">
                        {part.part_number || "-"}
                      </TableCell>
                      <TableCell className="px-4 py-2">
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium text-foreground truncate max-w-[200px]">{part.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-2 text-xs text-muted-foreground capitalize">
                        {typeof part.category === 'object' && part.category !== null ? part.category.name : part.category || "-"}
                      </TableCell>
                      <TableCell className="px-4 py-2 text-center">
                        <div className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${isLowStock(part)
                          ? part.quantity_in_stock === 0
                            ? "bg-red-50 text-red-700 border-red-100"
                            : "bg-amber-50 text-amber-700 border-amber-100"
                          : "bg-muted text-foreground border-border"
                          }`}>
                          {part.quantity_in_stock}
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-2 text-xs text-muted-foreground text-right font-mono">
                        {part.cost_price ? formatCurrency(parseFloat(part.cost_price)) : "-"}
                      </TableCell>
                      <TableCell className="px-4 py-2 text-xs text-muted-foreground text-right font-mono">
                        {part.selling_price ? formatCurrency(parseFloat(part.selling_price)) : "-"}
                      </TableCell>
                      <TableCell className="px-4 py-2">
                        <Badge variant="outline" className={`text-[10px] px-2 py-0  ${part.is_active
                          ? "text-emerald-600 border-emerald-200 bg-emerald-50"
                          : "text-muted-foreground border-border bg-muted"
                          }`}>
                          {part.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-4 py-2 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" onClick={(e) => e.stopPropagation()} className="h-7 w-7 p-0 hover:bg-gray-100 text-muted-foreground">
                              <MoreVertical className="w-3.5 h-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem asChild>
                              <Link href={`/inventory/${part.id}`} className="flex items-center cursor-pointer">
                                <Eye className="w-4 h-4 mr-2" />
                                View Details
                              </Link>
                            </DropdownMenuItem>
                            <PermissionGuard permission="edit_parts">
                              <DropdownMenuItem asChild>
                                <Link href={`/inventory/${part.id}/edit`} className="flex items-center cursor-pointer">
                                  <Edit className="w-4 h-4 mr-2" />
                                  Edit Part
                                </Link>
                              </DropdownMenuItem>
                            </PermissionGuard>
                            <DropdownMenuSeparator />
                            <PermissionGuard permission="delete_parts">
                              <DropdownMenuItem
                                onClick={(e) => { e.stopPropagation(); handleDelete(part); }}
                                disabled={deleteMutation.isPending}
                                className="text-red-600 focus:text-red-700 cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </PermissionGuard>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {data && data.count > 0 && (
          <div className="p-3 border-t border-border flex items-center justify-between bg-muted/30">
            <div className="text-xs text-muted-foreground">
              Showing {((page - 1) * 10) + 1} to {Math.min(page * 10, data.count)} of {data.count}
            </div>
            <div className="flex space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={!data.previous}
                className="h-7 text-xs bg-card"
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={!data.next}
                className="h-7 text-xs bg-card"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      <ImportDialog
        isOpen={showImportDialog}
        onClose={() => setShowImportDialog(false)}
        onImport={async (file) => {
          const result = await inventoryApi.import(file);
          queryClient.invalidateQueries({ queryKey: ["inventory"] });
          return result;
        }}
        title="Import Parts"
        description="Upload a CSV file with part data. Required columns: part_number, name, category."
        onDownloadTemplate={downloadPartTemplate}
      />
    </div>
  );
}
