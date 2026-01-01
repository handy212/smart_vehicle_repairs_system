"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { billingApi } from "@/lib/api/billing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Plus, Search, FileText, AlertCircle, CheckCircle, XCircle, Clock, Trash2, Download, Mail, Edit, Copy, MoreVertical, ChevronDown, Eye, Filter, X, Printer, DollarSign } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { useToast } from "@/lib/hooks/useToast";
import { exportToCSV } from "@/lib/utils/export";
import { useBulkSelection } from "@/lib/hooks/useBulkSelection";
import { BulkActionToolbar } from "@/components/ui/bulk-action-toolbar";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { AdvancedFilters, FilterOption, QuickFilter } from "@/components/ui/advanced-filters";
import { SortableHeader, SortConfig } from "@/components/ui/sortable-header";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { CreditCard, Ban } from "lucide-react"; // Added missing icons

import { useCurrency } from "@/lib/hooks/useCurrency";
export default function EstimatesPage() {
  const { formatCurrency } = useCurrency();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [advancedFilters, setAdvancedFilters] = useState<Record<string, any>>({});
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const menuRefs = useRef<Record<number, HTMLButtonElement>>({});
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const router = useRouter();

  // Advanced filter options
  const filterOptions: FilterOption[] = [
    {
      key: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "draft", label: "Draft" },
        { value: "sent", label: "Sent" },
        { value: "viewed", label: "Viewed" },
        { value: "approved", label: "Approved" },
        { value: "rejected", label: "Rejected" },
        { value: "converted", label: "Converted" },
        { value: "expired", label: "Expired" },
      ],
    },
    {
      key: "estimate_date",
      label: "Estimate Date",
      type: "daterange",
    },
  ];

  const quickFilters: QuickFilter[] = [
    {
      label: "This Month",
      value: "this_month",
      filters: {
        estimate_date_from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0],
        estimate_date_to: new Date().toISOString().split("T")[0],
      },
    },
    {
      label: "Pending Approval",
      value: "pending",
      filters: {
        status: "sent",
      },
    },
    {
      label: "Expired",
      value: "expired",
      filters: {
        status: "expired",
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
    queryKey: ["estimates", page, search, advancedFilters, sortConfig],
    queryFn: () => {
      const ordering = sortConfig
        ? `${sortConfig.direction === "desc" ? "-" : ""}${sortConfig.field}`
        : undefined;
      return billingApi.estimates.list({
        page,
        status: advancedFilters.status || undefined,
        search: search || undefined,
        estimate_date__gte: advancedFilters.estimate_date_from || undefined,
        estimate_date__lte: advancedFilters.estimate_date_to || undefined,
        ordering,
      });
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["estimate-stats"],
    queryFn: () => billingApi.estimates.stats(),
  });

  const estimates = data?.results || [];
  const bulkSelection = useBulkSelection(estimates);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => billingApi.estimates.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["estimates"] });
      toast({ title: "Success", description: "Estimate deleted successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to delete estimate",
        variant: "destructive",
      });
    },
  });

  const handleDelete = (estimate: any) => {
    if (confirm(`Are you sure you want to delete estimate "${estimate.estimate_number}"? This action cannot be undone.`)) {
      deleteMutation.mutate(estimate.id);
    }
  };

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await Promise.all(ids.map((id) => billingApi.estimates.delete(id)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["estimates"] });
      bulkSelection.clearSelection();
      toast({ title: "Success", description: `${bulkSelection.selectedCount} estimates deleted successfully` });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to delete estimates",
        variant: "destructive",
      });
    },
  });

  const bulkSendMutation = useMutation({
    mutationFn: (ids: number[]) => billingApi.estimates.bulkSend(ids),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["estimates"] });
      bulkSelection.clearSelection();
      if (data.errors && data.errors.length > 0) {
        toast({
          title: "Partial Success",
          description: `Sent ${data.sent_count} estimate(s). Some failed: ${data.errors.join(", ")}`,
          variant: "default",
        });
      } else {
        toast({ title: "Success", description: `Sent ${data.sent_count} estimate(s) successfully` });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to send estimates",
        variant: "destructive",
      });
    },
  });

  const bulkStatusUpdateMutation = useMutation({
    mutationFn: ({ ids, status }: { ids: number[]; status: string }) => billingApi.estimates.bulkUpdateStatus(ids, status),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["estimates"] });
      bulkSelection.clearSelection();
      if (data.errors && data.errors.length > 0) {
        toast({
          title: "Partial Success",
          description: `Updated ${data.updated_count} estimate(s). Some failed: ${data.errors.join(", ")}`,
          variant: "default",
        });
      } else {
        toast({ title: "Success", description: `Updated ${data.updated_count} estimate(s) successfully` });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to update estimates",
        variant: "destructive",
      });
    },
  });

  const handleBulkDelete = () => {
    if (confirm(`Are you sure you want to delete ${bulkSelection.selectedCount} estimate(s)? This action cannot be undone.`)) {
      bulkDeleteMutation.mutate(bulkSelection.selectedIds);
    }
  };

  const handleBulkSend = () => {
    if (confirm(`Send ${bulkSelection.selectedCount} estimate(s) to customers?`)) {
      bulkSendMutation.mutate(bulkSelection.selectedIds);
    }
  };

  const handleBulkStatusUpdate = () => {
    const newStatus = prompt("Enter new status (draft, sent, viewed, approved, declined, converted, expired):");
    if (newStatus && ['draft', 'sent', 'viewed', 'approved', 'declined', 'converted', 'expired'].includes(newStatus.toLowerCase())) {
      if (confirm(`Update ${bulkSelection.selectedCount} estimate(s) to "${newStatus}"?`)) {
        bulkStatusUpdateMutation.mutate({ ids: bulkSelection.selectedIds, status: newStatus.toLowerCase() });
      }
    } else if (newStatus) {
      toast({
        title: "Invalid Status",
        description: "Please enter a valid status",
        variant: "destructive",
      });
    }
  };

  const handleExport = () => {
    if (!data?.results || data.results.length === 0) {
      toast({
        title: "No Data",
        description: "No estimates to export",
        variant: "destructive",
      });
      return;
    }

    exportToCSV(
      data.results,
      "estimates",
      [
        { key: "estimate_number", label: "Estimate Number" },
        { key: "customer_name", label: "Customer" },
        { key: "vehicle_display", label: "Vehicle" },
        { key: "estimate_date", label: "Date" },
        { key: "valid_until", label: "Valid Until" },
        { key: "total", label: "Total" },
        { key: "status", label: "Status" },
      ]
    );

    toast({ title: "Success", description: "Estimates exported successfully" });
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
        Error loading estimates. Please try again.
      </div>
    );
  }

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "approved":
        return "success";
      case "sent":
      case "viewed":
        return "info";
      case "draft":
        return "default";
      case "declined":
        return "danger";
      case "converted":
        return "secondary";
      default:
        return "default";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "approved":
        return <CheckCircle className="w-4 h-4" />;
      case "declined":
        return <XCircle className="w-4 h-4" />;
      case "sent":
      case "viewed":
        return <Clock className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  // Calculate summary stats
  const totalEstimates = data?.count || 0;
  const totalAmount = data?.results?.reduce((sum, est) => sum + parseFloat(est.total || "0"), 0) || 0;
  const pendingCount = data?.results?.filter((est) => est.status === "sent" || est.status === "viewed").length || 0;
  const expiredCount = data?.results?.filter((est) => est.is_expired).length || 0;

  return (
    <div className="space-y-4 min-h-screen">
      <div className="flex items-center justify-between pt-2">
        <div>
          <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-1">
            <Link href="/dashboard" className="hover:text-blue-600 transition-colors">Dashboard</Link>
            <span>/</span>
            <Link href="/billing" className="hover:text-blue-600 transition-colors">Billing</Link>
            <span>/</span>
            <span className="text-gray-900 dark:text-gray-100 font-medium">Estimates</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">Estimates</h1>
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
                  </div>
                </div>
              </>
            )}
          </div>
          <PermissionGuard permission="create_estimates">
            <Link href="/billing/estimates/new">
              <Button size="sm" className="h-9">
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                New Estimate
              </Button>
            </Link>
          </PermissionGuard>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card
          className={`shadow-sm border transition-all cursor-pointer hover:shadow-md ${advancedFilters.status === 'draft' ? 'ring-2 ring-gray-500 bg-gray-50 dark:bg-gray-800' : 'bg-white dark:bg-gray-800'}`}
          onClick={() => {
            const newStatus = advancedFilters.status === 'draft' ? null : 'draft';
            setAdvancedFilters({ ...advancedFilters, status: newStatus });
            setPage(1);
          }}
        >
          <CardContent className="p-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Draft</span>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-gray-600">{stats?.counts.draft || 0}</span>
              <FileText className="w-4 h-4 text-gray-400" />
            </div>
          </CardContent>
        </Card>
        <Card
          className={`shadow-sm border transition-all cursor-pointer hover:shadow-md ${advancedFilters.status === 'sent' ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-gray-800' : 'bg-white dark:bg-gray-800'}`}
          onClick={() => {
            const newStatus = advancedFilters.status === 'sent' ? null : 'sent';
            setAdvancedFilters({ ...advancedFilters, status: newStatus });
            setPage(1);
          }}
        >
          <CardContent className="p-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Sent (Pending)</span>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-blue-600">{stats?.counts.sent || 0}</span>
              <Mail className="w-4 h-4 text-blue-500/50" />
            </div>
          </CardContent>
        </Card>
        <Card
          className={`shadow-sm border transition-all cursor-pointer hover:shadow-md ${advancedFilters.status === 'approved' ? 'ring-2 ring-green-500 bg-green-50 dark:bg-gray-800' : 'bg-white dark:bg-gray-800'}`}
          onClick={() => {
            const newStatus = advancedFilters.status === 'approved' ? null : 'approved';
            setAdvancedFilters({ ...advancedFilters, status: newStatus });
            setPage(1);
          }}
        >
          <CardContent className="p-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Approved</span>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-green-600">{stats?.counts.approved || 0}</span>
              <CheckCircle className="w-4 h-4 text-green-500/50" />
            </div>
          </CardContent>
        </Card>
        <Card
          className={`shadow-sm border transition-all cursor-pointer hover:shadow-md ${advancedFilters.status === 'declined' ? 'ring-2 ring-red-500 bg-red-50 dark:bg-gray-800' : 'bg-white dark:bg-gray-800'}`}
          onClick={() => {
            const newStatus = advancedFilters.status === 'declined' ? null : 'declined';
            setAdvancedFilters({ ...advancedFilters, status: newStatus });
            setPage(1);
          }}
        >
          <CardContent className="p-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Declined</span>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-red-600">{stats?.counts.declined || 0}</span>
              <XCircle className="w-4 h-4 text-red-500/50" />
            </div>
          </CardContent>
        </Card>
        <Card
          className={`shadow-sm border transition-all cursor-pointer hover:shadow-md ${advancedFilters.status === 'expired' ? 'ring-2 ring-orange-500 bg-orange-50 dark:bg-gray-800' : 'bg-white dark:bg-gray-800'}`}
          onClick={() => {
            const newStatus = advancedFilters.status === 'expired' ? null : 'expired';
            setAdvancedFilters({ ...advancedFilters, status: newStatus });
            setPage(1);
          }}
        >
          <CardContent className="p-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Expired</span>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-orange-600">{stats?.counts.expired || 0}</span>
              <Clock className="w-4 h-4 text-orange-500/50" />
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
                  placeholder="Search estimates..."
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
                title="Advanced Estimate Filters"
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

              {/* Mini Widget - Financial Summary */}
              {stats && (
                <div className="hidden md:flex items-center space-x-4 ml-auto text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 font-medium">Approved Value:</span>
                    <span className="font-bold text-gray-900 dark:text-gray-100">{formatCurrency(stats.financials.total_approved)}</span>
                  </div>
                  <div className="h-4 w-px bg-gray-300 dark:bg-gray-700"></div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 font-medium">Pipeline Value:</span>
                    <span className="font-bold text-blue-600">{formatCurrency(stats.financials.total_pending)}</span>
                  </div>
                </div>
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
        onBulkSend={handleBulkSend}
        onBulkStatusUpdate={handleBulkStatusUpdate}
        showBulkSend={true}
        showStatusUpdate={true}
      />

      {/* Estimates Table */}
      <Card className="border-t shadow-sm">
        <CardHeader className="py-3 px-4 border-b bg-gray-50/30">
          <CardTitle className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            All Estimates <span className="text-muted-foreground font-normal ml-1">({data?.count || 0})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <TableSkeleton rows={8} columns={9} />
          ) : data?.results && data.results.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/50 hover:bg-gray-50/50 border-b border-gray-200">
                    <TableHead className="w-[32px] px-2">
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
                    <TableHead className="px-2 h-9 text-[10px] uppercase tracking-wider font-semibold text-gray-500">Estimate #</TableHead>
                    <TableHead className="px-2 h-9 text-[10px] uppercase tracking-wider font-semibold text-gray-500">Customer</TableHead>
                    <TableHead className="px-2 h-9 text-[10px] uppercase tracking-wider font-semibold text-gray-500">Vehicle</TableHead>
                    <TableHead className="px-2 h-9 text-[10px] uppercase tracking-wider font-semibold text-gray-500">Dates</TableHead>
                    <TableHead className="px-2 h-9 text-[10px] uppercase tracking-wider font-semibold text-right text-gray-500">Total</TableHead>
                    <TableHead className="px-2 h-9 text-[10px] uppercase tracking-wider font-semibold text-gray-500">Status</TableHead>
                    <TableHead className="px-2 h-9 text-[10px] uppercase tracking-wider font-semibold text-right text-gray-500">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.results.map((estimate) => (
                    <TableRow
                      key={estimate.id}
                      className="group hover:bg-gray-50/80 transition-colors border-b border-gray-100 last:border-0 data-[state=selected]:bg-blue-50/30 cursor-pointer"
                      onDoubleClick={() => router.push(`/billing/estimates/${estimate.id}`)}
                    >
                      <TableCell className="px-2 py-1.5 w-[32px]">
                        <input
                          type="checkbox"
                          checked={bulkSelection.isSelected(estimate.id)}
                          onChange={() => bulkSelection.toggleSelection(estimate.id)}
                          className="h-3.5 w-3.5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                      </TableCell>
                      <TableCell className="px-2 py-1.5 font-mono text-[11px] font-medium text-gray-700">
                        {estimate.estimate_number || "-"}
                      </TableCell>
                      <TableCell className="px-2 py-1.5">
                        <span className="text-sm font-medium text-gray-900 line-clamp-1">{estimate.customer_name || "N/A"}</span>
                      </TableCell>
                      <TableCell className="px-2 py-1.5 text-xs text-gray-600">
                        <span className="line-clamp-1">{estimate.vehicle_display || "-"}</span>
                      </TableCell>
                      <TableCell className="px-2 py-1.5">
                        <div className="flex flex-col text-[10px] text-gray-500">
                          <span>{estimate.estimate_date ? format(new Date(estimate.estimate_date), "MMM dd") : "-"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="px-2 py-1.5 text-right font-medium text-sm text-gray-700">
                        {formatCurrency(parseFloat(estimate.total || "0"))}
                      </TableCell>
                      <TableCell className="px-2 py-1.5">
                        <Badge variant={getStatusVariant(estimate.status) as any} className="text-[10px] px-1.5 py-0 font-medium border shadow-none bg-transparent whitespace-nowrap">
                          <span className="flex items-center gap-1.5">
                            {getStatusIcon(estimate.status)}
                            {estimate.status === 'draft' ? 'Draft' :
                              estimate.status === 'sent' ? 'Sent' :
                                estimate.status === 'approved' ? 'Approved' :
                                  estimate.status === 'declined' ? 'Declined' :
                                    estimate.status === 'expired' ? 'Expired' :
                                      estimate.status}
                          </span>
                        </Badge>
                      </TableCell>
                      <TableCell className="px-2 py-1.5 text-right w-[80px]">
                        <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Link href={`/billing/estimates/${estimate.id}`}>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-gray-400 hover:text-blue-600 hover:bg-blue-50">
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                          </Link>
                          {estimate.status === 'draft' && (
                            <Link href={`/billing/estimates/${estimate.id}/edit`}>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-gray-400 hover:text-green-600 hover:bg-green-50">
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
                              setOpenMenuId(openMenuId === estimate.id ? null : estimate.id);
                            }}
                            className="h-6 w-6 p-0 text-gray-400 hover:text-gray-900 hover:bg-gray-100"
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
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-sm">No estimates found.</p>
              <PermissionGuard permission="create_estimates">
                <Link href="/billing/estimates/new">
                  <Button className="mt-4" variant="outline" size="sm">
                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                    Create First Estimate
                  </Button>
                </Link>
              </PermissionGuard>
            </div>
          )}

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
                  const estimate = data.results.find((e: any) => e.id === openMenuId);
                  if (!estimate) return null;

                  return (
                    <div className="py-1">
                      <Link
                        href={`/billing/estimates/${estimate.id}`}
                        onClick={() => {
                          setOpenMenuId(null);
                          setMenuPosition(null);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                      >
                        <Eye className="w-4 h-4" />
                        View
                      </Link>
                      {estimate.status === 'draft' && (
                        <Link
                          href={`/billing/estimates/${estimate.id}/edit`}
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
                      <button
                        onClick={async () => {
                          setOpenMenuId(null);
                          setMenuPosition(null);
                          try {
                            const duplicated = await billingApi.estimates.duplicate(estimate.id);
                            queryClient.invalidateQueries({ queryKey: ["estimates"] });
                            toast({
                              title: "Success",
                              description: "Estimate duplicated successfully",
                            });
                            window.location.href = `/billing/estimates/${duplicated.id}/edit`;
                          } catch (error: any) {
                            toast({
                              title: "Error",
                              description: error.response?.data?.error || error.response?.data?.detail || "Failed to duplicate estimate",
                              variant: "destructive",
                            });
                          }
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                      >
                        <Copy className="w-4 h-4" />
                        Duplicate
                      </button>
                      {(estimate.status === 'draft' || estimate.status === 'sent') && (
                        <button
                          onClick={async () => {
                            setOpenMenuId(null);
                            setMenuPosition(null);
                            try {
                              await billingApi.estimates.send(estimate.id);
                              queryClient.invalidateQueries({ queryKey: ["estimates"] });
                              toast({ title: "Success", description: "Estimate sent successfully" });
                            } catch (error: any) {
                              toast({
                                title: "Error",
                                description: error.response?.data?.error || "Failed to send estimate",
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
                          handleDelete(estimate);
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

          {/* Pagination */}
          {data && data.count > 0 && (
            <div className="mt-4 flex items-center justify-between">
              <div className="text-sm text-gray-700">
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
    </div>
  );
}

