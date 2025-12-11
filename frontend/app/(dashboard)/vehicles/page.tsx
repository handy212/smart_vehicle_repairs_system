"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { vehiclesApi } from "@/lib/api/vehicles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Car, Trash2, Download, Upload, X, ChevronDown, MoreVertical, Eye, Edit, History, Wrench, Calendar } from "lucide-react";
import { ImportDialog } from "@/components/ui/import-dialog";
import { downloadVehicleTemplate } from "@/lib/utils/import-templates";
import { exportVehiclesForImport } from "@/lib/utils/export-templates";
import Link from "next/link";
import { useState } from "react";
import { useToast } from "@/lib/hooks/useToast";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { exportToCSV } from "@/lib/utils/export";
import { useBulkSelection } from "@/lib/hooks/useBulkSelection";
import { BulkActionToolbar } from "@/components/ui/bulk-action-toolbar";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { AdvancedFilters, FilterOption, QuickFilter } from "@/components/ui/advanced-filters";
import { SortableHeader, SortConfig } from "@/components/ui/sortable-header";
import { ColumnVisibility, ColumnConfig } from "@/components/ui/column-visibility";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { PermissionGuard } from "@/components/auth/PermissionGuard";

export default function VehiclesPage() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 500);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<Record<string, any>>({});
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    new Set(["checkbox", "vin", "make_model", "year", "license_plate", "mileage", "status", "actions"])
  );
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();

  const columnConfigs: ColumnConfig[] = [
    { key: "vin", label: "VIN", defaultVisible: true },
    { key: "make_model", label: "Make/Model", defaultVisible: true },
    { key: "year", label: "Year", defaultVisible: true },
    { key: "license_plate", label: "License Plate", defaultVisible: true },
    { key: "mileage", label: "Mileage", defaultVisible: true },
    { key: "status", label: "Status", defaultVisible: true },
    { key: "owner", label: "Owner", defaultVisible: false },
    { key: "engine_type", label: "Engine Type", defaultVisible: false },
    { key: "created_at", label: "Created Date", defaultVisible: false },
  ];

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
            <TableSkeleton rows={8} columns={8} />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded">
        Error loading vehicles. Please try again.
      </div>
    );
  }

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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Vehicles</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage vehicle database and service history
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <ColumnVisibility
            columns={columnConfigs}
            visibleColumns={visibleColumns}
            onVisibilityChange={setVisibleColumns}
            title="Vehicle Table Columns"
          />
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
                    <PermissionGuard permission="import_vehicles">
                      <button
                        onClick={() => {
                          setShowImportDialog(true);
                          setShowActionsMenu(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                      >
                        <Upload className="w-4 h-4" />
                        Import CSV
                      </button>
                    </PermissionGuard>
                    <PermissionGuard permission="export_vehicles">
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
                    <PermissionGuard permission="export_vehicles">
                      <button
                        onClick={() => {
                          if (data?.results) {
                            exportVehiclesForImport(data.results);
                          }
                          setShowActionsMenu(false);
                        }}
                        disabled={!data?.results || data.results.length === 0}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        <Download className="w-4 h-4" />
                        Export for Import
                      </button>
                    </PermissionGuard>
                  </div>
                </div>
              </>
            )}
          </div>
          <PermissionGuard permission="create_vehicles">
            <Link href="/vehicles/new">
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Add Vehicle
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
              placeholder="Search vehicles..."
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
              setStatusFilter("all");
              setStartDate("");
              setEndDate("");
            }}
            title="Advanced Vehicle Filters"
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
      />

      {/* Vehicles Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            All Vehicles ({data?.count || 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <TableSkeleton rows={8} columns={8} />
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
                    {visibleColumns.has("vin") && (
                      <SortableHeader
                        field="vin"
                        sortConfig={sortConfig}
                        onSort={handleSort}
                      >
                        VIN
                      </SortableHeader>
                    )}
                    {visibleColumns.has("make_model") && (
                      <SortableHeader
                        field="make"
                        sortConfig={sortConfig}
                        onSort={handleSort}
                      >
                        Make/Model
                      </SortableHeader>
                    )}
                    {visibleColumns.has("year") && (
                      <SortableHeader
                        field="year"
                        sortConfig={sortConfig}
                        onSort={handleSort}
                      >
                        Year
                      </SortableHeader>
                    )}
                    {visibleColumns.has("license_plate") && (
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        License Plate
                      </th>
                    )}
                    {visibleColumns.has("mileage") && (
                      <SortableHeader
                        field="current_mileage"
                        sortConfig={sortConfig}
                        onSort={handleSort}
                      >
                        Mileage
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
                    {visibleColumns.has("owner") && (
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Owner
                      </th>
                    )}
                    {visibleColumns.has("engine_type") && (
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Engine Type
                      </th>
                    )}
                    {visibleColumns.has("created_at") && (
                      <SortableHeader
                        field="created_at"
                        sortConfig={sortConfig}
                        onSort={handleSort}
                      >
                        Created Date
                      </SortableHeader>
                    )}
                    {visibleColumns.has("actions") && (
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                  {data.results.map((vehicle) => (
                    <tr key={vehicle.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors duration-150">
                      {visibleColumns.has("checkbox") && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={bulkSelection.isSelected(vehicle.id)}
                            onChange={() => bulkSelection.toggleSelection(vehicle.id)}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                        </td>
                      )}
                      {visibleColumns.has("vin") && (
                        <td className="px-6 py-4 whitespace-nowrap font-mono text-sm text-gray-900 dark:text-gray-100">
                          {vehicle.vin || "-"}
                        </td>
                      )}
                      {visibleColumns.has("make_model") && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                          <div className="flex items-center space-x-2">
                            <Car className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                            <span className="font-medium">
                              {vehicle.make || ""} {vehicle.model || ""}
                            </span>
                          </div>
                        </td>
                      )}
                      {visibleColumns.has("year") && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                          {vehicle.year || "-"}
                        </td>
                      )}
                      {visibleColumns.has("license_plate") && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {vehicle.license_plate || "-"}
                        </td>
                      )}
                      {visibleColumns.has("mileage") && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {(vehicle as any).current_mileage ? `${((vehicle as any).current_mileage).toLocaleString()} mi` : "-"}
                        </td>
                      )}
                      {visibleColumns.has("status") && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Badge variant={getStatusVariant(vehicle.status) as any}>
                            {vehicle.status?.replace("_", " ") || vehicle.status || "-"}
                          </Badge>
                        </td>
                      )}
                      {visibleColumns.has("owner") && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {(vehicle as any).owner_name || (typeof vehicle.owner === "object" ? `${(vehicle.owner as any).user?.first_name || ""} ${(vehicle.owner as any).user?.last_name || ""}`.trim() : "-") || "-"}
                        </td>
                      )}
                      {visibleColumns.has("engine_type") && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 capitalize">
                          {(vehicle as any).engine_type || "-"}
                        </td>
                      )}
                      {visibleColumns.has("created_at") && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {vehicle.created_at ? new Date(vehicle.created_at).toLocaleDateString() : "-"}
                        </td>
                      )}
                      {visibleColumns.has("actions") && (
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="relative flex justify-end">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setActionMenuOpen(actionMenuOpen === vehicle.id ? null : vehicle.id)}
                              className="h-8 w-8 p-0 dark:hover:bg-gray-700"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                            {actionMenuOpen === vehicle.id && (
                              <>
                                <div
                                  className="fixed inset-0 z-10"
                                  onClick={() => setActionMenuOpen(null)}
                                />
                                <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-20">
                                  <div className="py-1">
                                    <Link
                                      href={`/vehicles/${vehicle.id}`}
                                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                      onClick={() => setActionMenuOpen(null)}
                                    >
                                      <Eye className="w-4 h-4" />
                                      View Details
                                    </Link>
                                    <Link
                                      href={`/vehicles/${vehicle.id}/edit`}
                                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                      onClick={() => setActionMenuOpen(null)}
                                    >
                                      <Edit className="w-4 h-4" />
                                      Edit Vehicle
                                    </Link>
                                    <Link
                                      href={`/vehicles/${vehicle.id}/history`}
                                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                      onClick={() => setActionMenuOpen(null)}
                                    >
                                      <History className="w-4 h-4" />
                                      View Service History
                                    </Link>
                                    <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                                    <Link
                                      href={`/workorders/new?vehicle=${vehicle.id}`}
                                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                      onClick={() => setActionMenuOpen(null)}
                                    >
                                      <Wrench className="w-4 h-4" />
                                      Create Work Order
                                    </Link>
                                    <Link
                                      href={`/appointments/new?vehicle=${vehicle.id}`}
                                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                      onClick={() => setActionMenuOpen(null)}
                                    >
                                      <Calendar className="w-4 h-4" />
                                      Schedule Appointment
                                    </Link>
                                    <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                                    <button
                                      onClick={() => {
                                        if (window.confirm(`Are you sure you want to delete vehicle "${vehicle.make} ${vehicle.model} ${vehicle.year}" (${vehicle.vin})? This action cannot be undone.`)) {
                                          handleDelete(vehicle);
                                        }
                                        setActionMenuOpen(null);
                                      }}
                                      disabled={deleteMutation.isPending}
                                      className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                      Delete Vehicle
                                    </button>
                                  </div>
                                </div>
                              </>
                            )}
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
              <Car className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">No vehicles found.</p>
              <Link href="/vehicles/new">
                <Button className="mt-4" variant="outline">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Your First Vehicle
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
