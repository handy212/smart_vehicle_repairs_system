"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customersApi } from "@/lib/api/customers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Plus, Search, Filter, Trash2, Download, X, Upload, ChevronDown, FileDown, FileUp, MoreVertical, Eye, Edit, Mail, UserCheck, UserX, MessageSquare, Calendar, Wrench, Package } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/lib/hooks/useToast";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { exportToCSV, formatDateForCSV } from "@/lib/utils/export";
import { useBulkSelection } from "@/lib/hooks/useBulkSelection";
import { BulkActionToolbar } from "@/components/ui/bulk-action-toolbar";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AdvancedFilters, FilterOption, QuickFilter } from "@/components/ui/advanced-filters";
import { SortableHeader, SortConfig } from "@/components/ui/sortable-header";
import { ColumnVisibility, ColumnConfig } from "@/components/ui/column-visibility";
import { ImportDialog } from "@/components/ui/import-dialog";
import { downloadCustomerTemplate } from "@/lib/utils/import-templates";
import { exportCustomersForImport } from "@/lib/utils/export-templates";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { PermissionButton } from "@/components/auth/PermissionButton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils/cn";

export default function CustomersPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 500);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [newStatus, setNewStatus] = useState<string>("active");
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<Record<string, any>>({});
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    new Set(["checkbox", "name", "email", "type", "status", "actions"])
  );
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();

  const columnConfigs: ColumnConfig[] = [
    { key: "name", label: "Name", defaultVisible: true },
    { key: "email", label: "Email", defaultVisible: true },
    { key: "type", label: "Type", defaultVisible: true },
    { key: "status", label: "Status", defaultVisible: true },
  ];

  // Advanced filter options
  const filterOptions: FilterOption[] = [
    {
      key: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "active", label: "Active" },
        { value: "inactive", label: "Inactive" },
        { value: "suspended", label: "Suspended" },
      ],
    },
    {
      key: "customer_type",
      label: "Customer Type",
      type: "select",
      options: [
        { value: "individual", label: "Individual" },
        { value: "business", label: "Business" },
      ],
    },
    {
      key: "customer_since",
      label: "Customer Since",
      type: "daterange",
    },
    {
      key: "loyalty_tier",
      label: "Loyalty Tier",
      type: "select",
      options: [
        { value: "bronze", label: "Bronze" },
        { value: "silver", label: "Silver" },
        { value: "gold", label: "Gold" },
        { value: "platinum", label: "Platinum" },
      ],
    },
  ];

  const quickFilters: QuickFilter[] = [
    {
      label: "Last 30 Days",
      value: "last_30_days",
      filters: {
        customer_since_from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        customer_since_to: new Date().toISOString().split("T")[0],
      },
    },
    {
      label: "This Month",
      value: "this_month",
      filters: {
        customer_since_from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0],
        customer_since_to: new Date().toISOString().split("T")[0],
      },
    },
    {
      label: "Active Customers",
      value: "active",
      filters: {
        status: "active",
      },
    },
  ];

  const handleSort = (field: string) => {
    setSortConfig((current) => {
      if (current?.field === field) {
        if (current.direction === "asc") {
          return { field, direction: "desc" };
        } else if (current.direction === "desc") {
          return null; // Clear sort
        }
      }
      return { field, direction: "asc" };
    });
    setPage(1);
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ["customers", page, debouncedSearch, advancedFilters, sortConfig],
    queryFn: () => {
      const ordering = sortConfig
        ? `${sortConfig.direction === "desc" ? "-" : ""}${sortConfig.field}`
        : undefined;
      return customersApi.list({
        page,
        search: debouncedSearch || undefined,
        status: advancedFilters.status || undefined,
        customer_type: advancedFilters.customer_type || undefined,
        created_at__gte: advancedFilters.customer_since_from || undefined,
        created_at__lte: advancedFilters.customer_since_to || undefined,
        loyalty_tier: advancedFilters.loyalty_tier || undefined,
        ordering,
      });
    },
  });

  const customers = data?.results || [];
  const bulkSelection = useBulkSelection(customers);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => customersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast({ title: "Success", description: "Customer deleted successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to delete customer",
        variant: "destructive",
      });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await Promise.all(ids.map((id) => customersApi.delete(id)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      bulkSelection.clearSelection();
      toast({ title: "Success", description: `${bulkSelection.selectedCount} customers deleted successfully` });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to delete customers",
        variant: "destructive",
      });
    },
  });

  const bulkStatusUpdateMutation = useMutation({
    mutationFn: async ({ ids, status }: { ids: number[]; status: string }) => {
      await Promise.all(
        ids.map((id) =>
          customersApi.update(id, {
            status: status as any,
          })
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      bulkSelection.clearSelection();
      setShowStatusDialog(false);
      toast({ title: "Success", description: `Status updated for ${bulkSelection.selectedCount} customers` });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to update status",
        variant: "destructive",
      });
    },
  });

  const handleDelete = (customer: any) => {
    if (confirm(`Are you sure you want to delete customer "${customer.full_name || customer.company_name || customer.user?.email || 'this customer'}"? This action cannot be undone.`)) {
      deleteMutation.mutate(customer.id);
    }
  };

  const handleBulkDelete = () => {
    if (confirm(`Are you sure you want to delete ${bulkSelection.selectedCount} customer(s)? This action cannot be undone.`)) {
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
        description: "No customers to export",
        variant: "destructive",
      });
      return;
    }

    exportToCSV(
      data.results,
      "customers",
      [
        { key: "full_name", label: "Name" },
        { key: "email", label: "Email" },
        { key: "phone", label: "Phone" },
        { key: "company_name", label: "Company" },
        { key: "customer_type", label: "Type" },
        { key: "status", label: "Status" },
        { key: "customer_since", label: "Customer Since" },
      ]
    );

    toast({ title: "Success", description: "Customers exported successfully" });
  };

  if (isLoading && !data) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <div className="h-9 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-2"></div>
            <div className="h-5 w-64 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
          </div>
        </div>
        <Card>
          <CardContent className="pt-6">
            <TableSkeleton rows={8} columns={6} />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded">
        Error loading customers. Please try again.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Compact Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Customers</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Manage your customer database</p>
        </div>
        <div className="flex items-center space-x-2">
          <ColumnVisibility
            columns={columnConfigs}
            visibleColumns={visibleColumns}
            onVisibilityChange={setVisibleColumns}
            title="Customer Table Columns"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700">
                Actions
                <ChevronDown className="w-3.5 h-3.5 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <PermissionGuard permission="import_customers">
                <DropdownMenuItem onClick={() => setShowImportDialog(true)}>
                  <Upload className="w-4 h-4 mr-2" />
                  Import CSV
                </DropdownMenuItem>
              </PermissionGuard>
              <PermissionGuard permission="export_customers">
                <DropdownMenuItem onClick={handleExport} disabled={!data?.results || data.results.length === 0}>
                  <Download className="w-4 h-4 mr-2" />
                  Export CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { if (data?.results) exportCustomersForImport(data.results); }} disabled={!data?.results || data.results.length === 0}>
                  <FileDown className="w-4 h-4 mr-2" />
                  Export for Import
                </DropdownMenuItem>
              </PermissionGuard>
            </DropdownMenuContent>
          </DropdownMenu>
          <Link href="/customers/new">
            <Button size="sm" className="h-9">
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Customer
            </Button>
          </Link>
        </div>
      </div>

      {/* Compact Filter Bar */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              type="text"
              placeholder="Search customers..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-9 h-9 text-sm bg-white dark:bg-gray-900 w-64 focus:w-80 transition-all duration-300"
            />
          </div>

          {/* Advanced Filters Button */}
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
              setStatusFilter("all");
              setTypeFilter("all");
              setStartDate("");
              setEndDate("");
            }}
            title="Advanced Customer Filters"
          />

          {/* Clear Filters */}
          {(search || Object.keys(advancedFilters).length > 0) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                setAdvancedFilters({});
                setStatusFilter("all");
                setTypeFilter("all");
                setStartDate("");
                setEndDate("");
                setPage(1);
              }}
              className="h-9"
            >
              <X className="w-4 h-4 mr-1" />
              Clear
            </Button>
          )}
        </div>

        {/* Active Filter Badges */}
        {(search || Object.keys(advancedFilters).length > 0) && (
          <div className="flex flex-wrap items-center gap-2">
            {search && (
              <Badge variant="secondary" className="flex items-center gap-1.5">
                <span className="text-xs">Search: {search}</span>
                <button
                  onClick={() => {
                    setSearch("");
                    setPage(1);
                  }}
                  className="hover:text-red-600"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            )}
            {Object.entries(advancedFilters).map(([key, value]) => {
              if (!value || (typeof value === 'string' && value === '')) return null;
              const filter = filterOptions.find((f) => f.key === key || f.key === key.replace("_from", "").replace("_to", ""));
              if (!filter && !key.includes("_from") && !key.includes("_to")) return null;
              if (key.includes("_to")) return null;

              const displayValue = key.includes("_from") && advancedFilters[key.replace("_from", "_to")]
                ? `${value} - ${advancedFilters[key.replace("_from", "_to")]}`
                : String(value);

              const displayLabel = filter?.label || key.replace("_from", "").replace(/_/g, " ");

              return (
                <Badge key={key} variant="secondary" className="flex items-center gap-1.5">
                  <span className="text-xs">{displayLabel}: {displayValue}</span>
                  <button
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
                    className="hover:text-red-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              );
            })}
          </div>
        )}
      </div>

      {/* Bulk Action Toolbar */}
      <BulkActionToolbar
        selectedCount={bulkSelection.selectedCount}
        onClearSelection={bulkSelection.clearSelection}
        onBulkDelete={handleBulkDelete}
        onBulkStatusUpdate={handleBulkStatusUpdate}
        showStatusUpdate={true}
      />

      {/* Customers Table */}
      <Card className="border-t shadow-sm dark:bg-gray-800 dark:border-gray-700">
        <CardHeader className="py-3 px-4 border-b bg-gray-50/30 dark:bg-gray-800/30">
          <CardTitle className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            All Customers <span className="text-muted-foreground font-normal ml-1">({data?.count || 0})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6">
              <TableSkeleton rows={8} columns={6} />
            </div>
          ) : data?.results && data.results.length > 0 ? (
            <div className="rounded-md">
              <Table>
                <TableHeader className="bg-gray-50/50 hover:bg-gray-50/50 dark:bg-gray-900/50">
                  <TableRow>
                    {visibleColumns.has("checkbox") && (
                      <TableHead className="w-[50px] px-4 h-10">
                        <input
                          type="checkbox"
                          checked={bulkSelection.isAllSelected}
                          ref={(input) => {
                            if (input) input.indeterminate = bulkSelection.isIndeterminate;
                          }}
                          onChange={bulkSelection.toggleSelectAll}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                      </TableHead>
                    )}
                    {visibleColumns.has("name") && (
                      <SortableHeader
                        field="user__last_name"
                        sortConfig={sortConfig}
                        onSort={handleSort}
                        className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400"
                      >
                        Name
                      </SortableHeader>
                    )}
                    {visibleColumns.has("email") && (
                      <SortableHeader
                        field="user__email"
                        sortConfig={sortConfig}
                        onSort={handleSort}
                        className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400"
                      >
                        Email
                      </SortableHeader>
                    )}
                    {visibleColumns.has("type") && (
                      <SortableHeader
                        field="customer_type"
                        sortConfig={sortConfig}
                        onSort={handleSort}
                        className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400"
                      >
                        Type
                      </SortableHeader>
                    )}
                    {visibleColumns.has("status") && (
                      <SortableHeader
                        field="status"
                        sortConfig={sortConfig}
                        onSort={handleSort}
                        className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400"
                      >
                        Status
                      </SortableHeader>
                    )}
                    {visibleColumns.has("actions") && (
                      <TableHead className="px-4 h-10 text-right text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">
                        Actions
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.results.map((customer) => (
                    <TableRow key={customer.id} className="group hover:bg-gray-50/80 dark:hover:bg-gray-800/50 cursor-pointer transition-colors" onDoubleClick={() => router.push(`/customers/${customer.id}`)}>
                      {visibleColumns.has("checkbox") && (
                        <TableCell className="px-4 py-2 whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={bulkSelection.isSelected(customer.id)}
                            onChange={() => bulkSelection.toggleSelection(customer.id)}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                        </TableCell>
                      )}
                      {visibleColumns.has("name") && (
                        <TableCell className="px-4 py-2 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="h-8 w-8 rounded-full bg-blue-600 dark:bg-blue-700 flex items-center justify-center text-white font-medium text-xs flex-shrink-0">
                              {customer.user?.first_name?.[0]?.toUpperCase() || customer.full_name?.[0]?.toUpperCase() || customer.email?.[0]?.toUpperCase() || "C"}
                            </div>
                            <div className="ml-3">
                              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                {customer.full_name || customer.company_name || (customer.user?.first_name && customer.user?.last_name ? `${customer.user.first_name} ${customer.user.last_name}` : null) || "-"}
                              </div>
                              {customer.company_name && customer.full_name && (
                                <div className="text-xs text-gray-500 dark:text-gray-400">{customer.company_name}</div>
                              )}
                              {customer.user?.phone && (
                                <div className="text-xs text-gray-400 dark:text-gray-500">{customer.user.phone}</div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                      )}
                      {visibleColumns.has("email") && (
                        <TableCell className="px-4 py-2 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                          {customer.email || customer.user?.email || "-"}
                        </TableCell>
                      )}
                      {visibleColumns.has("type") && (
                        <TableCell className="px-4 py-2 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400 capitalize">
                          {customer.customer_type || "-"}
                        </TableCell>
                      )}
                      {visibleColumns.has("status") && (
                        <TableCell className="px-4 py-2 whitespace-nowrap">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] px-2 py-0.5 font-medium border shadow-none",
                              customer.status === "active" && "border-green-200 text-green-700 bg-green-50/50 dark:border-green-800 dark:text-green-400 dark:bg-green-900/30",
                              customer.status === "inactive" && "border-gray-200 text-gray-700 bg-gray-50/50 dark:border-gray-700 dark:text-gray-300 dark:bg-gray-800",
                              customer.status === "suspended" && "border-red-200 text-red-700 bg-red-50/50 dark:border-red-800 dark:text-red-400 dark:bg-red-900/30"
                            )}
                          >
                            {customer.status || "-"}
                          </Badge>
                        </TableCell>
                      )}
                      {visibleColumns.has("actions") && (
                        <TableCell className="px-4 py-2 whitespace-nowrap text-right">
                          <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" onClick={(e) => e.stopPropagation()} className="h-6 w-6 p-0 hover:bg-gray-100 dark:hover:bg-gray-800">
                                  <div className="flex gap-0.5">
                                    <div className="h-0.5 w-0.5 rounded-full bg-gray-500" />
                                    <div className="h-0.5 w-0.5 rounded-full bg-gray-500" />
                                    <div className="h-0.5 w-0.5 rounded-full bg-gray-500" />
                                  </div>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem onClick={() => router.push(`/customers/${customer.id}`)}>
                                  <Eye className="w-4 h-4 mr-2" />
                                  View Details
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => router.push(`/customers/${customer.id}/edit`)}>
                                  <Edit className="w-4 h-4 mr-2" />
                                  Edit Customer
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => router.push(`/customers/${customer.id}#notes`)}>
                                  <MessageSquare className="w-4 h-4 mr-2" />
                                  Add Note
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => router.push(`/vehicles/new?customer=${customer.id}`)}>
                                  <Package className="w-4 h-4 mr-2" />
                                  Add Vehicle
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => router.push(`/appointments/new?customer=${customer.id}`)}>
                                  <Calendar className="w-4 h-4 mr-2" />
                                  Schedule Appointment
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => router.push(`/workorders/new?customer=${customer.id}`)}>
                                  <Wrench className="w-4 h-4 mr-2" />
                                  Create Work Order
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <PermissionGuard permission="delete_customers">
                                  <DropdownMenuItem onClick={() => { if (window.confirm(`Delete customer "${customer.full_name || customer.company_name || 'this customer'}"?`)) handleDelete(customer); }} disabled={deleteMutation.isPending} className="text-red-600 dark:text-red-400">
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Delete Customer
                                  </DropdownMenuItem>
                                </PermissionGuard>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400">No customers found.</p>
              <Link href="/customers/new">
                <Button className="mt-4" variant="secondary">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Your First Customer
                </Button>
              </Link>
            </div>
          )}

          {/* Pagination */}
          {data && data.count > 0 && (
            <div className="mt-4 flex items-center justify-between">
              <div className="text-sm text-gray-700 dark:text-gray-300">
                Showing page {page} of {Math.ceil(data.count / 10)}
              </div>
              <div className="flex space-x-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={!data.previous}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!data.next}
                >
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
          const result = await customersApi.import(file);
          queryClient.invalidateQueries({ queryKey: ["customers"] });
          return result;
        }}
        title="Import Customers"
        description="Upload a CSV file with customer data. Required columns: first_name, last_name, email. Optional: phone, company_name, customer_type, status."
        onDownloadTemplate={downloadCustomerTemplate}
      />

      {/* Bulk Status Update Dialog */}
      <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Status for {bulkSelection.selectedCount} Customer(s)</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              New Status
            </label>
            <Select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
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
  );
}

