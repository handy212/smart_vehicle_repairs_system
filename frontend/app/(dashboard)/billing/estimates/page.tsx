"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { billingApi } from "@/lib/api/billing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Plus, Search, FileText, AlertCircle, CheckCircle, XCircle, Clock, Trash2, Download, Mail, Edit, Copy, MoreVertical, ChevronDown, Eye, Filter, X, Printer } from "lucide-react";
import Link from "next/link";
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

export default function EstimatesPage() {
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
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Estimates</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage estimates and quotes
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <div className="relative">
            <Button
             variant="secondary"
              onClick={() => setShowActionsMenu(!showActionsMenu)}
              className="dark:border-gray-700 dark:text-gray-200"
            >
              Actions
              <ChevronDown className="w-4 h-4 ml-2" />
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
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                New Estimate
              </Button>
            </Link>
          </PermissionGuard>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Estimates</p>
                <p className="text-2xl font-bold text-gray-900">{totalEstimates}</p>
              </div>
              <FileText className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Value</p>
                <p className="text-2xl font-bold text-gray-900">${totalAmount.toFixed(2)}</p>
              </div>
              <FileText className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Pending</p>
                <p className="text-2xl font-bold text-yellow-600">{pendingCount}</p>
              </div>
              <Clock className="w-8 h-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Expired</p>
                <p className="text-2xl font-bold text-red-600">{expiredCount}</p>
              </div>
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Compact Filter Bar */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              type="text"
              placeholder="Search estimates..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-9 h-9"
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
        onBulkSend={handleBulkSend}
        onBulkStatusUpdate={handleBulkStatusUpdate}
        showBulkSend={true}
        showStatusUpdate={true}
      />

      {/* Estimates Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            All Estimates ({data?.count || 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <TableSkeleton rows={8} columns={9} />
          ) : data?.results && data.results.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
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
                    <SortableHeader
                      field="estimate_number"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                    >
                      Estimate #
                    </SortableHeader>
                    <SortableHeader
                      field="customer__user__last_name"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                    >
                      Customer
                    </SortableHeader>
                    <TableHead>Vehicle</TableHead>
                    <SortableHeader
                      field="estimate_date"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                    >
                      Date
                    </SortableHeader>
                    <SortableHeader
                      field="valid_until"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                    >
                      Valid Until
                    </SortableHeader>
                    <SortableHeader
                      field="total"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                    >
                      Total
                    </SortableHeader>
                    <SortableHeader
                      field="status"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                    >
                      Status
                    </SortableHeader>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.results.map((estimate) => (
                    <TableRow key={estimate.id} className="transition-colors duration-150 hover:bg-gray-50" data-estimate-id={estimate.id}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={bulkSelection.isSelected(estimate.id)}
                          onChange={() => bulkSelection.toggleSelection(estimate.id)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {estimate.estimate_number || "-"}
                      </TableCell>
                      <TableCell>{estimate.customer_name || "N/A"}</TableCell>
                      <TableCell>{estimate.vehicle_display || "-"}</TableCell>
                      <TableCell>
                        {estimate.estimate_date
                          ? format(new Date(estimate.estimate_date), "MMM dd, yyyy")
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          {estimate.valid_until
                            ? format(new Date(estimate.valid_until), "MMM dd, yyyy")
                            : "-"}
                          {estimate.is_expired && (
                            <Badge variant="danger" className="text-xs">
                              Expired
                            </Badge>
                          )}
                          {estimate.days_until_expiration !== undefined && estimate.days_until_expiration <= 7 && !estimate.is_expired && (
                            <Badge variant="warning" className="text-xs">
                              {estimate.days_until_expiration} days
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        ${parseFloat(estimate.total || "0").toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(estimate.status) as any} className="flex items-center space-x-1 w-fit">
                          {getStatusIcon(estimate.status)}
                          <span>{estimate.status?.replace("_", " ") || estimate.status}</span>
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            const button = e.currentTarget;
                            const rect = button.getBoundingClientRect();
                            setMenuPosition({
                              top: rect.bottom + 4,
                              left: rect.right - 192, // 192px = w-48 (48 * 4)
                            });
                            setOpenMenuId(openMenuId === estimate.id ? null : estimate.id);
                          }}
                          className="h-8 w-8 p-0"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">No estimates found.</p>
              <PermissionGuard permission="create_estimates">
                <Link href="/billing/estimates/new">
                  <Button className="mt-4"variant="secondary">
                    <Plus className="w-4 h-4 mr-2" />
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

