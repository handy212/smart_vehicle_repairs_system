"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { inventoryApi } from "@/lib/api/inventory";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Package, AlertTriangle, Trash2, Download, Upload, ChevronDown, MoreVertical, Eye, Edit, X } from "lucide-react";
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
import { BulkActionToolbar } from "@/components/ui/bulk-action-toolbar";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function InventoryPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();

  const { data, isLoading, error } = useQuery({
    queryKey: ["inventory", page, search],
    queryFn: () =>
      inventoryApi.list({
        page,
        search: search || undefined,
      }),
  });

  const parts = data?.results || [];
  const bulkSelection = useBulkSelection(parts);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => inventoryApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
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
  const hasActiveFilters = !!search;
  const clearFilters = () => { setSearch(""); setPage(1); };

  if (isLoading && !data) {
    return (
      <div className="space-y-5">
        <div className="flex justify-between items-center">
          <div>
            <div className="h-7 w-36 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-1"></div>
            <div className="h-4 w-56 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
          </div>
        </div>
        <Card className="border-t shadow-sm">
          <CardContent className="pt-6">
            <TableSkeleton rows={8} columns={8} />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
        Error loading inventory. Please try again.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center pt-2">
        <div>
          <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-1">
            <Link href="/dashboard" className="hover:text-blue-600 transition-colors">Dashboard</Link>
            <span>/</span>
            <span className="text-gray-900 dark:text-gray-100 font-medium">Inventory</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">Inventory</h1>
        </div>
        <div className="flex items-center space-x-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700">
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
              <Button size="sm" className="h-9">
                <Plus className="w-3.5 h-3.5 mr-2" />
                Add Part
              </Button>
            </Link>
          </PermissionGuard>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
            <Input
              type="text"
              placeholder="Search parts..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-9 h-9 text-sm bg-white dark:bg-gray-900 w-64 focus:w-80 transition-all duration-300"
            />
          </div>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9">
              <X className="h-4 h-4 mr-1" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Bulk Action Toolbar */}
      <BulkActionToolbar
        selectedCount={bulkSelection.selectedCount}
        onClearSelection={bulkSelection.clearSelection}
        onBulkDelete={handleBulkDelete}
      />

      {/* Inventory Table */}
      <Card className="border-t shadow-sm">
        <CardHeader className="py-3 px-4 border-b bg-gray-50/30 dark:bg-gray-800/30">
          <CardTitle className="text-sm font-semibold">All Parts ({data?.count || 0})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6"><TableSkeleton rows={8} columns={10} /></div>
          ) : data?.results && data.results.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/50 hover:bg-gray-50/50 dark:bg-gray-800/50">
                  <TableHead className="px-4 h-10 w-10">
                    <input
                      type="checkbox"
                      checked={bulkSelection.isAllSelected}
                      ref={(input) => { if (input) input.indeterminate = bulkSelection.isIndeterminate; }}
                      onChange={bulkSelection.toggleSelectAll}
                      className="h-3.5 w-3.5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                  </TableHead>
                  <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500">Part #</TableHead>
                  <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500">Name</TableHead>
                  <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500">Category</TableHead>
                  <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500">Stock</TableHead>
                  <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500">Min</TableHead>
                  <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500">Cost</TableHead>
                  <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500">Sell</TableHead>
                  <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500">Status</TableHead>
                  <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.results.map((part) => (
                  <TableRow
                    key={part.id}
                    className={`group hover:bg-gray-50/80 dark:hover:bg-gray-800/50 transition-colors border-b border-gray-100 dark:border-gray-800 cursor-pointer ${isLowStock(part) ? "bg-red-50/50 dark:bg-red-900/10" : ""}`}
                    onDoubleClick={() => router.push(`/inventory/${part.id}`)}
                  >
                    <TableCell className="px-4 py-2">
                      <input
                        type="checkbox"
                        checked={bulkSelection.isSelected(part.id)}
                        onChange={() => bulkSelection.toggleSelection(part.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-3.5 w-3.5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                    </TableCell>
                    <TableCell className="px-4 py-2 font-mono text-xs font-medium text-gray-700 dark:text-gray-300">
                      {part.part_number || "-"}
                    </TableCell>
                    <TableCell className="px-4 py-2">
                      <div className="flex items-center space-x-2">
                        <Package className="w-3.5 h-3.5 text-gray-400" />
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{part.name || "-"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-2 text-xs text-gray-600 dark:text-gray-400 capitalize">
                      {typeof part.category === 'object' && part.category !== null ? part.category.name : part.category || "-"}
                    </TableCell>
                    <TableCell className="px-4 py-2">
                      <div className="flex items-center space-x-1.5">
                        <span className={`text-sm font-medium ${isLowStock(part) ? "text-red-600" : "text-gray-900 dark:text-gray-100"}`}>
                          {part.quantity_in_stock || 0}
                        </span>
                        {isLowStock(part) && <AlertTriangle className="w-3.5 h-3.5 text-red-500" />}
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-2 text-xs text-gray-500">{part.minimum_stock || 0}</TableCell>
                    <TableCell className="px-4 py-2 text-xs text-gray-600 dark:text-gray-400">
                      {part.cost_price ? `$${parseFloat(part.cost_price).toFixed(2)}` : "-"}
                    </TableCell>
                    <TableCell className="px-4 py-2 text-xs text-gray-600 dark:text-gray-400">
                      {part.selling_price ? `$${parseFloat(part.selling_price).toFixed(2)}` : "-"}
                    </TableCell>
                    <TableCell className="px-4 py-2">
                      <Badge variant={part.is_active ? "success" : "secondary"} className="text-[10px] px-1.5 py-0">
                        {part.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-4 py-2 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" onClick={(e) => e.stopPropagation()} className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <MoreVertical className="w-3.5 h-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem asChild>
                            <Link href={`/inventory/${part.id}`} className="flex items-center">
                              <Eye className="w-4 h-4 mr-2" />
                              View
                            </Link>
                          </DropdownMenuItem>
                          <PermissionGuard permission="edit_parts">
                            <DropdownMenuItem asChild>
                              <Link href={`/inventory/${part.id}/edit`} className="flex items-center">
                                <Edit className="w-4 h-4 mr-2" />
                                Edit
                              </Link>
                            </DropdownMenuItem>
                          </PermissionGuard>
                          <DropdownMenuSeparator />
                          <PermissionGuard permission="delete_parts">
                            <DropdownMenuItem onClick={() => handleDelete(part)} disabled={deleteMutation.isPending} className="text-red-600 dark:text-red-400">
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
          ) : (
            <div className="text-center py-12">
              <Package className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500 mb-4">No parts found.</p>
              <Link href="/inventory/new">
                <Button variant="outline" size="sm" className="h-8">
                  <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Your First Part
                </Button>
              </Link>
            </div>
          )}

          {/* Pagination */}
          {data && data.count > 0 && (
            <div className="p-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <div className="text-xs text-gray-500">Page {page} of {Math.ceil(data.count / 10)}</div>
              <div className="flex space-x-2">
                <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={!data.previous} className="h-7 text-xs">
                  Previous
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setPage((p) => p + 1)} disabled={!data.next} className="h-7 text-xs">
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Import Dialog */}
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
