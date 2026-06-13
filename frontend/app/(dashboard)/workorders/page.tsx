"use client";

import axios from "axios";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { workordersApi } from "@/lib/api/workorders";
import { serviceTaskTypesApi, type ServiceTaskType } from "@/lib/api/workorder-tasks";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Wrench, Trash2, Download, X, ChevronDown, LayoutGrid, MoreHorizontal, Eye, Edit, FileText, Printer, Truck, Settings2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { useToast } from "@/lib/hooks/useToast";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { exportToPDF } from "@/lib/utils/export";
import { useBulkSelection } from "@/lib/hooks/useBulkSelection";
import { BulkActionToolbar } from "@/components/ui/bulk-action-toolbar";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AdvancedFilters, FilterOption, QuickFilter } from "@/components/ui/advanced-filters";
import { SortableHeader, SortConfig } from "@/components/ui/sortable-header";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { getStatusVariant, getStatusLabel } from "@/lib/utils/workorder-status";
import {
  DASHBOARD_GROUP_STATUS_MAP,
  WORK_ORDER_STATUS_GROUPS,
  getStatusGroupFilterValue,
  getStatusGroupLabel,
  getGroupedStatusFilterOptions,
} from "@/lib/utils/workorder-status-groups";
import { useConfirmDialog } from "@/lib/hooks/useConfirmDialog";

import { useCurrency } from "@/lib/hooks/useCurrency";
import { getWorkOrderListBillingDisplay } from "@/lib/workorders/workOrderBillingDisplay";
import { usePrint } from "@/lib/hooks/usePrint";
import { getWorkOrderCustomerDisplayName } from "@/lib/utils/customer-display";
import { getWorkOrderStagePresentation } from "@/lib/utils/workorder-inspection-stage";

