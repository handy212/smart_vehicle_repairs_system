"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customersApi } from "@/lib/api/customers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Plus, Search, Filter, Trash2, Download } from "lucide-react";
import Link from "next/link";
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
import { Upload } from "lucide-react";
import { downloadCustomerTemplate } from "@/lib/utils/import-templates";
import { exportCustomersForImport } from "@/lib/utils/export-templates";

export default function CustomersPage() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 500); // Debounce search by 500ms
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
    new Set(["checkbox", "customer_number", "name", "email", "type", "status", "actions"])
  );
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const columnConfigs: ColumnConfig[] = [
    { key: "customer_number", label: "Customer #", defaultVisible: true },
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
    queryKey: ["customers", page, debouncedSearch, statusFilter, typeFilter, startDate, endDate, advancedFilters, sortConfig],
    queryFn: () => {
      const ordering = sortConfig
        ? `${sortConfig.direction === "desc" ? "-" : ""}${sortConfig.field}`
        : undefined;
      return customersApi.list({
        page,
        search: debouncedSearch || undefined,
        status: advancedFilters.status || (statusFilter !== "all" ? statusFilter : undefined),
        customer_type: advancedFilters.customer_type || (typeFilter !== "all" ? typeFilter : undefined),
        created_at__gte: advancedFilters.customer_since_from || startDate || undefined,
        created_at__lte: advancedFilters.customer_since_to || endDate || undefined,
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
    if (confirm(`Are you sure you want to delete customer "${customer.full_name || customer.company_name || customer.customer_number}"? This action cannot be undone.`)) {
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
        { key: "customer_number", label: "Customer Number" },
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
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Customers</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage your customer database
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <ColumnVisibility
            columns={columnConfigs}
            visibleColumns={visibleColumns}
            onVisibilityChange={setVisibleColumns}
            title="Customer Table Columns"
          />
          <Button variant="outline" onClick={() => setShowImportDialog(true)}>
            <Upload className="w-4 h-4 mr-2" />
            Import CSV
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleExport} disabled={!data?.results || data.results.length === 0}>
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
            <Button 
              variant="outline" 
              onClick={() => {
                if (data?.results) {
                  exportCustomersForImport(data.results);
                }
              }} 
              disabled={!data?.results || data.results.length === 0}
              title="Export in import-compatible format"
            >
              <Download className="w-4 h-4 mr-2" />
              Export for Import
            </Button>
          </div>
          <Link href="/customers/new">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Add Customer
            </Button>
          </Link>
        </div>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-5 h-5" />
                <Input
                  type="text"
                  placeholder="Search customers by name, email, or customer number..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="pl-10"
                />
              </div>
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
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label htmlFor="status-filter" className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <Select
                  id="status-filter"
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="suspended">Suspended</option>
                </Select>
              </div>
              <div>
                <label htmlFor="type-filter" className="block text-sm font-medium text-gray-700 mb-1">
                  Customer Type
                </label>
                <Select
                  id="type-filter"
                  value={typeFilter}
                  onChange={(e) => {
                    setTypeFilter(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="all">All Types</option>
                  <option value="individual">Individual</option>
                  <option value="business">Business</option>
                  <option value="fleet">Fleet</option>
                </Select>
              </div>
              <div className="md:col-span-2">
                <DateRangePicker
                  startDate={startDate}
                  endDate={endDate}
                  onStartDateChange={(date) => {
                    setStartDate(date);
                    setPage(1);
                  }}
                  onEndDateChange={(date) => {
                    setEndDate(date);
                    setPage(1);
                  }}
                  label="Customer Since"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Action Toolbar */}
      <BulkActionToolbar
        selectedCount={bulkSelection.selectedCount}
        onClearSelection={bulkSelection.clearSelection}
        onBulkDelete={handleBulkDelete}
        onBulkStatusUpdate={handleBulkStatusUpdate}
        showStatusUpdate={true}
      />

      {/* Customers Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            All Customers ({data?.count || 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <TableSkeleton rows={8} columns={7} />
          ) : data?.results && data.results.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    {visibleColumns.has("checkbox") && (
                      <th className="px-6 py-3 text-left">
                        <input
                          type="checkbox"
                          checked={bulkSelection.isAllSelected}
                          ref={(input) => {
                            if (input) input.indeterminate = bulkSelection.isIndeterminate;
                          }}
                          onChange={bulkSelection.toggleSelectAll}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                      </th>
                    )}
                    {visibleColumns.has("customer_number") && (
                      <SortableHeader
                        field="customer_number"
                        sortConfig={sortConfig}
                        onSort={handleSort}
                      >
                        Customer #
                      </SortableHeader>
                    )}
                    {visibleColumns.has("name") && (
                      <SortableHeader
                        field="user__last_name"
                        sortConfig={sortConfig}
                        onSort={handleSort}
                      >
                        Name
                      </SortableHeader>
                    )}
                    {visibleColumns.has("email") && (
                      <SortableHeader
                        field="user__email"
                        sortConfig={sortConfig}
                        onSort={handleSort}
                      >
                        Email
                      </SortableHeader>
                    )}
                    {visibleColumns.has("type") && (
                      <SortableHeader
                        field="customer_type"
                        sortConfig={sortConfig}
                        onSort={handleSort}
                      >
                        Type
                      </SortableHeader>
                    )}
                    {visibleColumns.has("status") && (
                      <SortableHeader
                        field="status"
                        sortConfig={sortConfig}
                        onSort={handleSort}
                      >
                        Status
                      </SortableHeader>
                    )}
                    {visibleColumns.has("actions") && (
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                  {data.results.map((customer) => (
                    <tr key={customer.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors duration-150">
                      {visibleColumns.has("checkbox") && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={bulkSelection.isSelected(customer.id)}
                            onChange={() => bulkSelection.toggleSelection(customer.id)}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                        </td>
                      )}
                      {visibleColumns.has("customer_number") && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                          {customer.customer_number || "-"}
                        </td>
                      )}
                      {visibleColumns.has("name") && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                          {customer.full_name || customer.company_name || (customer.user?.first_name && customer.user?.last_name ? `${customer.user.first_name} ${customer.user.last_name}` : null) || "-"}
                        </td>
                      )}
                      {visibleColumns.has("email") && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {customer.email || customer.user?.email || "-"}
                        </td>
                      )}
                      {visibleColumns.has("type") && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 capitalize">
                          {customer.customer_type || "-"}
                        </td>
                      )}
                      {visibleColumns.has("status") && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`px-2 py-1 text-xs font-semibold rounded-full ${
                              customer.status === "active"
                                ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400"
                                : customer.status === "inactive"
                                ? "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-300"
                                : "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400"
                            }`}
                          >
                            {customer.status || "-"}
                          </span>
                        </td>
                      )}
                      {visibleColumns.has("actions") && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex items-center space-x-2">
                            <Link
                              href={`/customers/${customer.id}`}
                              className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300"
                            >
                              View
                            </Link>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(customer)}
                              disabled={deleteMutation.isPending}
                              className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400">No customers found.</p>
              <Link href="/customers/new">
                <Button className="mt-4" variant="outline">
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
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={!data.previous}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
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
              variant="outline"
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

