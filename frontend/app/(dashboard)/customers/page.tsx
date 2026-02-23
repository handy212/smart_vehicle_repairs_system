"use client";

import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useInView } from "react-intersection-observer";
import { customersApi } from "@/lib/api/customers";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Plus, Search, Filter, Trash2, Download, X, Upload, ChevronDown, FileDown, FileUp, MoreVertical, MoreHorizontal, Eye, Edit, Mail, UserCheck, UserX, MessageSquare, Calendar, Wrench, Package, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useMemo, useCallback, memo, useEffect } from "react";
import { useToast } from "@/lib/hooks/useToast";
import { useDebounce } from "@/lib/hooks/useDebounce";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { exportToCSV, formatDateForCSV } from "@/lib/utils/export";
import { useBulkSelection } from "@/lib/hooks/useBulkSelection";
import { BulkActionToolbar } from "@/components/ui/bulk-action-toolbar";
import { TableSkeleton } from "@/components/ui/table-skeleton";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AdvancedFilters, FilterOption, QuickFilter } from "@/components/ui/advanced-filters";
import { SortableHeader, SortConfig } from "@/components/ui/sortable-header";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ColumnVisibility, ColumnConfig } from "@/components/ui/column-visibility";
import { ImportDialog } from "@/components/ui/import-dialog";
import { downloadCustomerTemplate } from "@/lib/utils/import-templates";
import { exportCustomersForImport } from "@/lib/utils/export-templates";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
import { DynamicPageTitle } from "@/components/shared/DynamicPageTitle";

import { useCurrency } from "@/lib/hooks/useCurrency";

// Memoized Customer Row Component
interface CustomerRowProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  customer: any;
  visibleColumns: Set<string>;
  formatCurrency: (amount: number) => string;
  bulkSelection: ReturnType<typeof useBulkSelection>;
  router: ReturnType<typeof useRouter>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onDelete: (customer: any) => void;
}

