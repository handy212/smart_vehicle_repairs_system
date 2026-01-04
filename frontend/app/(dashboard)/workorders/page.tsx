"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { workordersApi } from "@/lib/api/workorders";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Plus, Search, Wrench, LayoutGrid, Trash2, Download, X, ChevronDown, MoreVertical, Eye, Edit, FileText, Printer, Calendar, Clock, CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { useToast } from "@/lib/hooks/useToast";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { exportToCSV } from "@/lib/utils/export";
import { useBulkSelection } from "@/lib/hooks/useBulkSelection";
import { BulkActionToolbar } from "@/components/ui/bulk-action-toolbar";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AdvancedFilters, FilterOption, QuickFilter } from "@/components/ui/advanced-filters";
import { SortableHeader, SortConfig } from "@/components/ui/sortable-header";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
import { StaffStatsGrid } from "@/components/shared/StaffStatsGrid";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { getStatusVariant } from "@/lib/utils/workorder-status";

import { useCurrency } from "@/lib/hooks/useCurrency";
export default function WorkOrdersPage() {
  const { formatCurrency } = useCurrency();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 500);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [newStatus, setNewStatus] = useState<string>("in_progress");
  const [advancedFilters, setAdvancedFilters] = useState<Record<string, any>>({});
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const router = useRouter();
  const { hasPermission } = usePermissions();

  const filterOptions: FilterOption[] = [
    {
      key: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "draft", label: "Draft" },
        { value: "pending", label: "Pending" },
        { value: "in_progress", label: "In Progress" },
        { value: "completed", label: "Completed" },
        { value: "cancelled", label: "Cancelled" },
      ],
    },
    {
      key: "priority",
      label: "Priority",
      type: "select",
      options: [
        { value: "low", label: "Low" },
        { value: "normal", label: "Normal" },
        { value: "high", label: "High" },
        { value: "urgent", label: "Urgent" },
      ],
    },
    {
      key: "created_at",
      label: "Created Date",
      type: "daterange",
    },
  ];

  const quickFilters: QuickFilter[] = [
    {
      label: "Last 7 Days",
      value: "last_7_days",
      filters: {
        created_at_from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        created_at_to: new Date().toISOString().split("T")[0],
      },
    },
    {
      label: "This Month",
      value: "this_month",
      filters: {
        created_at_from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0],
        created_at_to: new Date().toISOString().split("T")[0],
      },
    },
    {
      label: "In Progress",
      value: "in_progress",
      filters: {
        status: "in_progress",
      },
    },
  ];

  const handleSort = (field: string) => {
    setSortConfig((current) => {
      if (current?.field === field) {
        if (current.direction === "asc") {
          return { field, direction: "desc" };
        } else if (current.direction === "desc") {
          return null;
        }
      }
      return { field, direction: "asc" };
    });
    setPage(1);
  };

  const { data: stats } = useQuery({
    queryKey: ["workorder-stats"],
    queryFn: () => workordersApi.dashboardStats(),
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["workorders", page, debouncedSearch, advancedFilters, sortConfig],
    queryFn: () => {
      const ordering = sortConfig
        ? `${sortConfig.direction === "desc" ? "-" : ""}${sortConfig.field}`
        : undefined;
      return workordersApi.list({
        page,
        search: debouncedSearch || undefined,
        status: advancedFilters.status || undefined,
        priority: advancedFilters.priority || undefined,
        created_at__gte: advancedFilters.created_at_from || undefined,
        created_at__lte: advancedFilters.created_at_to || undefined,
        ordering,
      });
    },
  });

  const workOrders = data?.results || [];
  const bulkSelection = useBulkSelection(workOrders);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => workordersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workorders"] });
      toast({ title: "Success", description: "Work order deleted successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to delete work order",
        variant: "destructive",
      });
    },
  });

  const handleDelete = (workOrder: any) => {
    if (confirm(`Are you sure you want to delete work order "${workOrder.work_order_number}"? This action cannot be undone.`)) {
      deleteMutation.mutate(workOrder.id);
    }
  };

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await Promise.all(ids.map((id) => workordersApi.delete(id)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workorders"] });
      bulkSelection.clearSelection();
      toast({ title: "Success", description: `${bulkSelection.selectedCount} work orders deleted successfully` });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to delete work orders",
        variant: "destructive",
      });
    },
  });

  const bulkStatusUpdateMutation = useMutation({
    mutationFn: async ({ ids, status }: { ids: number[]; status: string }) => {
      await Promise.all(
        ids.map((id) =>
          workordersApi.update(id, {
            status: status as any,
          })
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workorders"] });
      bulkSelection.clearSelection();
      setShowStatusDialog(false);
      toast({ title: "Success", description: `Status updated for ${bulkSelection.selectedCount} work orders` });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to update status",
        variant: "destructive",
      });
    },
  });

  const handleBulkDelete = () => {
    if (confirm(`Are you sure you want to delete ${bulkSelection.selectedCount} work order(s)? This action cannot be undone.`)) {
      bulkDeleteMutation.mutate(bulkSelection.selectedIds);
    }
  };

  const handleBulkStatusUpdate = () => {
    setShowStatusDialog(true);
  };

  const confirmBulkStatusUpdate = () => {
    bulkStatusUpdateMutation.mutate({
      ids: bulkSelection.selectedIds,
      status: newStatus,
    });
  };

  const handleExport = () => {
    if (!data?.results || data.results.length === 0) {
      toast({
        title: "No Data",
        description: "No work orders to export",
        variant: "destructive",
      });
      return;
    }

    exportToCSV(
      data.results,
      "workorders",
      [
        { key: "work_order_number", label: "Work Order Number" },
        { key: "customer_name", label: "Customer" },
        { key: "vehicle_info", label: "Vehicle" },
        { key: "status", label: "Status" },
        { key: "priority", label: "Priority" },
        { key: "total_cost", label: "Total Cost" },
        { key: "created_at", label: "Created Date" },
      ]
    );

    toast({ title: "Success", description: "Work orders exported successfully" });
  };

  const getPriorityVariant = (priority: string) => {
    switch (priority) {
      case "urgent":
        return "danger";
      case "high":
        return "warning";
      case "normal":
        return "secondary"; // Changed to secondary for cleaner look
      case "low":
        return "outline";
      default:
        return "secondary";
    }
  };

  // No manual StatsGrid definition needed

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded">
        Error loading work orders. Please try again.
      </div>
    );
  }

  return (
    <div className="space-y-4 h-full flex flex-col">
      <StaffPageHeader
        title="Work Orders"
        description="Manage service requests and work orders."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Work Orders" }
        ]}
        className="pb-2"
      />

      <div className="grid grid-cols-1 gap-4">
        <StaffStatsGrid
          columns={5}
          stats={[
            {
              title: "Total",
              value: stats?.total_workorders || 0,
              icon: Wrench,
            },
            {
              title: "In Progress",
              value: stats?.in_progress || 0,
              icon: Clock,
              trend: { value: "Active", label: "jobs", positive: undefined }
            },
            {
              title: "Pending",
              value: stats?.pending || 0,
              icon: AlertCircle,
              trend: { value: "Waiting", label: "approval", positive: false }
            },
            {
              title: "Completed",
              value: stats?.completed || 0,
              icon: CheckCircle2,
              trend: { value: "Done", label: "all time", positive: true }
            },
            {
              title: "Cancelled",
              value: stats?.cancelled || 0,
              icon: XCircle,
            }
          ]}
          className="mb-0"
        />

        {/* Unified Toolbar */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 bg-white dark:bg-gray-900/50 p-2 rounded-lg border border-gray-100 dark:border-gray-800 shadow-sm">
          <div className="flex items-center gap-2 flex-1 w-full md:w-auto">
            {/* Search */}
            <div className="relative flex-1 md:flex-none md:w-56">
              <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
              <Input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-8 h-8 text-xs bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 focus:ring-1 transition-all"
              />
            </div>

            {/* Advanced Filters Button */}
            <div className="h-8 text-xs px-2.5 flex items-center">
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
                  setStatusFilter("");
                  setPage(1);
                }}
                title="Filter"
              />
            </div>

            {/* Clear Filters (Icon only) */}
            {(search || Object.keys(advancedFilters).length > 0) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setAdvancedFilters({});
                  setStatusFilter("");
                  setPage(1);
                }}
                className="h-8 w-8 p-0 text-gray-500 hover:text-red-600"
                title="Clear all filters"
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            )}

            {/* Active Filter Badges */}
            <div className="hidden lg:flex flex-wrap items-center gap-1.5 ml-2">
              {Object.entries(advancedFilters).map(([key, value]) => {
                if (!value || (typeof value === 'string' && value === '')) return null;
                const filter = filterOptions.find((f) => f.key === key || f.key === key.replace("_from", "").replace("_to", ""));
                if (!filter && !key.includes("_from") && !key.includes("_to")) return null;
                if (key.includes("_to")) return null;

                const displayLabel = filter?.label || key.replace("_from", "").replace(/_/g, " ");
                const displayValue = key.includes("_from") && advancedFilters[key.replace("_from", "_to")]
                  ? `${value} - ${advancedFilters[key.replace("_from", "_to")]}`
                  : String(value);

                return (
                  <Badge key={key} variant="secondary" className="text-[10px] px-1.5 h-5 flex items-center gap-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-normal border border-gray-200 dark:border-gray-700">
                    {displayLabel}: {displayValue}
                    <X
                      className="w-3 h-3 cursor-pointer hover:text-red-500"
                      onClick={() => {
                        const newFilters = { ...advancedFilters };
                        if (key.includes("_from")) {
                          delete newFilters[key];
                          delete newFilters[key.replace("_from", "_to")];
                        } else {
                          delete newFilters[key];
                        }
                        setAdvancedFilters(newFilters);
                        setPage(1);
                      }}
                    />
                  </Badge>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs">
                  Actions
                  <ChevronDown className="w-3 h-3 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <PermissionGuard permission="export_workorders">
                  <DropdownMenuItem
                    onClick={() => handleExport()}
                    disabled={!data?.results || data.results.length === 0}
                    className="text-xs"
                  >
                    <Download className="w-3.5 h-3.5 mr-2" />
                    Export CSV
                  </DropdownMenuItem>
                </PermissionGuard>
                <Link href="/workorders/kanban">
                  <DropdownMenuItem className="text-xs">
                    <LayoutGrid className="w-3.5 h-3.5 mr-2" />
                    Kanban View
                  </DropdownMenuItem>
                </Link>
              </DropdownMenuContent>
            </DropdownMenu>

            <PermissionGuard permission="create_workorders">
              <Link href="/workorders/new">
                <Button size="sm" className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white shadow-sm">
                  <Plus className="w-3.5 h-3.5 mr-2" />
                  New Work Order
                </Button>
              </Link>
            </PermissionGuard>
          </div>
        </div>

        {/* Bulk Action Toolbar */}
        <BulkActionToolbar
          selectedCount={bulkSelection.selectedCount}
          onClearSelection={bulkSelection.clearSelection}
          onBulkDelete={handleBulkDelete}
          onBulkStatusUpdate={handleBulkStatusUpdate}
          showStatusUpdate={true}
          className="my-0"
        />

        {/* Work Orders Table */}
        <Card className="border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden flex-1">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4">
                <TableSkeleton rows={8} columns={9} />
              </div>
            ) : data?.results && data.results.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50/50 hover:bg-gray-50/50 border-b border-gray-100 dark:border-gray-800">
                      <TableHead className="w-[30px] px-3 h-8">
                        <input
                          type="checkbox"
                          checked={bulkSelection.isAllSelected}
                          ref={(input) => {
                            if (input) input.indeterminate = bulkSelection.isIndeterminate;
                          }}
                          onChange={bulkSelection.toggleSelectAll}
                          className="h-3 w-3 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                      </TableHead>
                      <SortableHeader
                        field="work_order_number"
                        sortConfig={sortConfig}
                        onSort={handleSort}
                        className="px-3 h-8 text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400"
                      >
                        WO #
                      </SortableHeader>
                      <SortableHeader
                        field="customer__user__last_name"
                        sortConfig={sortConfig}
                        onSort={handleSort}
                        className="px-3 h-8 text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400"
                      >
                        Customer
                      </SortableHeader>
                      <TableHead className="px-3 h-8 text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">Vehicle</TableHead>
                      <SortableHeader
                        field="status"
                        sortConfig={sortConfig}
                        onSort={handleSort}
                        className="px-3 h-8 text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400"
                      >
                        Status
                      </SortableHeader>
                      <SortableHeader
                        field="priority"
                        sortConfig={sortConfig}
                        onSort={handleSort}
                        className="px-3 h-8 text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400"
                      >
                        Priority
                      </SortableHeader>
                      <SortableHeader
                        field="estimated_total"
                        sortConfig={sortConfig}
                        onSort={handleSort}
                        className="px-3 h-8 text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400"
                      >
                        Cost
                      </SortableHeader>
                      <SortableHeader
                        field="created_at"
                        sortConfig={sortConfig}
                        onSort={handleSort}
                        className="px-3 h-8 text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400"
                      >
                        Created
                      </SortableHeader>
                      <TableHead className="px-3 h-8 text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.results.map((workorder) => (
                      <TableRow
                        key={workorder.id}
                        className="group hover:bg-gray-50/80 transition-colors border-b border-gray-100 dark:border-gray-800 cursor-pointer"
                        onDoubleClick={() => router.push(`/workorders/${workorder.id}`)}
                      >
                        <TableCell className="px-3 py-1.5">
                          <input
                            type="checkbox"
                            checked={bulkSelection.isSelected(workorder.id)}
                            onChange={() => bulkSelection.toggleSelection(workorder.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="h-3 w-3 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                        </TableCell>
                        <TableCell className="px-3 py-1.5 font-mono text-[11px] font-bold text-blue-600 dark:text-blue-400">
                          {workorder.work_order_number || "-"}
                        </TableCell>
                        <TableCell className="px-3 py-1.5 text-xs font-medium text-gray-900 dark:text-gray-100">{workorder.customer_name || "N/A"}</TableCell>
                        <TableCell className="px-3 py-1.5 text-xs text-gray-600 dark:text-gray-300 max-w-[150px] truncate" title={workorder.vehicle_info || ""}>{workorder.vehicle_info || "N/A"}</TableCell>
                        <TableCell className="px-3 py-1.5">
                          <Badge variant={getStatusVariant(workorder.status) as any} className="text-[9px] px-1.5 py-0 h-4 capitalize font-bold border shadow-none bg-transparent">
                            {workorder.status?.replace("_", " ") || workorder.status || "-"}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-3 py-1.5">
                          <Badge variant={getPriorityVariant(workorder.priority) as any} className="text-[9px] px-1.5 py-0 h-4 capitalize font-bold border shadow-none bg-transparent">
                            {workorder.priority || "-"}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-3 py-1.5 font-mono text-xs font-medium text-gray-900 dark:text-gray-100">
                          {workorder.total_cost ? `${formatCurrency(parseFloat(workorder.total_cost))}` : "-"}
                        </TableCell>
                        <TableCell className="px-3 py-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                          {workorder.created_at
                            ? format(new Date(workorder.created_at), "MMM dd")
                            : "-"}
                        </TableCell>
                        <TableCell className="px-3 py-1.5 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 dark:hover:bg-gray-700 data-[state=open]:bg-gray-100 dark:data-[state=open]:bg-gray-800"
                              >
                                <span className="sr-only">Open menu</span>
                                <MoreVertical className="w-3.5 h-3.5 text-gray-500" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuLabel className="text-xs">Actions</DropdownMenuLabel>
                              <DropdownMenuItem onClick={() => router.push(`/workorders/${workorder.id}`)} className="text-xs">
                                <Eye className="mr-2 h-3.5 w-3.5" />
                                View Details
                              </DropdownMenuItem>
                              <PermissionGuard permission="edit_workorders">
                                <DropdownMenuItem onClick={() => router.push(`/workorders/${workorder.id}/edit`)} className="text-xs">
                                  <Edit className="mr-2 h-3.5 w-3.5" />
                                  Edit Work Order
                                </DropdownMenuItem>
                              </PermissionGuard>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => window.open(`/workorders/${workorder.id}/print`, '_blank')} className="text-xs">
                                <Printer className="mr-2 h-3.5 w-3.5" />
                                Print Job Card
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => router.push(`/workorders/${workorder.id}/diagnosis`)} className="text-xs">
                                <FileText className="mr-2 h-3.5 w-3.5" />
                                View Diagnosis
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <PermissionGuard permission="delete_workorders">
                                <DropdownMenuItem
                                  onClick={() => {
                                    if (window.confirm(`Are you sure you want to delete work order "${workorder.work_order_number}"? This action cannot be undone.`)) {
                                      handleDelete(workorder);
                                    }
                                  }}
                                  className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400 focus:bg-red-50 dark:focus:bg-red-900/20 text-xs"
                                  disabled={deleteMutation.isPending}
                                >
                                  <Trash2 className="mr-2 h-3.5 w-3.5" />
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
            ) : (
              <div className="text-center py-12">
                <Wrench className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400">No work orders found.</p>
                <Link href="/workorders/new">
                  <Button className="mt-4" variant="secondary">
                    <Plus className="w-4 h-4 mr-2" />
                    Create First Work Order
                  </Button>
                </Link>
              </div>
            )}

            {/* Pagination */}
            {data && data.count > 0 && (
              <div className="p-2 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <div className="text-[10px] text-gray-500 dark:text-gray-400 pl-2">
                  Page {page} of {Math.ceil(data.count / 10)} ({data.count} items)
                </div>
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={!data.previous}
                    className="h-7 text-xs px-2"
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={!data.next}
                    className="h-7 text-xs px-2"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bulk Status Update Dialog */}
        <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Update Status for {bulkSelection.selectedCount} Work Order(s)</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                New Status
              </label>
              <Select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
              >
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </Select>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowStatusDialog(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={confirmBulkStatusUpdate}
                disabled={bulkStatusUpdateMutation.isPending}
              >
                {bulkStatusUpdateMutation.isPending ? "Updating..." : "Update Status"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

