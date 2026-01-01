"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { vehiclesApi } from "@/lib/api/vehicles";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Car, Trash2, Download, Upload, X, ChevronDown, MoreVertical, Eye, Edit, History, Wrench, Calendar } from "lucide-react";
import { ImportDialog } from "@/components/ui/import-dialog";
import { downloadVehicleTemplate } from "@/lib/utils/import-templates";
import { exportVehiclesForImport } from "@/lib/utils/export-templates";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/lib/hooks/useToast";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { exportToCSV } from "@/lib/utils/export";
import { useBulkSelection } from "@/lib/hooks/useBulkSelection";
import { BulkActionToolbar } from "@/components/ui/bulk-action-toolbar";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { AdvancedFilters, FilterOption, QuickFilter } from "@/components/ui/advanced-filters";
import { SortableHeader, SortConfig } from "@/components/ui/sortable-header";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function VehiclesPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 500);
  const [page, setPage] = useState(1);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<Record<string, any>>({});
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

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
        { value: "active", label: "Active" },
        { value: "in_service", label: "In Service" },
        { value: "sold", label: "Sold" },
        { value: "totaled", label: "Totaled" },
        { value: "inactive", label: "Inactive" },
      ],
    },
    {
      key: "make",
      label: "Make",
      type: "text",
      placeholder: "e.g., Toyota, Ford",
    },
    {
      key: "model",
      label: "Model",
      type: "text",
      placeholder: "e.g., Camry, F-150",
    },
    {
      key: "year_from",
      label: "Year From",
      type: "number",
      placeholder: "e.g., 2020",
    },
    {
      key: "year_to",
      label: "Year To",
      type: "number",
      placeholder: "e.g., 2024",
    },
    {
      key: "engine_type",
      label: "Engine Type",
      type: "select",
      options: [
        { value: "gasoline", label: "Gasoline" },
        { value: "diesel", label: "Diesel" },
        { value: "electric", label: "Electric" },
        { value: "hybrid", label: "Hybrid" },
        { value: "plug_in_hybrid", label: "Plug-in Hybrid" },
      ],
    },
    {
      key: "transmission_type",
      label: "Transmission Type",
      type: "select",
      options: [
        { value: "automatic", label: "Automatic" },
        { value: "manual", label: "Manual" },
        { value: "cvt", label: "CVT" },
        { value: "dual_clutch", label: "Dual Clutch" },
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
      label: "Last 30 Days",
      value: "last_30_days",
      filters: {
        created_at_from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
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
      label: "Active Vehicles",
      value: "active",
      filters: {
        status: "active",
      },
    },
    {
      label: "In Service",
      value: "in_service",
      filters: {
        status: "in_service",
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

  const { data: stats } = useQuery({
    queryKey: ["vehicle-dashboard-stats"],
    queryFn: () => vehiclesApi.dashboardStats(),
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["vehicles", page, debouncedSearch, advancedFilters, sortConfig],
    queryFn: () => {
      const ordering = sortConfig
        ? `${sortConfig.direction === "desc" ? "-" : ""}${sortConfig.field}`
        : undefined;

      // Build year range filters
      const yearFrom = advancedFilters.year_from ? parseInt(advancedFilters.year_from) : undefined;
      const yearTo = advancedFilters.year_to ? parseInt(advancedFilters.year_to) : undefined;

      return vehiclesApi.list({
        page,
        search: debouncedSearch || undefined,
        status: advancedFilters.status || undefined,
        make: advancedFilters.make || undefined,
        model: advancedFilters.model || undefined,
        year__gte: yearFrom,
        year__lte: yearTo,
        engine_type: advancedFilters.engine_type || undefined,
        transmission_type: advancedFilters.transmission_type || undefined,
        created_at__gte: advancedFilters.created_at_from || undefined,
        created_at__lte: advancedFilters.created_at_to || undefined,
        owner: advancedFilters.owner ? parseInt(advancedFilters.owner) : undefined,
        ordering,
      });
    },
  });

  const vehicles = data?.results || [];
  const bulkSelection = useBulkSelection(vehicles);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => vehiclesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      queryClient.invalidateQueries({ queryKey: ["vehicle-dashboard-stats"] });
      toast({ title: "Success", description: "Vehicle deleted successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to delete vehicle",
        variant: "destructive",
      });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await Promise.all(ids.map((id) => vehiclesApi.delete(id)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      queryClient.invalidateQueries({ queryKey: ["vehicle-dashboard-stats"] });
      bulkSelection.clearSelection();
      toast({ title: "Success", description: `${bulkSelection.selectedCount} vehicles deleted successfully` });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.detail || "Failed to delete vehicles",
        variant: "destructive",
      });
    },
  });

  const handleDelete = (vehicle: any) => {
    if (confirm(`Are you sure you want to delete vehicle "${vehicle.make} ${vehicle.model} ${vehicle.year}" (${vehicle.vin})? This action cannot be undone.`)) {
      deleteMutation.mutate(vehicle.id);
    }
  };

  const handleBulkDelete = () => {
    if (confirm(`Are you sure you want to delete ${bulkSelection.selectedCount} vehicle(s)? This action cannot be undone.`)) {
      bulkDeleteMutation.mutate(bulkSelection.selectedIds);
    }
  };

  const handleExport = () => {
    if (!data?.results || data.results.length === 0) {
      toast({
        title: "No Data",
        description: "No vehicles to export",
        variant: "destructive",
      });
      return;
    }

    exportToCSV(
      data.results,
      "vehicles",
      [
        { key: "vin", label: "VIN" },
        { key: "make", label: "Make" },
        { key: "model", label: "Model" },
        { key: "year", label: "Year" },
        { key: "license_plate", label: "License Plate" },
        { key: "current_mileage", label: "Mileage" },
        { key: "status", label: "Status" },
        { key: "owner_name", label: "Owner" },
      ]
    );

    toast({ title: "Success", description: "Vehicles exported successfully" });
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "active":
        return "success";
      case "in_service":
        return "warning";
      case "sold":
        return "secondary";
      default:
        return "default";
    }
  };

  // Stats Grid Component
  const StatsGrid = () => (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <Card className="shadow-sm border bg-white dark:bg-gray-800">
        <CardContent className="p-3 flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</span>
          <span className="text-lg font-bold text-gray-900 dark:text-gray-100">{stats?.total_vehicles || 0}</span>
        </CardContent>
      </Card>
      <Card className="shadow-sm border bg-white dark:bg-gray-800">
        <CardContent className="p-3 flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Active</span>
          <span className="text-lg font-bold text-blue-600 dark:text-blue-400">{stats?.active_vehicles || 0}</span>
        </CardContent>
      </Card>
      <Card className="shadow-sm border bg-white dark:bg-gray-800">
        <CardContent className="p-3 flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">In Service</span>
          <span className="text-lg font-bold text-amber-600 dark:text-amber-400">{stats?.in_service_vehicles || 0}</span>
        </CardContent>
      </Card>
      <Card className="shadow-sm border bg-white dark:bg-gray-800">
        <CardContent className="p-3 flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Due Service</span>
          <span className="text-lg font-bold text-red-600 dark:text-red-400">{stats?.due_service_vehicles || 0}</span>
        </CardContent>
      </Card>
      <Card className="shadow-sm border bg-white dark:bg-gray-800">
        <CardContent className="p-3 flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Sold</span>
          <span className="text-lg font-bold text-gray-500 dark:text-gray-400">{stats?.sold_vehicles || 0}</span>
        </CardContent>
      </Card>
    </div>
  );

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded">
        Error loading vehicles. Please try again.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header with Stats */}
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Vehicles</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Manage your fleet and customer vehicles.
          </p>
        </div>

        <StatsGrid />
      </div>

      {/* Unified Toolbar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-gray-900/50 p-1 rounded-lg">
        <div className="flex items-center gap-2 flex-1 w-full md:w-auto">
          {/* Search */}
          <div className="relative flex-1 md:flex-none md:w-64">
            <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-9 h-9 text-sm bg-gray-50 dark:bg-gray-800 border-none focus:ring-1 transition-all"
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
              setPage(1);
            }}
            title="Filter"
          />

          {/* Clear Filters (Icon only for compactness) */}
          {(search || Object.keys(advancedFilters).length > 0) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                setAdvancedFilters({});
                setPage(1);
              }}
              className="h-9 w-9 p-0 text-gray-500 hover:text-red-600"
              title="Clear all filters"
            >
              <X className="w-4 h-4" />
            </Button>
          )}

          {/* Active Filter Badges */}
          <div className="hidden lg:flex flex-wrap items-center gap-1.5 ml-2">
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
                <Badge key={key} variant="secondary" className="text-[10px] px-1.5 h-6 flex items-center gap-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-normal">
                  {displayLabel}: {displayValue}
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
                      setPage(1);
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
              <PermissionGuard permission="import_vehicles">
                <DropdownMenuItem onClick={() => setShowImportDialog(true)}>
                  <Upload className="w-4 h-4 mr-2" />
                  Import CSV
                </DropdownMenuItem>
              </PermissionGuard>
              <PermissionGuard permission="export_vehicles">
                <DropdownMenuItem onClick={handleExport} disabled={!data?.results || data.results.length === 0}>
                  <Download className="w-4 h-4 mr-2" />
                  Export CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { if (data?.results) exportVehiclesForImport(data.results); }} disabled={!data?.results || data.results.length === 0}>
                  <Download className="w-4 h-4 mr-2" />
                  Export for Import
                </DropdownMenuItem>
              </PermissionGuard>
            </DropdownMenuContent>
          </DropdownMenu>

          <PermissionGuard permission="create_vehicles">
            <Link href="/vehicles/new">
              <Button size="sm" className="h-9 bg-gray-900 text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200">
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Add Vehicle
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
      />

      {/* Vehicles Table */}
      <Card className="border-t shadow-sm dark:bg-gray-800 dark:border-gray-700">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6">
              <TableSkeleton rows={8} columns={8} />
            </div>
          ) : data?.results && data.results.length > 0 ? (
            <div className="rounded-md">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50/50 hover:bg-gray-50/50 dark:bg-gray-900/50">
                  <tr>
                    <th className="px-4 py-3 text-left w-12 h-10">
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
                    <th className="px-4 h-10 text-left text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Customer
                    </th>
                    <th className="px-4 h-10 text-left text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      License Plate
                    </th>
                    <SortableHeader
                      field="make"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                      className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400"
                    >
                      Make/Model
                    </SortableHeader>
                    <SortableHeader
                      field="vin"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                      className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400"
                    >
                      VIN
                    </SortableHeader>
                    <SortableHeader
                      field="year"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                      className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400"
                    >
                      Year
                    </SortableHeader>
                    <SortableHeader
                      field="status"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                      className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400"
                    >
                      Status
                    </SortableHeader>
                    <SortableHeader
                      field="created_at"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                      className="px-4 h-10 text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400"
                    >
                      Created
                    </SortableHeader>
                    <th className="px-4 h-10 text-right text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                  {data.results.map((vehicle) => (
                    <tr key={vehicle.id} className="group hover:bg-gray-50/80 dark:hover:bg-gray-800/50 transition-colors duration-150 cursor-pointer" onDoubleClick={() => router.push(`/vehicles/${vehicle.id}`)}>
                      <td className="px-4 py-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={bulkSelection.isSelected(vehicle.id)}
                          onChange={() => bulkSelection.toggleSelection(vehicle.id)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {(vehicle as any).owner_name || (typeof vehicle.owner === "object" ? `${(vehicle.owner as any).user?.first_name || ""} ${(vehicle.owner as any).user?.last_name || ""}`.trim() : "-") || "-"}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {vehicle.license_plate || "-"}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        <div className="flex items-center space-x-2">
                          <Car className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                          <span className="font-medium">
                            {vehicle.make || ""} {vehicle.model || ""}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap font-mono text-xs text-gray-500 dark:text-gray-400">
                        {vehicle.vin || "-"}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {vehicle.year || "-"}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <Badge variant={getStatusVariant(vehicle.status) as any} className="text-[10px] px-2 py-0.5 h-5 capitalize font-medium">
                          {vehicle.status?.replace("_", " ") || vehicle.status || "-"}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {vehicle.created_at ? new Date(vehicle.created_at).toLocaleDateString() : "-"}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-right text-sm font-medium">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" onClick={(e) => e.stopPropagation()} className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                              <MoreVertical className="w-3.5 h-3.5 text-gray-500" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem asChild>
                              <Link href={`/vehicles/${vehicle.id}`} className="flex items-center">
                                <Eye className="w-4 h-4 mr-2" />
                                View Details
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/vehicles/${vehicle.id}/edit`} className="flex items-center">
                                <Edit className="w-4 h-4 mr-2" />
                                Edit Vehicle
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/vehicles/${vehicle.id}/history`} className="flex items-center">
                                <History className="w-4 h-4 mr-2" />
                                Service History
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem asChild>
                              <Link href={`/workorders/new?vehicle=${vehicle.id}`} className="flex items-center">
                                <Wrench className="w-4 h-4 mr-2" />
                                Create Work Order
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/appointments/new?vehicle=${vehicle.id}`} className="flex items-center">
                                <Calendar className="w-4 h-4 mr-2" />
                                Schedule Appointment
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => { if (window.confirm(`Delete vehicle "${vehicle.make} ${vehicle.model}" (${vehicle.vin})?`)) handleDelete(vehicle); }} disabled={deleteMutation.isPending} className="text-red-600 dark:text-red-400">
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete Vehicle
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <Car className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">No vehicles found.</p>
              <Link href="/vehicles/new">
                <Button className="mt-4" variant="secondary">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Your First Vehicle
                </Button>
              </Link>
            </div>
          )}

          {/* Pagination */}
          {data && data.count > 0 && (
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
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
          const result = await vehiclesApi.import(file);
          queryClient.invalidateQueries({ queryKey: ["vehicles"] });
          return result;
        }}
        title="Import Vehicles"
        description="Upload a CSV file with vehicle data. Required columns: vin, make, model, year, owner (customer ID or email)."
        onDownloadTemplate={downloadVehicleTemplate}
      />
    </div>
  );
}