const CustomerRow = memo(function CustomerRow({
  customer,
  visibleColumns,
  formatCurrency,
  bulkSelection,
  router,
  onDelete,
}: CustomerRowProps) {
  return (
    <TableRow key={customer.id} className="group hover:bg-muted/80 hover:bg-muted/50 cursor-pointer transition-colors" onDoubleClick={() => router.push(`/customers/${customer.id}`)}>
      {visibleColumns.has("checkbox") && (
        <TableCell className="px-4 py-2 whitespace-nowrap">
          <input
            type="checkbox"
            checked={bulkSelection.isSelected(customer.id)}
            onChange={() => bulkSelection.toggleSelection(customer.id)}
            className="h-4 w-4 text-primary focus:ring-primary border-border rounded"
          />
        </TableCell>
      )}
      {visibleColumns.has("name") && (
        <TableCell className="px-4 py-2 whitespace-nowrap">
          <div className="flex items-center">
            <div className="h-8 w-8 rounded-full bg-primary dark:bg-orange-700 flex items-center justify-center text-white font-medium text-xs flex-shrink-0">
              {customer.user?.first_name?.[0]?.toUpperCase() || customer.full_name?.[0]?.toUpperCase() || customer.email?.[0]?.toUpperCase() || "C"}
            </div>
            <div className="ml-3">
              <div className="text-sm font-medium text-foreground">
                {customer.full_name || customer.company_name || (customer.user?.first_name && customer.user?.last_name ? `${customer.user.first_name} ${customer.user.last_name}` : null) || "-"}
              </div>
              {customer.company_name && customer.full_name && (
                <div className="text-xs text-muted-foreground">{customer.company_name}</div>
              )}
              {customer.user?.phone && (
                <div className="text-xs text-muted-foreground">{customer.user.phone}</div>
              )}
            </div>
          </div>
        </TableCell>
      )}
      {visibleColumns.has("email") && (
        <TableCell className="px-4 py-2 whitespace-nowrap text-sm text-muted-foreground">
          {customer.email || customer.user?.email || "-"}
        </TableCell>
      )}
      {visibleColumns.has("type") && (
        <TableCell className="px-4 py-2 whitespace-nowrap">
          <Badge variant="outline" className="capitalize text-muted-foreground border-border">
            {customer.customer_type || "-"}
          </Badge>
        </TableCell>
      )}
      {visibleColumns.has("balance") && (
        <TableCell className="px-4 py-2 whitespace-nowrap text-right text-sm font-medium">
          <span className={cn(
            parseFloat(customer.current_balance || "0") > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
          )}>
            {formatCurrency(parseFloat(customer.current_balance || "0"))}
          </span>
        </TableCell>
      )}
      {visibleColumns.has("created_at") && (
        <TableCell className="px-4 py-2 whitespace-nowrap text-sm text-muted-foreground">
          {new Date(customer.created_at).toLocaleDateString()}
        </TableCell>
      )}
      {visibleColumns.has("last_visit") && (
        <TableCell className="px-4 py-2 whitespace-nowrap">
          <div className="flex flex-col gap-1">
            {customer.last_visit_date ? (
              <>
                <span className="text-sm text-foreground">
                  {new Date(customer.last_visit_date).toLocaleDateString()}
                </span>
                {customer.days_since_last_visit !== null && customer.days_since_last_visit !== undefined && (
                  <span className={cn(
                    "text-xs",
                    customer.days_since_last_visit >= 730 ? "text-red-600 dark:text-red-400 font-semibold" :
                      customer.days_since_last_visit >= 365 ? "text-primary" :
                        customer.days_since_last_visit >= 180 ? "text-yellow-600 dark:text-yellow-400" :
                          "text-muted-foreground"
                  )}>
                    {customer.days_since_last_visit} days ago
                  </span>
                )}
              </>
            ) : (
              <span className="text-sm text-muted-foreground italic">Never visited</span>
            )}
            {customer.is_inactive && (
              <Badge
                variant="danger"
                className="text-[10px] px-1.5 py-0.5 mt-1 w-fit"
              >
                Inactive
              </Badge>
            )}
          </div>
        </TableCell>
      )
      }
      {
        visibleColumns.has("status") && (
          <TableCell className="px-4 py-2 whitespace-nowrap">
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] px-2 py-0.5 font-medium border shadow-none",
                customer.status === "active" && "border-green-200 text-green-700 bg-success/10 dark:border-green-800 dark:text-green-400 dark:bg-green-900/30",
                customer.status === "inactive" && "border-border text-foreground bg-muted/50 border-border text-foreground bg-muted",
                customer.status === "suspended" && "border-red-200 text-red-700 bg-red-50/50 dark:border-red-800 dark:text-red-400 dark:bg-red-900/30"
              )}
            >
              {customer.status || "-"}
            </Badge>
          </TableCell>
        )
      }
      {
        visibleColumns.has("actions") && (
          <TableCell className="px-4 py-2 whitespace-nowrap text-right">
            <div className="flex justify-end transition-opacity">
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => e.stopPropagation()}
                        className="h-8 w-8 p-0 hover:bg-primary/10 hover:text-primary transition-colors focus-visible:ring-1"
                        aria-label="Customer actions"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    <p>Actions</p>
                  </TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => router.push(`/customers/${customer.id}`)}>
                    <Eye className="w-4 h-4 mr-2" />
                    View Details
                  </DropdownMenuItem>
                  <PermissionGuard permission="edit_customers">
                    <DropdownMenuItem onClick={() => router.push(`/customers/${customer.id}/edit`)}>
                      <Edit className="w-4 h-4 mr-2" />
                      Edit Customer
                    </DropdownMenuItem>
                  </PermissionGuard>
                  <PermissionGuard permission="edit_customers">
                    <DropdownMenuItem onClick={() => router.push(`/customers/${customer.id}#notes`)}>
                      <MessageSquare className="w-4 h-4 mr-2" />
                      Add Note
                    </DropdownMenuItem>
                  </PermissionGuard>
                  <PermissionGuard permission="send_notifications">
                    <DropdownMenuItem onClick={() => router.push(`/sms?recipient_id=${customer.user?.id}&recipient_name=${encodeURIComponent(customer.full_name || customer.company_name || '')}&phone=${customer.user?.phone || ''}`)}>
                      <MessageSquare className="w-4 h-4 mr-2" />
                      Send SMS
                    </DropdownMenuItem>
                  </PermissionGuard>
                  <DropdownMenuSeparator />
                  <PermissionGuard permission="create_vehicles">
                    <DropdownMenuItem onClick={() => router.push(`/vehicles/new?customer=${customer.id}`)}>
                      <Package className="w-4 h-4 mr-2" />
                      Add Vehicle
                    </DropdownMenuItem>
                  </PermissionGuard>
                  <PermissionGuard permission="create_workorders">
                    <DropdownMenuItem onClick={() => router.push(`/workorders/new?customer=${customer.id}`)}>
                      <Wrench className="w-4 h-4 mr-2" />
                      Create Work Order
                    </DropdownMenuItem>
                  </PermissionGuard>
                  <PermissionGuard permission="create_appointments">
                    <DropdownMenuItem onClick={() => router.push(`/appointments/new?customer=${customer.id}`)}>
                      <Calendar className="w-4 h-4 mr-2" />
                      Schedule Appointment
                    </DropdownMenuItem>
                  </PermissionGuard>
                  <DropdownMenuSeparator />
                  <PermissionGuard permission="delete_customers">
                    <DropdownMenuItem onClick={() => onDelete(customer)} className="text-red-600 dark:text-red-400">
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </PermissionGuard>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </TableCell>
        )
      }
    </TableRow >
  );
});

