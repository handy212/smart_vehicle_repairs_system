"use client";

import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useInView } from "react-intersection-observer";
import { customersApi, type Customer } from "@/lib/api/customers";
import { reportingApi } from "@/lib/api/reporting";
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
import { useConfirmDialog } from "@/lib/hooks/useConfirmDialog";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { exportToExcel } from "@/lib/utils/excel-export";
import jsPDF from "jspdf";
import { useBulkSelection } from "@/lib/hooks/useBulkSelection";
import { BulkActionToolbar } from "@/components/ui/bulk-action-toolbar";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AdvancedFilters, FilterOption, QuickFilter } from "@/components/ui/advanced-filters";
import { SortableHeader, SortConfig } from "@/components/ui/sortable-header";
import { toggleSortConfig } from "@/lib/utils/table-sort";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ImportDialog } from "@/components/ui/import-dialog";
import { downloadCustomerTemplate } from "@/lib/utils/import-templates";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
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
import { CustomerStats } from "./components/CustomerStats";
import { CustomerTable } from "./components/CustomerTable";
import { getUserFacingError } from "@/lib/api/errors";

// Customer List Page


export default function CustomersPage() {
  const router = useRouter();
  const { formatCurrency } = useCurrency();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 500);
  const [page, setPage] = useState(1);
  const [customerType, setCustomerType] = useState<string>("all");
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);

  const [advancedFilters, setAdvancedFilters] = useState<Record<string, any>>({});

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const { hasPermission } = usePermissions();
  const canImportCustomers = hasPermission("create_customers") || hasPermission("manage_customers");
  const canExportCustomers = hasPermission("view_customers") || hasPermission("manage_customers");
  const canEditCustomers = hasPermission("edit_customers") || hasPermission("manage_customers");
  const canDeleteCustomers = hasPermission("delete_customers") || hasPermission("manage_customers");

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
      key: "created_at",
      label: "Customer Since",
      type: "daterange",
    },
    {
      key: "inactive_period",
      label: "Inactivity Period",
      type: "select",
      options: [
        { value: "3_months", label: "3 Months" },
        { value: "6_months", label: "6 Months" },
        { value: "1_year", label: "1 Year" },
        { value: "2_years", label: "2 Years" },
      ],
    },
    {
      key: "inactive_days",
      label: "Custom Inactivity (Days)",
      type: "number",
      placeholder: "e.g. 45",
    },
  ];

  const quickFilters: QuickFilter[] = useMemo(() => {
    const today = new Date();
    const last30Days = new Date(today);
    last30Days.setDate(today.getDate() - 30);

    return [
      {
        label: "Last 30 Days",
        value: "last_30_days",
        filters: {
          created_at__gte: last30Days.toISOString().split("T")[0],
          created_at__lte: today.toISOString().split("T")[0],
        },
      },
      {
        label: "Active Customers",
        value: "active",
        filters: { status: "active" },
      },
      {
        label: "Inactive > 6m",
        value: "inactive_6m",
        filters: { inactive_period: "6_months" },
      },
    ];
  }, []);

  const handleSort = useCallback((field: string) => {
    setSortConfig((current) => toggleSortConfig(current, field));
    setPage(1);
  }, []);

  // Fetch Dashboard Stats for KPIs
  const { data: dashboardOverview } = useQuery({
    queryKey: ["dashboard-overview"],
    queryFn: () => reportingApi.dashboard(),
  });

  // Fetch Customer Dashboard Stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["customer-stats"],
    queryFn: () => customersApi.dashboardStats(),
  });

  // Fetch Paginated Customers
  const { data: customerData, isLoading: customersLoading, error: customersError } = useQuery({
    queryKey: ["customers", page, debouncedSearch, customerType, sortConfig, advancedFilters],
    queryFn: async () => {
      const ordering = sortConfig
        ? `${sortConfig.direction === "desc" ? "-" : ""}${sortConfig.field}`
        : undefined;
      try {
        const response = await customersApi.list({
          page,
          search: debouncedSearch || undefined,
          customer_type: customerType === "all" ? (advancedFilters.customer_type || undefined) : customerType.toLowerCase(),
          status: advancedFilters.status || undefined,
          created_at__gte: advancedFilters.created_at_from || undefined,
          created_at__lte: advancedFilters.created_at_to || undefined,
          inactive_period: advancedFilters.inactive_days
            ? `custom_${advancedFilters.inactive_days}`
            : (advancedFilters.inactive_period || undefined),
          ordering,
        });
        return response;
      } catch (err: any) {
        if (err.response?.status === 404 && page > 1) {
          setPage(1);
        }
        throw err;
      }
    },
    retry: false,
  });

  const customers = customerData?.results || [];
  const totalCount = customerData?.count || 0;
  const pageSize = 20;
  const totalPages = Math.ceil(totalCount / pageSize);

  useEffect(() => {
    if (totalPages > 0 && page > totalPages) {
      setPage(totalPages);
    }
  }, [totalPages, page]);

  // Mutations
  const deleteMutation = useMutation({
    mutationFn: (id: number) => customersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast({ title: "Success", description: "Customer deleted successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: getUserFacingError(error, "Failed to delete customer"),
        variant: "destructive",
      });
    },
  });

  const handleDelete = useCallback(async (customer: any) => {
    const ok = await confirm({
      title: "Delete customer?",
      description: `Delete "${customer.full_name || customer.company_name || "this customer"}"? This cannot be undone.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (ok) deleteMutation.mutate(customer.id);
  }, [confirm, deleteMutation]);

  const getCustomerExportRows = () => customers.map((customer: Customer) => ({
    name: customer.company_name || customer.full_name || `${customer.user?.first_name || ""} ${customer.user?.last_name || ""}`.trim(),
    email: customer.email || customer.user?.email || "",
    phone: customer.phone || customer.user?.phone || "",
    type: customer.customer_type || "",
    status: customer.status || "",
    balance: Number(customer.current_balance || 0),
    vehicles: customer.vehicle_count ?? 0,
    last_visit: customer.last_visit_date ? new Date(customer.last_visit_date).toLocaleDateString() : "",
  }));

  const handleExport = (format: "xlsx" | "pdf") => {
    if (!customers || customers.length === 0) {
      toast({ title: "No Data", description: "No customers to export", variant: "destructive" });
      return;
    }

    const rows = getCustomerExportRows();
    const dateStamp = new Date().toISOString().split("T")[0];

    if (format === "xlsx") {
      exportToExcel(
        [
          ["Name", "Email", "Phone", "Type", "Vehicles", "Status", "Balance", "Last Visit"],
          ...rows.map((row) => [row.name, row.email, row.phone, row.type, row.vehicles, row.status, row.balance, row.last_visit]),
        ],
        `customers_${dateStamp}.xlsx`,
        {
          sheetName: "Customers",
          reportTitle: "Customers",
          dateInfo: `Exported records: ${rows.length}`,
          boldRows: [0],
          currencyColumns: [6],
          freezePane: { row: 1, col: 0 },
        }
      );
    } else {
      const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      const headers = ["Name", "Email", "Phone", "Type", "Vehicles", "Status", "Balance", "Last Visit"];
      const widths = [140, 160, 90, 70, 55, 70, 80, 80];
      let y = 72;

      pdf.setFontSize(14);
      pdf.text("Customers", 40, 40);
      pdf.setFontSize(8);
      pdf.text(`Exported ${rows.length} records on ${dateStamp}`, 40, 56);

      const drawHeader = () => {
        let x = 40;
        pdf.setFontSize(8);
        pdf.setFont("helvetica", "bold");
        headers.forEach((header, index) => {
          pdf.text(header, x, y);
          x += widths[index];
        });
        y += 14;
        pdf.setDrawColor(220);
        pdf.line(40, y - 8, 800, y - 8);
        pdf.setFont("helvetica", "normal");
      };

      drawHeader();
      rows.forEach((row) => {
        if (y > 560) {
          pdf.addPage();
          y = 48;
          drawHeader();
        }
        const values = [
          row.name,
          row.email,
          row.phone,
          row.type,
          String(row.vehicles),
          row.status,
          formatCurrency(row.balance),
          row.last_visit,
        ];
        let x = 40;
        values.forEach((value, index) => {
          pdf.text(String(value || "-").slice(0, index < 2 ? 32 : 18), x, y);
          x += widths[index];
        });
        y += 16;
      });
      pdf.save(`customers_${dateStamp}.pdf`);
    }

    toast({ title: "Success", description: `Customers exported as ${format.toUpperCase()}` });
  };

  return (
    <div className="space-y-6 p-4 max-w-[1700px] mx-auto pb-10">
      <DynamicPageTitle title="Customers" />

      {/* Header Section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tighter text-foreground">Customers</h1>
          <div className="perfex:block hidden">
            <Link href="/customers/contacts" className="text-xs text-primary hover:underline flex items-center gap-1">
              Contacts <span className="text-[10px]">→</span>
            </Link>
          </div>
        </div>

        <PermissionGuard permission="create_customers">
          <Link href="/customers/new" className="self-start sm:self-auto">
            <Button size="sm" className="h-9 shadow-sm hover:scale-[1.02] transition-all duration-300">
              <Plus className="w-4 h-4 mr-2" />
              Add Customer
            </Button>
          </Link>
        </PermissionGuard>
      </div>

      {/* KPI Stats Grid */}
      <CustomerStats
        stats={stats}
        isLoading={statsLoading}
        totalBalance={dashboardOverview?.alerts.overdue_invoices.total || 0}
      />

      {/* Table Controls Row */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-muted/20 p-1 rounded-xl">
        {/* Tabs */}
        <div className="flex items-center p-1 bg-muted rounded-xl w-full overflow-x-auto md:w-auto">
          {["All", "Individuals", "Companies"].map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setCustomerType(tab === "Companies" ? "business" : tab === "Individuals" ? "individual" : "all");
                setPage(1);
                setSearch("");
              }}
              className={cn(
                "px-4 py-2 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all",
                (tab === "All" && customerType === "all") ||
                  (tab === "Individuals" && customerType === "individual") ||
                  (tab === "Companies" && customerType === "business")
                  ? "bg-background text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Search & Actions */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <div className="relative min-w-0 flex-[1_1_100%] sm:flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-9 h-9 text-[11px] bg-muted border-none focus-visible:ring-1"
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
              setPage(1);
            }}
            title="Filter"
          />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-9 text-[9px] font-black uppercase tracking-widest gap-2">
                Actions
                <ChevronDown className="w-3 h-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {canImportCustomers && (
                <DropdownMenuItem onClick={() => setShowImportDialog(true)}>
                  <Upload className="w-4 h-4 mr-2" />
                  Import Excel
                </DropdownMenuItem>
              )}
              {canExportCustomers && (
                <>
                  {canImportCustomers && <DropdownMenuSeparator />}
                  <DropdownMenuItem onClick={() => handleExport("xlsx")}>
                    <Download className="w-4 h-4 mr-2" />
                    Export Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("pdf")}>
                    <FileDown className="w-4 h-4 mr-2" />
                    Export PDF
                  </DropdownMenuItem>
                </>
              )}
              {!canImportCustomers && !canExportCustomers && (
                <DropdownMenuItem disabled>
                  <Download className="w-4 h-4 mr-2" />
                  No actions available
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

        </div>
      </div>

      {/* Data Table */}
      <CustomerTable
        customers={customers}
        isLoading={customersLoading}
        formatCurrency={formatCurrency}
        sortConfig={sortConfig}
        onSort={handleSort}
        onDelete={canDeleteCustomers ? handleDelete : undefined}
        canEdit={canEditCustomers}
        canDelete={canDeleteCustomers}
      />

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
        description="Upload a customer Excel workbook (.xlsx). Download the template first so the columns match."
        accept=".xlsx"
        onDownloadTemplate={downloadCustomerTemplate}
      />

      {/* Pagination Footer */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 px-2">
        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
          Showing {Math.min((page - 1) * 10 + 1, totalCount)}-{Math.min(page * 10, totalCount)} of {totalCount} customers
        </span>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 disabled:opacity-30"
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
            aria-label="Previous page"
          >
            &lt;
          </Button>

          {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => (
            <Button
              key={i}
              variant={page === i + 1 ? "default" : "outline"}
              className="h-8 w-8 text-[10px] font-bold"
              onClick={() => setPage(i + 1)}
            >
              {i + 1}
            </Button>
          ))}

          {totalPages > 5 && <span className="text-muted-foreground px-2">...</span>}

          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 disabled:opacity-30"
            disabled={!customerData?.next}
            onClick={() => setPage(p => p + 1)}
            aria-label="Next page"
          >
            &gt;
          </Button>
        </div>
      </div>
      <ConfirmDialog />
    </div>
  );
}
