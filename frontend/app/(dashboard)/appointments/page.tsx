"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { appointmentsApi } from "@/lib/api/appointments";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Plus, Search, Calendar, Clock, Trash2, Download, CalendarDays, X, ChevronDown, MoreVertical, Eye, Edit, Mail } from "lucide-react";
import Link from "next/link";
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

export default function AppointmentsPage() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 500); // Debounce search by 500ms
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [newStatus, setNewStatus] = useState<string>("confirmed");
  const [advancedFilters, setAdvancedFilters] = useState<Record<string, any>>({});
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();

  // Advanced filter options
  const filterOptions: FilterOption[] = [
    {
      key: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "pending", label: "Pending" },
        { value: "confirmed", label: "Confirmed" },
        { value: "in_progress", label: "In Progress" },
        { value: "completed", label: "Completed" },
        { value: "cancelled", label: "Cancelled" },
      ],
    },
    {
      key: "appointment_date",
      label: "Appointment Date",
      type: "daterange",
    },
    {
      key: "service_type",
      label: "Service Type",
      type: "select",
      options: [
        { value: "maintenance", label: "Maintenance" },
        { value: "repair", label: "Repair" },
        { value: "inspection", label: "Inspection" },
        { value: "diagnostic", label: "Diagnostic" },
      ],
    },
  ];

  const quickFilters: QuickFilter[] = [
    {
      label: "Today",
      value: "today",
      filters: {
        appointment_date_from: new Date().toISOString().split("T")[0],
        appointment_date_to: new Date().toISOString().split("T")[0],
      },
    },
    {
      label: "This Week",
      value: "this_week",
      filters: {
        appointment_date_from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        appointment_date_to: new Date().toISOString().split("T")[0],
      },
    },
    {
      label: "This Month",
      value: "this_month",
      filters: {
        appointment_date_from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0],
        appointment_date_to: new Date().toISOString().split("T")[0],
      },
    },
    {
      label: "Pending",
      value: "pending",
      filters: {
        status: "pending",
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
    queryKey: ["appointments", page, debouncedSearch, advancedFilters, sortConfig],
    queryFn: () => {
      const ordering = sortConfig
        ? `${sortConfig.direction === "desc" ? "-" : ""}${sortConfig.field}`
        : undefined;
      return appointmentsApi.list({
        page,
        search: debouncedSearch || undefined,
        status: advancedFilters.status || undefined,
        appointment_date__gte: advancedFilters.appointment_date_from || undefined,
        appointment_date__lte: advancedFilters.appointment_date_to || undefined,
        service_type: advancedFilters.service_type || undefined,
        ordering,
      });
    },
  });

  const appointments = data?.results || [];
  const bulkSelection = useBulkSelection(appointments);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => appointmentsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast({ title: "Success", description: "Appointment deleted successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to delete appointment",
        variant: "destructive",
      });
    },
  });

  const handleDelete = (appointment: any) => {
    if (confirm(`Are you sure you want to delete appointment "${appointment.appointment_number}"? This action cannot be undone.`)) {
      deleteMutation.mutate(appointment.id);
    }
  };

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await Promise.all(ids.map((id) => appointmentsApi.delete(id)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      bulkSelection.clearSelection();
      toast({ title: "Success", description: `${bulkSelection.selectedCount} appointments deleted successfully` });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to delete appointments",
        variant: "destructive",
      });
    },
  });

  const bulkStatusUpdateMutation = useMutation({
    mutationFn: async ({ ids, status }: { ids: number[]; status: string }) => {
      // Use the confirm endpoint for each appointment
      await Promise.all(
        ids.map((id) => {
          if (status === "confirmed") {
            return appointmentsApi.confirm(id);
          } else if (status === "cancelled") {
            return appointmentsApi.cancel(id, "Bulk cancellation");
          }
          return Promise.resolve();
        })
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      bulkSelection.clearSelection();
      setShowStatusDialog(false);
      toast({ title: "Success", description: `Status updated for ${bulkSelection.selectedCount} appointments` });
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
    if (confirm(`Are you sure you want to delete ${bulkSelection.selectedCount} appointment(s)? This action cannot be undone.`)) {
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
        description: "No appointments to export",
        variant: "destructive",
      });
      return;
    }

    exportToCSV(
      data.results,
      "appointments",
      [
        { key: "appointment_number", label: "Appointment Number" },
        { key: "customer_name", label: "Customer" },
        { key: "vehicle_info", label: "Vehicle" },
        { key: "appointment_date", label: "Date" },
        { key: "appointment_time", label: "Time" },
        { key: "service_type", label: "Service Type" },
        { key: "status", label: "Status" },
        { key: "priority", label: "Priority" },
      ]
    );

    toast({ title: "Success", description: "Appointments exported successfully" });
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
        Error loading appointments. Please try again.
      </div>
    );
  }

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "confirmed":
        return "success";
      case "pending":
        return "warning";
      case "completed":
        return "info";
      case "cancelled":
        return "danger";
      default:
        return "default";
    }
  };

  const getPriorityVariant = (priority: string) => {
    switch (priority) {
      case "urgent":
        return "danger";
      case "high":
        return "warning";
      case "normal":
        return "default";
      case "low":
        return "secondary";
      default:
        return "default";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Appointments</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage appointments and scheduling
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <div className="relative">
            <Button
              variant="outline"
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
          <Link href="/appointments/calendar">
            <Button variant="outline">
              <CalendarDays className="w-4 h-4 mr-2" />
              Calendar View
            </Button>
          </Link>
          <PermissionGuard permission="create_appointments">
            <Link href="/appointments/new">
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                New Appointment
              </Button>
            </Link>
          </PermissionGuard>
        </div>
      </div>

      {/* Compact Filter Bar */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              type="text"
              placeholder="Search appointments..."
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
            title="Advanced Appointment Filters"
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
        onBulkStatusUpdate={handleBulkStatusUpdate}
        showStatusUpdate={true}
      />

      {/* Appointments Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            All Appointments ({data?.count || 0})
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
                      field="appointment_number"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                    >
                      Appointment #
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
                      field="appointment_date"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                    >
                      Date & Time
                    </SortableHeader>
                    <SortableHeader
                      field="service_type"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                    >
                      Service Type
                    </SortableHeader>
                    <SortableHeader
                      field="priority"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                    >
                      Priority
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
                  {data.results.map((appointment) => (
                    <TableRow key={appointment.id} className="transition-colors duration-150 hover:bg-gray-50">
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={bulkSelection.isSelected(appointment.id)}
                          onChange={() => bulkSelection.toggleSelection(appointment.id)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {appointment.appointment_number || "-"}
                      </TableCell>
                      <TableCell>{appointment.customer_name || "N/A"}</TableCell>
                      <TableCell>{appointment.vehicle_info || "N/A"}</TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          <span>
                            {appointment.appointment_date
                              ? format(new Date(appointment.appointment_date), "MMM dd, yyyy")
                              : "-"}
                          </span>
                          {appointment.appointment_time && (
                            <>
                              <Clock className="w-4 h-4 text-gray-400 ml-2" />
                              <span>{appointment.appointment_time}</span>
                            </>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="capitalize">
                        {appointment.service_type?.replace("_", " ") || appointment.service_type || "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getPriorityVariant(appointment.priority) as any}>
                          {appointment.priority || "-"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(appointment.status) as any}>
                          {appointment.status?.replace("_", " ") || appointment.status || "-"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="relative flex justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setActionMenuOpen(actionMenuOpen === appointment.id ? null : appointment.id)}
                            className="h-8 w-8 p-0 dark:hover:bg-gray-700"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                          {actionMenuOpen === appointment.id && (
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                onClick={() => setActionMenuOpen(null)}
                              />
                              <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-20">
                                <div className="py-1">
                                  <Link
                                    href={`/appointments/${appointment.id}`}
                                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                    onClick={() => setActionMenuOpen(null)}
                                  >
                                    <Eye className="w-4 h-4" />
                                    View Details
                                  </Link>
                                  <Link
                                    href={`/appointments/${appointment.id}/edit`}
                                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                    onClick={() => setActionMenuOpen(null)}
                                  >
                                    <Edit className="w-4 h-4" />
                                    Edit Appointment
                                  </Link>
                                  <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                                  <button
                                    onClick={() => {
                                      // TODO: Implement send reminder
                                      setActionMenuOpen(null);
                                    }}
                                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                  >
                                    <Mail className="w-4 h-4" />
                                    Send Reminder
                                  </button>
                                  <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                                  <PermissionGuard permission="delete_appointments">
                                    <button
                                      onClick={() => {
                                        if (window.confirm(`Are you sure you want to delete appointment "${appointment.appointment_number}"? This action cannot be undone.`)) {
                                          handleDelete(appointment);
                                        }
                                        setActionMenuOpen(null);
                                      }}
                                      disabled={deleteMutation.isPending}
                                      className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                      Delete Appointment
                                    </button>
                                  </PermissionGuard>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12">
              <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">No appointments found.</p>
              <Link href="/appointments/new">
                <Button className="mt-4" variant="outline">
                  <Plus className="w-4 h-4 mr-2" />
                  Schedule First Appointment
                </Button>
              </Link>
            </div>
          )}

          {/* Pagination */}
          {data && data.count > 0 && (
            <div className="mt-4 flex items-center justify-between">
              <div className="text-sm text-gray-700">
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

      {/* Bulk Status Update Dialog */}
      <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Status for {bulkSelection.selectedCount} Appointment(s)</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              New Status
            </label>
            <Select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
            >
              <option value="confirmed">Confirmed</option>
              <option value="cancelled">Cancelled</option>
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