export default function CustomersPage() {
  const router = useRouter();
  const { formatCurrency } = useCurrency();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 500);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [statusFilter, setStatusFilter] = useState<string>("all");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [typeFilter, setTypeFilter] = useState<string>("all");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [startDate, setStartDate] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [endDate, setEndDate] = useState("");
  const [inactivePeriod, setInactivePeriod] = useState<string | null>(null);
  const [customDays, setCustomDays] = useState<number>(180);
  const [showCustomDaysInput, setShowCustomDaysInput] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [newStatus, setNewStatus] = useState<string>("active");
  const [showImportDialog, setShowImportDialog] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [advancedFilters, setAdvancedFilters] = useState<Record<string, any>>({});
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    new Set(["checkbox", "name", "email", "type", "balance", "last_visit", "created_at", "status", "actions"])
  );
  const queryClient = useQueryClient();
  const { toast } = useToast();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { hasPermission } = usePermissions();

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const columnConfigs: ColumnConfig[] = [
    { key: "name", label: "Name", defaultVisible: true },
    { key: "email", label: "Email", defaultVisible: true },
    { key: "type", label: "Type", defaultVisible: true },
    { key: "balance", label: "Balance", defaultVisible: true },
    { key: "last_visit", label: "Last Visit", defaultVisible: true },
    { key: "created_at", label: "Joined", defaultVisible: true },
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

  const handleSort = useCallback((field: string) => {
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
  }, []);

  const { data: stats } = useQuery({
    queryKey: ["customer-stats"],
    queryFn: () => customersApi.dashboardStats(),
  });

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["customers", debouncedSearch, advancedFilters, sortConfig, inactivePeriod],
    queryFn: ({ pageParam = 1 }) => {
      const ordering = sortConfig
        ? `${sortConfig.direction === "desc" ? "-" : ""}${sortConfig.field}`
        : undefined;
      return customersApi.list({
        page: pageParam as number,
        search: debouncedSearch || undefined,
        status: advancedFilters.status || undefined,
        customer_type: advancedFilters.customer_type || undefined,
        created_at__gte: advancedFilters.customer_since_from || undefined,
        created_at__lte: advancedFilters.customer_since_to || undefined,
        loyalty_tier: advancedFilters.loyalty_tier || undefined,
        inactive_period: inactivePeriod || undefined,
        ordering,
      });
    },
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

  const customers = useMemo(() => {
    return data?.pages.flatMap((page) => page.results || []) || [];
  }, [data]);
  const bulkSelection = useBulkSelection(customers);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => customersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast({ title: "Success", description: "Customer deleted successfully" });
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to update status",
        variant: "destructive",
      });
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleDelete = useCallback((customer: any) => {
    if (confirm(`Are you sure you want to delete customer "${customer.full_name || customer.company_name || customer.user?.email || 'this customer'}"? This action cannot be undone.`)) {
      deleteMutation.mutate(customer.id);
    }
  }, [deleteMutation]);

  const handleBulkDelete = useCallback(() => {
    if (confirm(`Are you sure you want to delete ${bulkSelection.selectedCount} customer(s)? This action cannot be undone.`)) {
      bulkDeleteMutation.mutate(bulkSelection.selectedIds);
    }
  }, [bulkSelection.selectedCount, bulkSelection.selectedIds, bulkDeleteMutation]);

  const handleBulkStatusUpdate = useCallback(() => {
    setShowStatusDialog(true);
  }, []);

  const confirmBulkStatusUpdate = useCallback(() => {
    bulkStatusUpdateMutation.mutate({
      ids: bulkSelection.selectedIds,
      status: newStatus,
    });
  }, [bulkSelection.selectedIds, newStatus, bulkStatusUpdateMutation]);

  const handleExport = () => {
    if (!customers || customers.length === 0) {
      toast({
        title: "No Data",
        description: "No customers to export",
        variant: "destructive",
      });
      return;
    }

    exportToCSV(
      customers,
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
            <div className="h-9 w-48 bg-border rounded animate-pulse mb-2"></div>
            <div className="h-5 w-64 bg-border rounded animate-pulse"></div>
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
      {/* Page Title & Stats */}
      <DynamicPageTitle title="Customers" />
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">Customers</h1>
          <p className="text-sm text-muted-foreground">Manage your customer database</p>
        </div>

        {/* Stats Grid - Small Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <Card className="shadow-sm border bg-card">
            <CardContent className="p-3 flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total</span>
              <span className="text-lg font-bold text-foreground">{stats?.total_customers || 0}</span>
            </CardContent>
          </Card>
          <Card className="shadow-sm border bg-card">
            <CardContent className="p-3 flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active</span>
              <span className="text-lg font-bold text-success">{stats?.active_customers || 0}</span>
            </CardContent>
          </Card>
          <Card className="shadow-sm border bg-card">
            <CardContent className="p-3 flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Inactive</span>
              <span className="text-lg font-bold text-muted-foreground">{stats?.inactive_customers || 0}</span>
            </CardContent>
          </Card>
          <Card className="shadow-sm border bg-card">
            <CardContent className="p-3 flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active Contact</span>
              <span className="text-lg font-bold text-primary">{stats?.active_contacts || 0}</span>
            </CardContent>
          </Card>
          <Card className="shadow-sm border bg-card">
            <CardContent className="p-3 flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Inactive Contact</span>
              <span className="text-lg font-bold text-muted-foreground">{stats?.inactive_contacts || 0}</span>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Unified Toolbar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card/50 p-1 rounded-lg">
        <div className="flex items-center gap-2 flex-1 w-full md:w-auto">
          {/* Search */}
          <div className="relative flex-1 md:flex-none md:w-64">
            <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
              }}
              className="pl-9 h-9 text-sm bg-muted border-none focus:ring-1 transition-all"
            />
          </div>

          {/* Inactive Period Filter */}
          <Select
            value={inactivePeriod?.startsWith('custom_') ? "custom" : (inactivePeriod || "all")}
            onValueChange={(value) => {
              if (value === "all") {
                setInactivePeriod(null);
                setShowCustomDaysInput(false);
              } else if (value === "custom") {
                setShowCustomDaysInput(true);
                setInactivePeriod(`custom_${customDays}`);
              } else {
                setInactivePeriod(value);
                setShowCustomDaysInput(false);
              }
            }}
          >
            <SelectTrigger className="h-9 w-[180px] text-sm bg-muted border-none">
              <SelectValue placeholder="Inactive Period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Customers</SelectItem>
              <SelectItem value="3_months">Inactive 3+ Months</SelectItem>
              <SelectItem value="6_months">Inactive 6+ Months</SelectItem>
              <SelectItem value="1_year">Inactive 1+ Year</SelectItem>
              <SelectItem value="2_years">Inactive 2+ Years</SelectItem>
              <SelectItem value="custom">Custom Period</SelectItem>
            </SelectContent>
          </Select>

          {/* Custom Days Input */}
          {showCustomDaysInput && (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                placeholder="Days"
                value={customDays}
                onChange={(e) => {
                  const days = parseInt(e.target.value) || 180;
                  setCustomDays(days);
                  setInactivePeriod(`custom_${days}`);
                }}
                className="h-9 w-24 text-sm bg-muted border-none"
                min="1"
              />
              <span className="text-xs text-muted-foreground">days</span>
            </div>
          )}

          {/* Advanced Filters Button */}
          <AdvancedFilters
            filters={filterOptions}
            quickFilters={quickFilters}
            activeFilters={advancedFilters}
            onFiltersChange={(filters) => {
              setAdvancedFilters(filters);
            }}
            onClear={() => {
              setAdvancedFilters({});
              setStatusFilter("all");
              setTypeFilter("all");
              setStartDate("");
              setEndDate("");
              setInactivePeriod(null);
              setShowCustomDaysInput(false);
            }}
            title="Filter"
          />

          {/* Clear Filters (Icon only for compactness) */}
          {(search || Object.keys(advancedFilters).length > 0 || inactivePeriod) && (
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
                setInactivePeriod(null);
                setShowCustomDaysInput(false);
              }}
              className="h-9 w-9 p-0 text-muted-foreground hover:text-red-600"
              title="Clear all filters"
            >
              <X className="w-4 h-4" />
            </Button>
          )}

          {/* Active Filter Badges (Inline if possible, or wrapped) */}
          <div className="hidden lg:flex flex-wrap items-center gap-1.5 ml-2">
            {Object.entries(advancedFilters).map(([key, value]) => {
              if (!value || (typeof value === 'string' && value === '')) return null;
              const filter = filterOptions.find((f) => f.key === key || f.key === key.replace("_from", "").replace("_to", ""));
              if (!filter && !key.includes("_from") && !key.includes("_to")) return null;
              if (key.includes("_to")) return null;

              return (
                <Badge key={key} variant="secondary" className="text-[10px] px-1.5 h-6 flex items-center gap-1 bg-border text-muted-foreground font-normal">
                  {String(value)}
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
              <Button variant="outline" size="sm" className="h-9">
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
                <DropdownMenuItem onClick={handleExport} disabled={!customers || customers.length === 0}>
                  <Download className="w-4 h-4 mr-2" />
                  Export CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { if (customers) exportCustomersForImport(customers); }} disabled={!customers || customers.length === 0}>
                  <FileDown className="w-4 h-4 mr-2" />
                  Export for Import
                </DropdownMenuItem>
              </PermissionGuard>
            </DropdownMenuContent>
          </DropdownMenu>
          <PermissionGuard permission="create_customers">
            <Link href="/customers/new">
              <Button size="sm" className="h-9">
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Customer
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
      />

      {/* Customers Table */}
      <Card className="border-t shadow-sm bg-muted border-border">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6">
              <TableSkeleton rows={8} columns={6} />
            </div>
          ) : customers && customers.length > 0 ? (
            <div className="rounded-md">
              <Table>
                <TableHeader className="bg-muted/50 hover:bg-muted/50">
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
                          className="h-4 w-4 text-primary focus:ring-primary border-border rounded"
                        />
                      </TableHead>
                    )}
                    {visibleColumns.has("name") && (
                      <SortableHeader
                        field="user__last_name"
                        sortConfig={sortConfig}
                        onSort={handleSort}
                        className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground"
                      >
                        Name
                      </SortableHeader>
                    )}
                    {visibleColumns.has("email") && (
                      <SortableHeader
                        field="user__email"
                        sortConfig={sortConfig}
                        onSort={handleSort}
                        className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground"
                      >
                        Email
                      </SortableHeader>
                    )}
                    {visibleColumns.has("type") && (
                      <SortableHeader
                        field="customer_type"
                        sortConfig={sortConfig}
                        onSort={handleSort}
                        className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground"
                      >
                        Type
                      </SortableHeader>
                    )}
                    {visibleColumns.has("balance") && (
                      <SortableHeader
                        field="current_balance"
                        sortConfig={sortConfig}
                        onSort={handleSort}
                        className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground text-right"
                      >
                        Balance
                      </SortableHeader>
                    )}
                    {visibleColumns.has("last_visit") && (
                      <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                        Last Visit
                      </TableHead>
                    )}
                    {visibleColumns.has("created_at") && (
                      <SortableHeader
                        field="created_at"
                        sortConfig={sortConfig}
                        onSort={handleSort}
                        className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground"
                      >
                        Joined
                      </SortableHeader>
                    )}
                    {visibleColumns.has("status") && (
                      <SortableHeader
                        field="status"
                        sortConfig={sortConfig}
                        onSort={handleSort}
                        className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground"
                      >
                        Status
                      </SortableHeader>
                    )}
                    {visibleColumns.has("actions") && (
                      <TableHead className="px-4 h-10 text-right text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                        Actions
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {customers.map((customer: any) => (
                    <CustomerRow
                      key={customer.id}
                      customer={customer}
                      visibleColumns={visibleColumns}
                      formatCurrency={formatCurrency}
                      bulkSelection={bulkSelection}
                      router={router}
                      onDelete={handleDelete}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No customers found.</p>
              <PermissionGuard permission="create_customers">
                <Link href="/customers/new">
                  <Button className="mt-4" variant="secondary">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Your First Customer
                  </Button>
                </Link>
              </PermissionGuard>
            </div>
          )}

          {/* Pagination */}
          {data && data.pages[0]?.count > 0 && (
            <div className="p-4 border-t border-border flex flex-col items-center justify-center space-y-2">
              <div className="text-sm text-card-foreground">
                Showing {customers.length} of {data.pages[0].count}
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
            <label className="block text-sm font-medium text-card-foreground mb-2">
              New Status
            </label>
            <Select
              value={newStatus}
              onValueChange={(val) => setNewStatus(val)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
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
    </div>
  );
}

