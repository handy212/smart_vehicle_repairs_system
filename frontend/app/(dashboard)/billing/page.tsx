"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { billingApi } from "@/lib/api/billing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Plus, Search, Receipt, DollarSign, Trash2, Download, CheckCircle2, AlertCircle, X, MoreVertical, Eye, Edit, Copy, Mail, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { useToast } from "@/lib/hooks/useToast";
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

export default function BillingPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [newStatus, setNewStatus] = useState<string>("sent");
  const [advancedFilters, setAdvancedFilters] = useState<Record<string, any>>({});
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const router = useRouter();
  const { hasPermission } = usePermissions();

  // Advanced filter options
  const filterOptions: FilterOption[] = [
    {
      key: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "draft", label: "Draft" },
        { value: "proforma", label: "Proforma" },
        { value: "sent", label: "Sent" },
        { value: "viewed", label: "Viewed" },
        { value: "partial", label: "Partial" },
        { value: "paid", label: "Paid" },
        { value: "overdue", label: "Overdue" },
      ],
    },
    {
      key: "invoice_date",
      label: "Invoice Date",
      type: "daterange",
    },
  ];

  const quickFilters: QuickFilter[] = [
    {
      label: "This Month",
      value: "this_month",
      filters: {
        invoice_date_from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0],
        invoice_date_to: new Date().toISOString().split("T")[0],
      },
    },
    {
      label: "Last 30 Days",
      value: "last_30_days",
      filters: {
        invoice_date_from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        invoice_date_to: new Date().toISOString().split("T")[0],
      },
    },
    {
      label: "Unpaid",
      value: "unpaid",
      filters: {
        status: "sent",
      },
    },
    {
      label: "Overdue",
      value: "overdue",
      filters: {
        status: "overdue",
      },
    },
    {
      label: "Proforma",
      value: "proforma",
      filters: {
        status: "proforma",
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

  const { data, isLoading, error } = useQuery({
    queryKey: ["invoices", page, search, advancedFilters, sortConfig],
    queryFn: () => {
      const ordering = sortConfig
        ? `${sortConfig.direction === "desc" ? "-" : ""}${sortConfig.field}`
        : undefined;
      return billingApi.invoices.list({
        page,
        search: search || undefined,
        status: advancedFilters.status || undefined,
        invoice_date__gte: advancedFilters.invoice_date_from || undefined,
        invoice_date__lte: advancedFilters.invoice_date_to || undefined,
        ordering,
      });
    },
  });

  const invoices = data?.results || [];
  const bulkSelection = useBulkSelection(invoices);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => billingApi.invoices.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast({ title: "Success", description: "Invoice deleted successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to delete invoice",
        variant: "destructive",
      });
    },
  });

  const handleDelete = (invoice: any) => {
    if (confirm(`Are you sure you want to delete invoice "${invoice.invoice_number}"? This action cannot be undone.`)) {
      deleteMutation.mutate(invoice.id);
    }
  };

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await Promise.all(ids.map((id) => billingApi.invoices.delete(id)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      bulkSelection.clearSelection();
      toast({ title: "Success", description: `${bulkSelection.selectedCount} invoices deleted successfully` });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to delete invoices",
        variant: "destructive",
      });
    },
  });

  const bulkStatusUpdateMutation = useMutation({
    mutationFn: async ({ ids, status }: { ids: number[]; status: string }) => {
      await Promise.all(
        ids.map((id) =>
          billingApi.invoices.update(id, {
            status: status as any,
          })
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      bulkSelection.clearSelection();
      setShowStatusDialog(false);
      toast({ title: "Success", description: `Status updated for ${bulkSelection.selectedCount} invoices` });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to update status",
        variant: "destructive",
      });
    },
  });

  const bulkSendMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await Promise.all(ids.map((id) => billingApi.invoices.send(id)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      bulkSelection.clearSelection();
      toast({ title: "Success", description: `Sent ${bulkSelection.selectedCount} invoice(s) successfully` });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to send invoices",
        variant: "destructive",
      });
    },
  });

  const handleBulkDelete = () => {
    if (confirm(`Are you sure you want to delete ${bulkSelection.selectedCount} invoice(s)? This action cannot be undone.`)) {
      bulkDeleteMutation.mutate(bulkSelection.selectedIds);
    }
  };

  const handleBulkStatusUpdate = () => {
    setShowStatusDialog(true);
  };

  const handleBulkSend = () => {
    if (confirm(`Send ${bulkSelection.selectedCount} invoice(s) to customers?`)) {
      bulkSendMutation.mutate(bulkSelection.selectedIds);
    }
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
        description: "No invoices to export",
        variant: "destructive",
      });
      return;
    }

    exportToCSV(
      data.results,
      "invoices",
      [
        { key: "invoice_number", label: "Invoice Number" },
        { key: "customer_name", label: "Customer" },
        { key: "invoice_date", label: "Invoice Date" },
        { key: "due_date", label: "Due Date" },
        { key: "total", label: "Total" },
        { key: "balance_due", label: "Balance Due" },
        { key: "status", label: "Status" },
      ]
    );

    toast({ title: "Success", description: "Invoices exported successfully" });
  };

  if (isLoading && !data) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <div className="h-9 w-48 bg-gray-200 rounded animate-pulse mb-2"></div>
            <div className="h-5 w-64 bg-gray-200 rounded animate-pulse"></div>
          </div>
        </div>
        <Card>
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
        Error loading invoices. Please try again.
      </div>
    );
  }

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "paid":
        return "success";
      case "sent":
      case "viewed":
        return "info";
      case "partial":
        return "warning";
      case "overdue":
        return "danger";
      case "proforma":
        return "secondary";
      default:
        return "default";
    }
  };

  // Calculate summary stats
  const totalInvoices = data?.count || 0;
  const totalAmount = data?.results?.reduce((sum, inv) => sum + parseFloat(inv.total || "0"), 0) || 0;
  const paidAmount = data?.results
    ?.filter((inv) => inv.status === "paid")
    .reduce((sum, inv) => sum + parseFloat(inv.total || "0"), 0) || 0;
  const outstandingAmount = data?.results
    ?.filter((inv) => inv.status !== "paid")
    .reduce((sum, inv) => sum + parseFloat(inv.balance_due || "0"), 0) || 0;

  return (
    <div className="space-y-4 min-h-screen">
      <div className="flex items-center justify-between pt-2">
        <div>
          <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-1">
            <Link href="/dashboard" className="hover:text-blue-600 transition-colors">Dashboard</Link>
            <span>/</span>
            <span className="text-gray-900 dark:text-gray-100 font-medium">Billing</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">Billing & Invoicing</h1>
        </div>
        <div className="flex items-center space-x-2">
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowActionsMenu(!showActionsMenu)}
              className="h-9 dark:border-gray-700 dark:text-gray-200"
            >
              Actions
              <ChevronDown className="w-3.5 h-3.5 ml-2" />
            </Button>
            {showActionsMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowActionsMenu(false)}
                />
                <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-20">
                  <div className="py-1">
                    <PermissionGuard permission="export_billing">
                      <button
                        onClick={() => {
                          handleExport();
                          setShowActionsMenu(false);
                        }}
                        disabled={!data?.results || data.results.length === 0}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        <Download className="w-4 h-4" />
                        Export CSV
                      </button>
                    </PermissionGuard>
                  </div>
                </div>
              </>
            )}
          </div>
          <PermissionGuard permission="create_invoices">
            <div className="flex items-center gap-2">
              <Link href="/billing/invoices/new?type=proforma">
                <Button variant="outline" size="sm" className="h-9">
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  New Proforma
                </Button>
              </Link>
              <Link href="/billing/invoices/new">
                <Button size="sm" className="h-9">
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  New Invoice
                </Button>
              </Link>
            </div>
          </PermissionGuard>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="shadow-none border-none bg-gray-50/50">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Invoices</span>
            <div className="flex items-end justify-between">
              <span className="text-xl font-bold text-gray-900">{totalInvoices}</span>
              <Receipt className="w-5 h-5 text-gray-400 mb-0.5" />
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-none border-none bg-gray-50/50">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Revenue</span>
            <div className="flex items-end justify-between">
              <span className="text-xl font-bold text-gray-900">${totalAmount.toFixed(2)}</span>
              <DollarSign className="w-5 h-5 text-gray-400 mb-0.5" />
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-none border-none bg-gray-50/50">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Paid</span>
            <div className="flex items-end justify-between">
              <span className="text-xl font-bold text-green-600">${paidAmount.toFixed(2)}</span>
              <CheckCircle2 className="w-5 h-5 text-green-500/50 mb-0.5" />
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-none border-none bg-gray-50/50">
          <CardContent className="p-4 flex flex-col gap-1">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Outstanding</span>
            <div className="flex items-end justify-between">
              <span className="text-xl font-bold text-red-600">${outstandingAmount.toFixed(2)}</span>
              <AlertCircle className="w-5 h-5 text-red-500/50 mb-0.5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Compact Filter Bar */}
      <Card className="border-none shadow-sm bg-gray-50/50">
        <CardContent className="p-3">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
                <Input
                  type="text"
                  placeholder="Search invoices..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="pl-9 h-8 text-sm bg-white dark:bg-gray-900 w-64 focus:w-80 transition-all duration-300"
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
                  setStatusFilter("");
                  setStartDate("");
                  setEndDate("");
                }}
                title="Advanced Invoice Filters"
              />

              {/* Clear Filters */}
              {(search || Object.keys(advancedFilters).length > 0) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setAdvancedFilters({});
                    setStatusFilter("");
                    setStartDate("");
                    setEndDate("");
                    setPage(1);
                  }}
                  className="h-8 text-gray-500 hover:text-red-600"
                >
                  <X className="w-3.5 h-3.5 mr-1" />
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
        </CardContent>
      </Card>

      {/* Bulk Action Toolbar */}
      <BulkActionToolbar
        selectedCount={bulkSelection.selectedCount}
        onClearSelection={bulkSelection.clearSelection}
        onBulkDelete={handleBulkDelete}
        onBulkStatusUpdate={handleBulkStatusUpdate}
        onBulkSend={handleBulkSend}
        showStatusUpdate={true}
        showBulkSend={true}
      />

      {/* Invoices Table */}
      <Card className="border-t shadow-sm">
        <CardHeader className="py-3 px-4 border-b bg-gray-50/30">
          <CardTitle className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            All Invoices <span className="text-muted-foreground font-normal ml-1">({data?.count || 0})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <TableSkeleton rows={8} columns={10} />
          ) : data?.results && data.results.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/50 hover:bg-gray-50/50">
                    <TableHead className="w-[40px] px-4">
                      <input
                        type="checkbox"
                        checked={bulkSelection.isAllSelected}
                        ref={(input) => {
                          if (input) input.indeterminate = bulkSelection.isIndeterminate;
                        }}
                        onChange={bulkSelection.toggleSelectAll}
                        className="h-3.5 w-3.5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                    </TableHead>
                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500">Invoice #</TableHead>
                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500">Customer</TableHead>
                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500">Dates</TableHead>
                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500 text-right">Amount</TableHead>
                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500 text-right">Balance</TableHead>
                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500">Status</TableHead>
                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500 text-center">Sync</TableHead>
                    <TableHead className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500 text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.results.map((invoice) => (
                    <TableRow
                      key={invoice.id}
                      className="group hover:bg-gray-50/80 transition-colors border-b border-gray-100 last:border-0 data-[state=selected]:bg-blue-50/30 cursor-pointer"
                      onDoubleClick={() => router.push(`/billing/invoices/${invoice.id}`)}
                    >
                      <TableCell className="px-4 py-2">
                        <input
                          type="checkbox"
                          checked={bulkSelection.isSelected(invoice.id)}
                          onChange={() => bulkSelection.toggleSelection(invoice.id)}
                          className="h-3.5 w-3.5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                      </TableCell>
                      <TableCell className="px-4 py-2 font-mono text-xs font-medium text-gray-700">
                        {invoice.invoice_number || "-"}
                      </TableCell>
                      <TableCell className="px-4 py-2">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-gray-900">{invoice.customer_name || "N/A"}</span>
                          {/* Potentially add small metadata here if available like email */}
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-2">
                        <div className="flex flex-col text-xs text-gray-500">
                          <span>inv: {invoice.invoice_date ? format(new Date(invoice.invoice_date), "MMM dd, yyyy") : "-"}</span>
                          <span className={invoice.status === 'overdue' ? 'text-red-500 font-medium' : ''}>
                            due: {invoice.due_date ? format(new Date(invoice.due_date), "MMM dd, yyyy") : "-"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-2 text-right font-medium text-sm text-gray-700">
                        ${parseFloat(invoice.total || "0").toFixed(2)}
                      </TableCell>
                      <TableCell className="px-4 py-2 text-right font-semibold text-sm">
                        <span className={parseFloat(invoice.balance_due || "0") > 0 ? "text-red-600" : "text-green-600"}>
                          ${parseFloat(invoice.balance_due || "0").toFixed(2)}
                        </span>
                      </TableCell>
                      <TableCell className="px-4 py-2">
                        <Badge variant={getStatusVariant(invoice.status) as any} className="text-[10px] px-2 py-0.5 font-medium border shadow-none bg-transparent">
                          {invoice.status?.replace("_", " ") || invoice.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-4 py-2 text-center">
                        {invoice.ledger_invoice ? (
                          <div className="inline-flex justify-center" title="Synced to Ledger">
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                          </div>
                        ) : (
                          <div className="inline-flex justify-center" title="Not Synced">
                            <div className="w-1.5 h-1.5 rounded-full bg-gray-300"></div>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-2 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Link href={`/billing/invoices/${invoice.id}`}>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-500 hover:text-blue-600">
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                          </Link>
                          {invoice.status === 'draft' && (
                            <Link href={`/billing/invoices/${invoice.id}/edit`}>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-500 hover:text-green-600">
                                <Edit className="w-3.5 h-3.5" />
                              </Button>
                            </Link>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              const button = e.currentTarget;
                              const rect = button.getBoundingClientRect();
                              setMenuPosition({
                                top: rect.bottom + 4,
                                left: rect.right - 192,
                              });
                              setOpenMenuId(openMenuId === invoice.id ? null : invoice.id);
                            }}
                            className="h-7 w-7 p-0 text-gray-500 hover:bg-gray-100"
                          >
                            <MoreVertical className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12">
              <Receipt className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-sm">No invoices found matching your criteria.</p>
              <Link href="/billing/invoices/new">
                <Button variant="outline" size="sm" className="mt-4">
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Create First Invoice
                </Button>
              </Link>
            </div>
          )}

          {/* Pagination Compact */}
          {data && data.count > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50/30">
              <div className="text-xs text-muted-foreground">
                Page {page} of {Math.ceil(data.count / 10)}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={!data.previous}
                  className="h-7 text-xs"
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!data.next}
                  className="h-7 text-xs"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Floating dropdown menu - rendered outside table */}
      {openMenuId && menuPosition && data?.results && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => {
              setOpenMenuId(null);
              setMenuPosition(null);
            }}
          />
          <div
            className="fixed z-50 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700"
            style={{
              top: `${menuPosition.top}px`,
              left: `${menuPosition.left}px`,
            }}
          >
            {(() => {
              const invoice = data.results.find((i: any) => i.id === openMenuId);
              if (!invoice) return null;

              return (
                <div className="py-1">
                  <Link
                    href={`/billing/invoices/${invoice.id}`}
                    onClick={() => {
                      setOpenMenuId(null);
                      setMenuPosition(null);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                  >
                    <Eye className="w-4 h-4" />
                    View
                  </Link>
                  {invoice.status === 'draft' && (
                    <Link
                      href={`/billing/invoices/${invoice.id}/edit`}
                      onClick={() => {
                        setOpenMenuId(null);
                        setMenuPosition(null);
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                    >
                      <Edit className="w-4 h-4" />
                      Edit
                    </Link>
                  )}
                  {(invoice.status === 'draft' || invoice.status === 'sent') && (
                    <button
                      onClick={async () => {
                        setOpenMenuId(null);
                        setMenuPosition(null);
                        try {
                          await billingApi.invoices.send(invoice.id);
                          queryClient.invalidateQueries({ queryKey: ["invoices"] });
                          toast({ title: "Success", description: "Invoice sent successfully" });
                        } catch (error: any) {
                          toast({
                            title: "Error",
                            description: error.response?.data?.error || error.response?.data?.detail || "Failed to send invoice",
                            variant: "destructive",
                          });
                        }
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                    >
                      <Mail className="w-4 h-4" />
                      Send
                    </button>
                  )}
                  <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                  <button
                    onClick={() => {
                      setOpenMenuId(null);
                      setMenuPosition(null);
                      handleDelete(invoice);
                    }}
                    disabled={deleteMutation.isPending}
                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                </div>
              );
            })()}
          </div>
        </>
      )}

      {/* Bulk Status Update Dialog */}
      <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Status for {bulkSelection.selectedCount} Invoice(s)</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              New Status
            </label>
            <Select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
            >
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="viewed">Viewed</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
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

