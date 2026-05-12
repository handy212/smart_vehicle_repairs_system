"use client";

import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useInView } from "react-intersection-observer";
import { inventoryApi, Part, PartListResponse } from "@/lib/api/inventory";
import { branchesApi, Branch } from "@/lib/api/branches";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Package, Trash2, Download, Upload, MoreVertical, Eye, Edit, Search, X, ChevronDown, QrCode } from "lucide-react";
import { ImportDialog } from "@/components/ui/import-dialog";
import { downloadPartTemplate } from "@/lib/utils/import-templates";
import { exportPartsForImport } from "@/lib/utils/export-templates";
import { BarcodeScanner } from "@/components/shared/BarcodeScanner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import Link from "next/link";
import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/lib/hooks/useToast";
import { exportToCSV, exportToPDF } from "@/lib/utils/export";
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
import Image from "next/image";
import { getMediaUrl } from "@/lib/api/utils";

// Stats Grid Component
const StatsGrid = ({ stats, loading }: { stats: any; loading: boolean }) => {
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
    { label: "Low Stock", value: stats.low_stock, color: "text-warning" },
    { label: "Out of Stock", value: stats.out_of_stock, color: "text-destructive" },
    { label: "Total Value", value: stats.total_value, isCurrency: true, color: "text-success" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      {items.map((item, index) => (
        <Card key={index} className="shadow-sm border bg-card">
          <CardContent className="p-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{item.label}</span>
            <span className={`text-lg font-bold ${item.color || 'text-foreground'}`}>
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
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { hasPermission } = usePermissions();

  // Unified Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [advancedFilters, setAdvancedFilters] = useState<Record<string, any>>({});

  // Fetch Lists
  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery<PartListResponse>({
    queryKey: ["inventory", searchQuery, advancedFilters],
    queryFn: ({ pageParam = 1 }) =>
      inventoryApi.list({
        page: pageParam as number,
        search: searchQuery || undefined,
        category: advancedFilters.category,
        is_active: advancedFilters.is_active === 'true' ? true : advancedFilters.is_active === 'false' ? false : undefined,
        low_stock: advancedFilters.stock_status === 'low_stock' ? true : undefined,
        out_of_stock: advancedFilters.stock_status === 'out_of_stock' ? true : undefined,
        needs_reorder: advancedFilters.stock_status === 'needs_reorder' ? true : undefined,
        branch: advancedFilters.branch ? parseInt(advancedFilters.branch) : undefined,
      }),
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.next) {
        return allPages.length + 1;
      }
      return undefined;
    },
    initialPageParam: 1,
  });

  const { ref: observerRef, inView } = useInView();

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Fetch Stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["inventory-stats"],
    queryFn: () => inventoryApi.partsDashboardStats(),
  });

  // Fetch Branches for filter
  const { data: branchesData } = useQuery<{ results: Branch[] } | Branch[]>({
    queryKey: ["branches-active"],
    queryFn: () => branchesApi.list({ is_active: true }) as any,
  });

  const branches = Array.isArray(branchesData) ? branchesData : (branchesData?.results || []);

  const parts = useMemo(() => {
    return data?.pages.flatMap((page) => page.results || []) || [];
  }, [data]);
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

  const handleDelete = (part: Part) => {
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

  const handleExport = (format: "xlsx" | "pdf" = "xlsx") => {
    if (!parts || parts.length === 0) {
      toast({ title: "No Data", description: "No parts to export", variant: "destructive" });
      return;
    }
    (format === "pdf" ? exportToPDF : exportToCSV)(parts, "inventory", [
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

  const isLowStock = (part: Part) => part.quantity_in_stock <= part.minimum_stock;

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
      <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded">
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
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setSearchQuery(e.target.value);
              }}
              className="pl-9 pr-9 h-9 text-sm bg-muted border-none focus:ring-1 transition-all"
            />
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-0 top-1/2 transform -translate-y-1/2 h-9 w-9 p-0 text-muted-foreground hover:text-primary"
              onClick={() => setShowScanner(true)}
              title="Scan Barcode"
            >
              <QrCode className="h-4 w-4" />
            </Button>
          </div>

          {/* Advanced Filters */}
          <AdvancedFilters
            filters={filterOptions}
            quickFilters={quickFilters}
            activeFilters={advancedFilters}
            onFiltersChange={(filters: Record<string, any>) => {
              setAdvancedFilters(filters);
            }}
            onClear={() => {
              setAdvancedFilters({});
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
              }}
              className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive"
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
                  const option = filter.options?.find((o: { value: string; label: string }) => o.value === String(value));
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
                    className="w-3 h-3 cursor-pointer hover:text-destructive"
                    onClick={() => {
                      const newFilters = { ...advancedFilters };
                      delete newFilters[key];
                      setAdvancedFilters(newFilters);
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
                  Import Excel
                </DropdownMenuItem>
              </PermissionGuard>
              <PermissionGuard permission="export_inventory">
                <DropdownMenuItem onClick={() => handleExport()} disabled={!parts || parts.length === 0}>
                  <Download className="w-4 h-4 mr-2" />
                  Export Excel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("pdf")} disabled={!parts || parts.length === 0}>
                  <Download className="w-4 h-4 mr-2" />
                  Export PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { if (parts) exportPartsForImport(parts); }} disabled={!parts || parts.length === 0}>
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
          ) : parts.length === 0 ? (
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
                    <TableHead className="h-9 w-12 px-2"></TableHead>
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
                      className="group hover:bg-muted/50 border-b border-border cursor-pointer transition-colors"
                      onClick={() => router.push(`/inventory/${part.id}`)}
                    >
                      <TableCell className="px-4 py-2 w-10" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={bulkSelection.isSelected(part.id)}
                          onChange={() => bulkSelection.toggleSelection(part.id)}
                          className="h-3.5 w-3.5 text-primary focus:ring-primary border-border rounded cursor-pointer"
                        />
                      </TableCell>
                      <TableCell className="px-2 py-2">
                        <div className="relative h-9 w-9 overflow-hidden rounded-md border border-border bg-muted flex items-center justify-center">
                          {part.image ? (
                            <Image
                              src={getMediaUrl(part.image)}
                              alt={part.name}
                              fill
                              className="object-contain"
                              unoptimized
                            />
                          ) : (
                            <Package className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
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
                            ? "bg-destructive/10 text-destructive border-destructive/10"
                            : "bg-warning/10 text-amber-700 border-amber-100"
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
                          ? "text-success border-emerald-200 bg-success/10"
                          : "text-muted-foreground border-border bg-muted"
                          }`}>
                          {part.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-4 py-2 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" onClick={(e: React.MouseEvent) => e.stopPropagation()} className="h-7 w-7 p-0 hover:bg-muted text-muted-foreground">
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
                                onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleDelete(part); }}
                                disabled={deleteMutation.isPending}
                                className="text-destructive focus:text-destructive cursor-pointer"
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

        {/* Pagination Endless Scroll */}
        {data && data.pages[0]?.count > 0 && (
          <div className="p-4 border-t border-border flex flex-col items-center justify-center space-y-2 bg-muted/30">
            <div className="text-xs text-muted-foreground">
              Showing {parts.length} of {data.pages[0].count}
            </div>
            <div ref={observerRef} className="h-6 flex items-center justify-center w-full">
              {isFetchingNextPage ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
              ) : hasNextPage ? (
                <span className="text-xs text-muted-foreground">Scroll to load more</span>
              ) : null}
            </div>
          </div>
        )}
      </Card>

      <ImportDialog
        isOpen={showImportDialog}
        onClose={() => setShowImportDialog(false)}
        onImport={async (file: File) => {
          const result = await inventoryApi.import(file);
          queryClient.invalidateQueries({ queryKey: ["inventory"] });
          return result;
        }}
        title="Import Parts"
        description="Upload an Excel file with part data. Required columns: part_number, name, category."
        accept=".xlsx"
        onDownloadTemplate={downloadPartTemplate}
      />

      <Dialog open={showScanner} onOpenChange={setShowScanner}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Scan Barcode or QR Code</DialogTitle>
          </DialogHeader>
          <div className="pt-2">
            {showScanner && (
              <BarcodeScanner
                onScan={(data: string) => {
                  setSearchQuery(data);
                  setShowScanner(false);
                  toast({ title: "Barcode Scanned", description: `Searched for ${data}` });
                }}
                onClose={() => setShowScanner(false)}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