export default function WorkOrdersPage() {
  const { formatCurrency } = useCurrency();
  const { openPrintWindow } = usePrint();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 500);
  const [page, setPage] = useState(1);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [showTaskTypesDialog, setShowTaskTypesDialog] = useState(false);
  const [newStatus, setNewStatus] = useState<string>("in_progress");

  const [advancedFilters, setAdvancedFilters] = useState<Record<string, any>>({});
  const [activeStatusGroup, setActiveStatusGroup] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const router = useRouter();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const dashboardGroup = searchParams.get("group");
  const groupedStatuses = dashboardGroup ? DASHBOARD_GROUP_STATUS_MAP[dashboardGroup] ?? [] : [];
  const groupedStatusFilter = groupedStatuses.length > 0 ? groupedStatuses.join(",") : undefined;
  const statusGroupFilter = activeStatusGroup
    ? getStatusGroupFilterValue(activeStatusGroup)
    : undefined;

  const statusFilterOptions = getGroupedStatusFilterOptions();

  const filterOptions: FilterOption[] = [
    {
      key: "status",
      label: "Status",
      type: "select",
      options: statusFilterOptions.map(({ value, label }) => ({ value, label })),
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
      label: "Waiting",
      value: "group_waiting",
      filters: { status: getStatusGroupFilterValue("waiting") },
    },
    {
      label: "Active",
      value: "group_active",
      filters: { status: getStatusGroupFilterValue("active") },
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
    queryKey: ["workorders", page, debouncedSearch, advancedFilters, sortConfig, groupedStatusFilter, activeStatusGroup],
    queryFn: () => {
      const ordering = sortConfig
        ? `${sortConfig.direction === "desc" ? "-" : ""}${sortConfig.field}`
        : undefined;
      return workordersApi.list({
        page,
        search: debouncedSearch || undefined,
        status:
          advancedFilters.status || statusGroupFilter || groupedStatusFilter,
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


  const handleDelete = async (workOrder: any) => {
    const ok = await confirm({
      title: "Delete work order?",
      description: `Delete "${workOrder.work_order_number}"? This cannot be undone.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (ok) deleteMutation.mutate(workOrder.id);
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
      const response = await workordersApi.bulkUpdateStatus(ids, status);
      return response;
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

  const handleBulkDelete = async () => {
    const ok = await confirm({
      title: `Delete ${bulkSelection.selectedCount} work order(s)?`,
      description: "This action cannot be undone.",
      confirmLabel: "Delete all",
      variant: "destructive",
    });
    if (ok) bulkDeleteMutation.mutate(bulkSelection.selectedIds);
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

  const handleExport = async (format: "xlsx" | "pdf" = "xlsx") => {
    if (!data?.results || data.results.length === 0) {
      toast({
        title: "No Data",
        description: "No work orders to export",
        variant: "destructive",
      });
      return;
    }

    if (format === "pdf") {
      exportToPDF(
        data.results,
        "workorders",
        [
          { key: "work_order_number", label: "Work Order Number" },
          { key: "customer_name", label: "Customer" },
          { key: "vehicle_info", label: "Vehicle" },
          { key: "status", label: "Status" },
          { key: "priority", label: "Priority" },
          { key: "total_cost", label: "Invoice Total" },
          { key: "created_at", label: "Created Date" },
        ]
      );
      toast({ title: "Success", description: "Work orders exported successfully" });
      return;
    }

    try {
      const ordering = sortConfig
        ? `${sortConfig.direction === "desc" ? "-" : ""}${sortConfig.field}`
        : undefined;
      const blob = await workordersApi.exportExcel({
        search: debouncedSearch || undefined,
        status:
          advancedFilters.status || statusGroupFilter || groupedStatusFilter,
        priority: advancedFilters.priority || undefined,
        created_at__gte: advancedFilters.created_at_from || undefined,
        created_at__lte: advancedFilters.created_at_to || undefined,
        ordering,
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "workorders_export.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast({ title: "Success", description: "Work orders exported successfully" });
    } catch (error: unknown) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.detail
        : undefined;
      toast({
        title: "Export failed",
        description: message || "Failed to export work orders",
        variant: "destructive",
      });
    }
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
      <div className="bg-destructive/10 dark:bg-red-900/20 border border-destructive/20 dark:border-red-800 text-destructive dark:text-red-400 px-4 py-3 rounded">
        Error loading work orders. Please try again.
      </div>
    );
  }

  return (
    <div className="space-y-4 h-full flex flex-col">
      <StaffPageHeader
        title="Work Orders"
        // description="Manage service requests and work orders."
        // breadcrumbs={[
        //   { label: "Dashboard", href: "/dashboard" },
        //   { label: "Work Orders" }
        // ]}
        className="pb-2"
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="shadow-sm border bg-card">
          <CardContent className="p-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total</span>
            <span className="text-lg font-bold text-foreground">{stats?.total_workorders || 0}</span>
          </CardContent>
        </Card>
        <Card className="shadow-sm border bg-card">
          <CardContent className="p-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">In Progress</span>
            <span className="text-lg font-bold text-primary">{stats?.in_progress || 0}</span>
          </CardContent>
        </Card>
        <Card className="shadow-sm border bg-card">
          <CardContent className="p-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pending</span>
            <span className="text-lg font-bold text-warning dark:text-amber-400">{stats?.pending || 0}</span>
          </CardContent>
        </Card>
        <Card className="shadow-sm border bg-card">
          <CardContent className="p-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Completed</span>
            <span className="text-lg font-bold text-success">{stats?.completed || 0}</span>
          </CardContent>
        </Card>
        <Card className="shadow-sm border bg-card">
          <CardContent className="p-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cancelled</span>
            <span className="text-lg font-bold text-muted-foreground">{stats?.cancelled || 0}</span>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {WORK_ORDER_STATUS_GROUPS.map((group) => (
          <Button
            key={group.id}
            type="button"
            variant={activeStatusGroup === group.id ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              setActiveStatusGroup((current) => (current === group.id ? null : group.id));
              setAdvancedFilters((prev) => {
                const next = { ...prev };
                delete next.status;
                return next;
              });
              setPage(1);
            }}
          >
            {group.label}
          </Button>
        ))}
      </div>

      {/* Unified Toolbar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 bg-card/50 p-2 rounded-lg border border-border shadow-sm">
        <div className="flex flex-wrap items-center gap-2 flex-1 w-full md:w-auto">
          {/* Search */}
          <div className="relative flex-1 md:flex-none md:w-56">
            <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-muted-foreground w-3.5 h-3.5" />
            <Input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-8 h-8 text-xs bg-muted border-border focus:ring-1 transition-all"
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
                setPage(1);
              }}
              title="Filter"
            />
          </div>

          {/* Clear Filters (Icon only) */}
          {(search || Object.keys(advancedFilters).length > 0 || activeStatusGroup) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                setAdvancedFilters({});
                setActiveStatusGroup(null);
                setPage(1);
              }}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
              title="Clear all filters"
              aria-label="Clear all filters"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          )}

          {/* Active filter badges — visible on all breakpoints */}
          <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto md:ml-2">
            {activeStatusGroup && (
              <Badge variant="secondary" className="text-[10px] px-1.5 h-5 flex items-center gap-1 bg-border text-muted-foreground font-normal border border-border">
                Group: {getStatusGroupLabel(activeStatusGroup)}
                <X
                  className="w-3 h-3 cursor-pointer hover:text-destructive"
                  onClick={() => {
                    setActiveStatusGroup(null);
                    setPage(1);
                  }}
                />
              </Badge>
            )}
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
                <Badge key={key} variant="secondary" className="text-[10px] px-1.5 h-5 flex items-center gap-1 bg-border text-muted-foreground font-normal border border-border">
                  {displayLabel}: {displayValue}
                  <X
                    className="w-3 h-3 cursor-pointer hover:text-destructive"
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
          <Link href="/workorders/kanban">
            <Button variant="outline" size="sm" className="h-8 text-xs font-semibold">
              <LayoutGrid className="w-3.5 h-3.5 mr-1.5" />
              Kanban View
            </Button>
          </Link>

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
                  Export Excel
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleExport("pdf")}
                  disabled={!data?.results || data.results.length === 0}
                  className="text-xs"
                >
                  <Download className="w-3.5 h-3.5 mr-2" />
                  Export PDF
                </DropdownMenuItem>
              </PermissionGuard>
              <DropdownMenuItem onClick={() => setShowTaskTypesDialog(true)} className="text-xs">
                <Settings2 className="w-3.5 h-3.5 mr-2" />
                Manage Task Types
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <PermissionGuard permission="create_workorders">
            <Link href="/workorders/new">
              <Button size="sm" className="h-8 text-xs bg-primary hover:bg-primary/90 text-white shadow-sm font-bold uppercase tracking-wider">
                <Plus className="w-3.5 h-3.5 mr-1.5" />
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
      <Card className="border-border shadow-sm overflow-hidden flex-1">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4">
              <TableSkeleton rows={8} columns={9} />
            </div>
          ) : data?.results && data.results.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50 border-b border-border">
                    <TableHead className="w-[30px] px-3 h-8">
                      <input
                        type="checkbox"
                        checked={bulkSelection.isAllSelected}
                        ref={(input) => {
                          if (input) input.indeterminate = bulkSelection.isIndeterminate;
                        }}
                        onChange={bulkSelection.toggleSelectAll}
                        className="h-3 w-3 text-primary focus:ring-primary border-border rounded"
                      />
                    </TableHead>
                    <SortableHeader
                      field="work_order_number"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                      className="px-3 h-8 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground"
                    >
                      WO #
                    </SortableHeader>
                    <SortableHeader
                      field="customer__user__last_name"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                      className="px-3 h-8 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground"
                    >
                      Customer
                    </SortableHeader>
                    <TableHead className="px-3 h-8 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Vehicle</TableHead>
                    <SortableHeader
                      field="status"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                      className="px-3 h-8 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground"
                    >
                      Status
                    </SortableHeader>
                    <SortableHeader
                      field="priority"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                      className="px-3 h-8 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground"
                    >
                      Priority
                    </SortableHeader>
                    <SortableHeader
                      field="invoice_total"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                      className="px-3 h-8 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground"
                    >
                      Invoice
                    </SortableHeader>
                    <SortableHeader
                      field="created_at"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                      className="px-3 h-8 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground"
                    >
                      Created
                    </SortableHeader>
                    <TableHead className="px-3 h-8 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.results.map((workorder) => {
                    const stagePresentation = getWorkOrderStagePresentation(workorder);
                    return (
                    <TableRow
                      key={workorder.id}
                      className="group hover:bg-muted/80 transition-colors border-b border-border cursor-pointer"
                      onDoubleClick={() => router.push(`/workorders/${workorder.id}`)}
                    >
                      <TableCell className="px-3 py-1.5">
                        <input
                          type="checkbox"
                          checked={bulkSelection.isSelected(workorder.id)}
                          onChange={() => bulkSelection.toggleSelection(workorder.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-3 w-3 text-primary focus:ring-primary border-border rounded"
                        />
                      </TableCell>
                      <TableCell className="px-3 py-1.5 font-mono text-[11px] font-bold text-primary">
                        {workorder.work_order_number || "-"}
                      </TableCell>
                      <TableCell className="px-3 py-1.5 text-xs font-medium text-foreground">
                        {getWorkOrderCustomerDisplayName(workorder)}
                      </TableCell>
                      <TableCell className="px-3 py-1.5 text-xs text-muted-foreground max-w-[150px] truncate" title={workorder.vehicle_info || ""}>{workorder.vehicle_info || "N/A"}</TableCell>
                      <TableCell className="px-3 py-1.5">
                        <div className="flex flex-wrap items-center gap-1">
                          <Badge variant={getStatusVariant(workorder.status) as any} className="text-[9px] px-1.5 py-0 h-4 capitalize font-bold shadow-none">
                            {stagePresentation.label || getStatusLabel(workorder.status)}
                          </Badge>
                          {workorder.gate_pass_status === 'completed' && (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-success/30 text-success bg-success/5 shadow-none flex items-center gap-0.5" title="Vehicle Picked Up">
                              <Truck className="w-2.5 h-2.5" /> Picked Up
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="px-3 py-1.5">
                        <Badge variant={getPriorityVariant(workorder.priority) as any} className="text-[9px] px-1.5 py-0 h-4 capitalize font-bold shadow-none">
                          {workorder.priority || "-"}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-3 py-1.5">
                        {(() => {
                          const billing = getWorkOrderListBillingDisplay(workorder, {
                            audience: "staff",
                            formatDue: formatCurrency,
                          });
                          if (!billing) {
                            return <span className="text-xs text-muted-foreground">—</span>;
                          }
                          return (
                            <div className="flex flex-col gap-0.5">
                              <span className="font-mono text-xs font-medium text-foreground">
                                {formatCurrency(billing.amount)}
                              </span>
                              {billing.statusLine && (
                                <span className="text-[10px] text-muted-foreground capitalize">
                                  {billing.statusLine}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="px-3 py-1.5 text-[11px] text-muted-foreground">
                        {workorder.created_at
                          ? format(new Date(workorder.created_at), "MMM dd")
                          : "-"}
                      </TableCell>
                      <TableCell className="px-3 py-1.5 text-right">
                        <DropdownMenu>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 hover:bg-primary/10 hover:text-primary transition-colors focus-visible:ring-1"
                                  aria-label="Work order actions"
                                >
                                  <span className="sr-only">Open menu</span>
                                  <MoreHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
                                </Button>
                              </DropdownMenuTrigger>
                            </TooltipTrigger>
                            <TooltipContent side="left">
                              <p>Actions</p>
                            </TooltipContent>
                          </Tooltip>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuLabel className="text-xs">Actions</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => router.push(`/workorders/${workorder.id}`)} className="text-xs">
                              <Eye className="mr-2 h-3.5 w-3.5" />
                              View Details
                            </DropdownMenuItem>
                            {workorder.status !== "closed" && (
                              <PermissionGuard permission="edit_workorders">
                                <DropdownMenuItem onClick={() => router.push(`/workorders/${workorder.id}/edit`)} className="text-xs">
                                  <Edit className="mr-2 h-3.5 w-3.5" />
                                  Edit Work Order
                                </DropdownMenuItem>
                              </PermissionGuard>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => openPrintWindow({ documentType: 'work_order', documentId: workorder.id })} className="text-xs">
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
                                onClick={() => handleDelete(workorder)}
                                className="text-destructive dark:text-red-400 focus:text-destructive dark:focus:text-red-400 focus:bg-destructive/10 dark:focus:bg-red-900/20 text-xs"
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
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12">
              <Wrench className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No work orders found.</p>
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
            <div className="p-2 border-t border-border flex items-center justify-between">
              <div className="text-[10px] text-muted-foreground pl-2">
                Page {page} of {Math.ceil(data.count / 20)} ({data.count} items)
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
            <label className="block text-sm font-medium text-card-foreground mb-2">
              New Status
            </label>
            <Select
              value={newStatus}
              onValueChange={(val) => setNewStatus(val)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="inspection">Initial Inspection</SelectItem>
                <SelectItem value="intake">Intake</SelectItem>
                <SelectItem value="assigned">Assigned</SelectItem>
                <SelectItem value="diagnosis">Diagnosis</SelectItem>
                <SelectItem value="awaiting_approval">Awaiting Customer Approval</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="additional_work_found">Additional Work Found</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="quality_check">Quality Check</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="invoiced">Invoiced</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
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

      <TaskTypesDialog
        open={showTaskTypesDialog}
        onOpenChange={setShowTaskTypesDialog}
      />
      <ConfirmDialog />
    </div>
  );
}

function TaskTypesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [editing, setEditing] = useState<ServiceTaskType | null>(null);
  const [form, setForm] = useState({
    code: "",
    name: "",
    description: "",
    default_labor_rate: "0.00",
    is_billable: true,
    is_active: true,
    sort_order: 0,
  });

  const { data: taskTypes = [], isLoading } = useQuery({
    queryKey: ["service-task-types", "manage"],
    queryFn: () => serviceTaskTypesApi.list(),
    enabled: open,
  });

  const resetForm = () => {
    setEditing(null);
    setForm({
      code: "",
      name: "",
      description: "",
      default_labor_rate: "0.00",
      is_billable: true,
      is_active: true,
      sort_order: 0,
    });
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        code: form.code || form.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
      };
      return editing?.id
        ? serviceTaskTypesApi.update(editing.id, payload)
        : serviceTaskTypesApi.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service-task-types"] });
      queryClient.invalidateQueries({ queryKey: ["service-task-types", "manage"] });
      resetForm();
      toast({ title: "Task type saved", variant: "success" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => serviceTaskTypesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service-task-types"] });
      queryClient.invalidateQueries({ queryKey: ["service-task-types", "manage"] });
      toast({ title: "Task type removed", variant: "success" });
    },
  });

  const startEdit = (taskType: ServiceTaskType) => {
    setEditing(taskType);
    setForm({
      code: taskType.code || taskType.value,
      name: taskType.name || taskType.label,
      description: taskType.description || "",
      default_labor_rate: taskType.default_labor_rate || "0.00",
      is_billable: taskType.is_billable ?? true,
      is_active: taskType.is_active ?? true,
      sort_order: taskType.sort_order || 0,
    });
  };

  const canSave = form.name.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Manage Service Task Types</DialogTitle>
        </DialogHeader>
        <div className="grid min-h-0 gap-4 md:grid-cols-[1fr_1.2fr]">
          <div className="space-y-3 rounded-md border border-border p-3 md:max-h-[calc(85vh-8rem)] md:overflow-y-auto">
            <Input
              placeholder="Task type name"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
            <Input
              placeholder="Code"
              value={form.code}
              onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
            />
            <Input
              placeholder="Description"
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                step="0.01"
                placeholder="Default labor rate"
                value={form.default_labor_rate}
                onChange={(event) => setForm((current) => ({ ...current, default_labor_rate: event.target.value }))}
              />
              <Input
                type="number"
                placeholder="Sort order"
                value={form.sort_order}
                onChange={(event) => setForm((current) => ({ ...current, sort_order: Number(event.target.value) || 0 }))}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_billable}
                onChange={(event) => setForm((current) => ({ ...current, is_billable: event.target.checked }))}
              />
              Billable
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))}
              />
              Active
            </label>
            <div className="flex gap-2">
              <Button onClick={() => saveMutation.mutate()} disabled={!canSave || saveMutation.isPending}>
                {editing ? "Update" : "Add"} Type
              </Button>
              {editing && (
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancel Edit
                </Button>
              )}
            </div>
          </div>
          <div className="min-h-0 overflow-hidden rounded-md border border-border">
            {isLoading ? (
              <div className="p-4 text-sm text-muted-foreground">Loading task types...</div>
            ) : (
              <div className="max-h-[calc(85vh-8rem)] overflow-y-auto">
                <Table>
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Rate</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {taskTypes.map((taskType) => (
                    <TableRow key={taskType.id || taskType.value}>
                      <TableCell>
                        <div className="font-medium">{taskType.name || taskType.label}</div>
                        <div className="text-xs text-muted-foreground">{taskType.code || taskType.value}</div>
                      </TableCell>
                      <TableCell>{taskType.default_labor_rate || "0.00"}</TableCell>
                      <TableCell>
                        <Badge variant={taskType.is_active === false ? "secondary" : "success"}>
                          {taskType.is_active === false ? "Inactive" : "Active"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => startEdit(taskType)}>
                          Edit
                        </Button>
                        {taskType.id && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={async () => {
                              const ok = await confirm({
                                title: "Delete task type?",
                                description: `Delete "${taskType.name || taskType.label}"?`,
                                confirmLabel: "Delete",
                                variant: "destructive",
                              });
                              if (ok && taskType.id) {
                                deleteMutation.mutate(taskType.id as number);
                              }
                            }}
                          >
                            Delete
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
      <ConfirmDialog />
    </Dialog>
  );
}
