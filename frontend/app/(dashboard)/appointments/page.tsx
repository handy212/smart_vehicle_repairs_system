"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { appointmentsApi } from "@/lib/api/appointments";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { PremiumIcons } from "@/components/ui/icons";
import { X } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          {/* Premium Header */}
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
              <PremiumIcons.Calendar className="w-8 h-8 text-primary" />
              Appointments
            </h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your service schedule and bookings
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-9 bg-muted text-foreground border-border backdrop-blur-sm bg-card/50"
              >
                Actions
                <PremiumIcons.ChevronDown className="w-3.5 h-3.5 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <PermissionGuard permission="export_appointments">
                <DropdownMenuItem
                  onClick={() => handleExport()}
                  disabled={!data?.results || data.results.length === 0}
                >
                  <PremiumIcons.Download className="w-4 h-4 mr-2" />
                  Export CSV
                </DropdownMenuItem>
              </PermissionGuard>
            </DropdownMenuContent>
          </DropdownMenu>

          <Link href="/appointments/calendar">
            <Button variant="outline" size="sm" className="h-9 bg-muted text-foreground border-border backdrop-blur-sm bg-card/50">
              <PremiumIcons.CalendarDays className="w-3.5 h-3.5 mr-2" />
              Calendar View
            </Button>
          </Link>
          <PermissionGuard permission="create_appointments">
            <Link href="/appointments/new">
              <Button size="sm" className="h-9 bg-primary hover:bg-primary/90 text-white shadow-sm border-none">
                <PremiumIcons.Plus className="w-3.5 h-3.5 mr-2" />
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
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <PremiumIcons.Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-muted-foreground w-3.5 h-3.5" />
            <Input
              type="text"
              placeholder="Search appointments..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-8 h-9 text-sm w-80 transition-all focus:w-full focus:max-w-md bg-card border-border"
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
              <PremiumIcons.X className="w-4 h-4 mr-1" />
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
                    <PremiumIcons.X className="w-3 h-3" />
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
      <Card className="border-none shadow-sm overflow-hidden bg-card/60 backdrop-blur-md ring-1 ring-gray-900/5">
        <CardHeader className="py-4 px-6 border-b border-border/50 bg-card/40 bg-muted/40 backdrop-blur-sm">
          <CardTitle className="text-base font-semibold text-foreground tracking-tight">
            All Appointments ({data?.count || 0})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6">
              <TableSkeleton rows={8} columns={9} />
            </div>
          ) : data?.results && data.results.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="w-[40px] pl-4">
                      <input
                        type="checkbox"
                        checked={bulkSelection.isAllSelected}
                        ref={(input) => {
                          if (input) input.indeterminate = bulkSelection.isIndeterminate;
                        }}
                        onChange={bulkSelection.toggleSelectAll}
                        className="h-3.5 w-3.5 text-primary focus:ring-primary border-border rounded"
                      />
                    </TableHead>
                    <SortableHeader
                      field="appointment_number"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                      className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground"
                    >
                      Appt #
                    </SortableHeader>
                    <SortableHeader
                      field="customer__user__last_name"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                      className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground"
                    >
                      Customer
                    </SortableHeader>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Vehicle</TableHead>
                    <SortableHeader
                      field="appointment_date"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                      className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground"
                    >
                      Date & Time
                    </SortableHeader>
                    <SortableHeader
                      field="service_type"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                      className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground"
                    >
                      Service Type
                    </SortableHeader>
                    <SortableHeader
                      field="priority"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                      className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground"
                    >
                      Priority
                    </SortableHeader>
                    <SortableHeader
                      field="status"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                      className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground"
                    >
                      Status
                    </SortableHeader>
                    <TableHead className="text-right text-[10px] uppercase tracking-wider font-semibold text-muted-foreground pr-4">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.results.map((appointment) => (
                    <TableRow
                      key={appointment.id}
                      className="hover:bg-muted/80 transition-colors cursor-pointer group"
                      onDoubleClick={() => router.push(`/appointments/${appointment.id}`)}
                    >
                      <TableCell className="pl-4 py-2.5">
                        <input
                          type="checkbox"
                          checked={bulkSelection.isSelected(appointment.id)}
                          onChange={() => bulkSelection.toggleSelection(appointment.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-3.5 w-3.5 text-primary focus:ring-primary border-border rounded"
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs font-medium py-2.5">
                        {appointment.appointment_number || "-"}
                      </TableCell>
                      <TableCell className="py-2.5 text-sm">{appointment.customer_name || "N/A"}</TableCell>
                      <TableCell className="py-2.5 text-sm">{appointment.vehicle_info || "N/A"}</TableCell>
                      <TableCell className="py-2.5">
                        <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                          <PremiumIcons.Calendar className="w-3.5 h-3.5" />
                          <span>
                            {appointment.appointment_date
                              ? format(new Date(appointment.appointment_date), "MMM dd, yyyy")
                              : "-"}
                          </span>
                          {appointment.appointment_time && (
                            <>
                              <PremiumIcons.Clock className="w-3.5 h-3.5 ml-2" />
                              <span>{appointment.appointment_time}</span>
                            </>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="capitalize py-2.5">
                        <Badge variant="outline" className="text-[10px] px-2 py-0.5 font-medium border shadow-none bg-transparent">
                          {appointment.service_type?.replace("_", " ") || appointment.service_type || "-"}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <Badge variant={getPriorityVariant(appointment.priority) as any} className="text-[10px] px-2 py-0.5 font-medium border shadow-none bg-transparent">
                          {appointment.priority || "-"}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <Badge variant={getStatusVariant(appointment.status) as any} className="text-[10px] px-2 py-0.5 font-medium border shadow-none bg-transparent">
                          {appointment.status?.replace("_", " ") || appointment.status || "-"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right py-2.5 pr-4">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 dark:hover:bg-gray-700 data-[state=open]:bg-gray-100 dark:data-[state=open]:bg-gray-800"
                            >
                              <span className="sr-only">Open menu</span>
                              <PremiumIcons.MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => router.push(`/appointments/${appointment.id}`)}>
                              <PremiumIcons.Eye className="mr-2 h-4 w-4" />
                              View Details
                            </DropdownMenuItem>
                            <PermissionGuard permission="edit_appointments">
                              <DropdownMenuItem onClick={() => router.push(`/appointments/${appointment.id}/edit`)}>
                                <PremiumIcons.Edit className="mr-2 h-4 w-4" />
                                Edit Appointment
                              </DropdownMenuItem>
                            </PermissionGuard>
                            <DropdownMenuSeparator />
                            <PermissionGuard permission="edit_appointments">
                              <DropdownMenuItem onClick={() => { }}>
                                <PremiumIcons.Mail className="mr-2 h-4 w-4" />
                                Send Reminder
                              </DropdownMenuItem>
                            </PermissionGuard>
                            <DropdownMenuSeparator />
                            <PermissionGuard permission="delete_appointments">
                              <DropdownMenuItem
                                onClick={() => {
                                  if (window.confirm(`Are you sure you want to delete appointment "${appointment.appointment_number}"? This action cannot be undone.`)) {
                                    handleDelete(appointment);
                                  }
                                }}
                                className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400 focus:bg-red-50 dark:focus:bg-red-900/20"
                                disabled={deleteMutation.isPending}
                              >
                                <PremiumIcons.Trash2 className="mr-2 h-4 w-4" />
                                Delete Appointment
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
              <PremiumIcons.Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No appointments found.</p>
              <Link href="/appointments/new">
                <Button className="mt-4" variant="secondary">
                  <PremiumIcons.Plus className="w-4 h-4 mr-2" />
                  Schedule First Appointment
                </Button>
              </Link>
            </div>
          )}

          {/* Pagination */}
          {data && data.count > 0 && (
            <div className="mt-4 flex items-center justify-between">
              <div className="text-sm text-foreground">
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

      {/* Bulk Status Update Dialog */}
      <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Status for {bulkSelection.selectedCount} Appointment(s)</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <label className="block text-sm font-medium text-foreground mb-2">
              New Status
            </label>
            <Select
              value={newStatus}
              onValueChange={(value) => setNewStatus(value)}
            >
              <option value="confirmed">Confirmed</option>
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
  );
}

