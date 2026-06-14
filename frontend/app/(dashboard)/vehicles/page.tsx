"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { vehiclesApi } from "@/lib/api/vehicles";
import { servicesApi } from "@/lib/api/services";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Car, Trash2, Download, Upload, X, ChevronDown, MoreVertical, MoreHorizontal, Eye, Edit, History, Wrench, Calendar } from "lucide-react";
import { ImportDialog } from "@/components/ui/import-dialog";
import { downloadVehicleTemplate } from "@/lib/utils/import-templates";
import { exportVehiclesForImport } from "@/lib/utils/export-templates";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/lib/hooks/useToast";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { exportToCSV, exportToPDF } from "@/lib/utils/export";
import { useBulkSelection } from "@/lib/hooks/useBulkSelection";
import { BulkActionToolbar } from "@/components/ui/bulk-action-toolbar";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { AdvancedFilters, FilterOption, QuickFilter } from "@/components/ui/advanced-filters";
import { SortableHeader, SortConfig } from "@/components/ui/sortable-header";
import { toggleSortConfig } from "@/lib/utils/table-sort";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DynamicPageTitle } from "@/components/shared/DynamicPageTitle";
import { cn } from "@/lib/utils/cn";
import { VehicleStats } from "./components/VehicleStats";
import React from "react";
import { VehicleTable } from "./components/VehicleTable";
import { ServiceDueTable } from "./components/ServiceDueTable";

export default function VehiclesPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 500);
  const [page, setPage] = useState(1);
  const [vehicleStatus, setVehicleStatus] = useState("all");
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<Record<string, any>>({});
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();

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
    { key: "make", label: "Make", type: "text", placeholder: "e.g., Toyota" },
    { key: "model", label: "Model", type: "text", placeholder: "e.g., Camry" },
    { key: "year_from", label: "Year From", type: "number" },
    { key: "year_to", label: "Year To", type: "number" },
    {
      key: "engine_type",
      label: "Engine Type",
      type: "select",
      options: [
        { value: "gasoline", label: "Gasoline" },
        { value: "diesel", label: "Diesel" },
        { value: "electric", label: "Electric" },
        { value: "hybrid", label: "Hybrid" },
      ],
    },
    {
      key: "created_at",
      label: "Added Date",
      type: "daterange",
    },
  ];

  const { data: serviceTypesData } = useQuery({
    queryKey: ["service-types", "active"],
    queryFn: () => servicesApi.listServiceTypes({ is_active: true }),
  });

  const activeFilterOptions = [...filterOptions];
  if (vehicleStatus === "services_due") {
    activeFilterOptions.push(
      { 
        key: "days_ahead", 
        label: "Days Ahead", 
        type: "select", 
        options: [
          { value: "7", label: "7 days" },
          { value: "14", label: "14 days" },
          { value: "30", label: "30 days" },
          { value: "60", label: "60 days" },
          { value: "90", label: "90 days" },
        ] 
      },
      {
        key: "service_due_type",
        label: "Service Due Type",
        type: "select",
        options: serviceTypesData?.results.map(st => ({ value: st.id.toString(), label: st.name })) || []
      }
    );
  }

  const quickFilters: QuickFilter[] = [
    {
      label: "Last 30 Days",
      value: "last_30_days",
      filters: {
        created_at_from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        created_at_to: new Date().toISOString().split("T")[0],
      },
    },
    { label: "Active", value: "active", filters: { status: "active" } },
    { label: "In Service", value: "in_service", filters: { status: "in_service" } },
  ];

  const handleSort = (field: string) => {
    setSortConfig((current) => toggleSortConfig(current, field));
    setPage(1);
  };

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["vehicle-dashboard-stats"],
    queryFn: () => vehiclesApi.dashboardStats(),
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["vehicles", page, debouncedSearch, advancedFilters, sortConfig, vehicleStatus],
    queryFn: async () => {
      const ordering = sortConfig
        ? `${sortConfig.direction === "desc" ? "-" : ""}${sortConfig.field}`
        : "-created_at";

      const response = await vehiclesApi.list({
        page,
        search: debouncedSearch || undefined,
        status: (vehicleStatus === "all" || vehicleStatus === "services_due") ? (advancedFilters.status || undefined) : vehicleStatus,
        due_service: vehicleStatus === "services_due" ? true : undefined,
        make: advancedFilters.make || undefined,
        model: advancedFilters.model || undefined,
        year__gte: advancedFilters.year_from || undefined,
        year__lte: advancedFilters.year_to || undefined,
        engine_type: advancedFilters.engine_type || undefined,
        created_at__gte: advancedFilters.created_at_from || undefined,
        created_at__lte: advancedFilters.created_at_to || undefined,
        days_ahead: vehicleStatus === "services_due" ? (advancedFilters.days_ahead ? parseInt(advancedFilters.days_ahead) : undefined) : undefined,
        service_due_type: vehicleStatus === "services_due" ? (advancedFilters.service_due_type ? parseInt(advancedFilters.service_due_type) : undefined) : undefined,
        ordering,
      });
      return response;
    },
    // Reset to page 1 if 404
    retry: (failureCount, error: any) => {
      if (error.response?.status === 404 && page > 1) {
        setPage(1);
        return true;
      }
      return failureCount < 3;
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => vehiclesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      queryClient.invalidateQueries({ queryKey: ["vehicle-dashboard-stats"] });
      toast({ title: "Success", description: "Vehicle deleted successfully" });
    },
  });

  const handleDelete = (vehicle: any) => {
    if (confirm(`Are you sure you want to delete vehicle "${vehicle.make} ${vehicle.model}"?`)) {
      deleteMutation.mutate(vehicle.id);
    }
  };

  const handleExport = (format: "xlsx" | "pdf" = "xlsx") => {
    if (!data?.results?.length) return;
    (format === "pdf" ? exportToPDF : exportToCSV)(data.results, "vehicles_export", [
      { key: "vin", label: "VIN" },
      { key: "make", label: "Make" },
      { key: "model", label: "Model" },
      { key: "year", label: "Year" },
      { key: "license_plate", label: "License Plate" },
      { key: "status", label: "Status" },
    ]);
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto animate-in fade-in duration-500">
      <DynamicPageTitle title="Vehicles" />

      {/* Precision Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Fleet Management</h1>
            <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-bold bg-muted/50 border-border/50">
              {data?.count || 0} VEHICLES
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <PermissionGuard permission="create_vehicles">
            <Link href="/vehicles/new">
              <Button size="sm" className="h-9 shadow-sm hover:scale-[1.02] transition-all duration-300">
                <Plus className="w-4 h-4 mr-2" />
                Add Vehicle
              </Button>
            </Link>
          </PermissionGuard>
        </div>
      </div>

      {/* KPI Stats Section */}
      <VehicleStats stats={stats} isLoading={statsLoading} />

      {/* Unified Precision Toolbar */}
      <div className="flex flex-col space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          {/* Quick Filters - Precision Tabs */}
          <div className="flex p-1 bg-muted/50 rounded-lg border border-border/50 w-full md:w-auto overflow-x-auto no-scrollbar">
            {["all", "active", "services_due", "in_service"].map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  setVehicleStatus(tab);
                  setPage(1);
                }}
                className={cn(
                  "px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition-all duration-300 whitespace-nowrap",
                  vehicleStatus === tab
                    ? "bg-background text-foreground shadow-sm ring-1 ring-border/50"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                {tab.replace("_", " ")}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            {/* Unified Search */}
            <div className="relative flex-1 md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Find a vehicle..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-9 h-9 border-border/50 bg-muted/30 focus-visible:ring-primary/20 focus-visible:bg-background transition-all"
              />
            </div>

            <AdvancedFilters
              filters={activeFilterOptions}
              quickFilters={quickFilters}
              activeFilters={advancedFilters}
              onFiltersChange={(f) => {
                setAdvancedFilters(f);
                setPage(1);
              }}
              onClear={() => {
                setAdvancedFilters({});
                setPage(1);
              }}
              title="Fleet Filters"
            />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 border-dashed">
                  <ChevronDown className="w-3.5 h-3.5 mr-2 opacity-50" />
                  Actions
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => setShowImportDialog(true)}>
                  <Upload className="w-4 h-4 mr-2" />
                  Import Excel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport()}>
                  <Download className="w-4 h-4 mr-2" />
                  Export Excel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("pdf")}>
                  <Download className="w-4 h-4 mr-2" />
                  Export PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Main Table Section */}
      {isLoading ? (
        <div className="precision-card p-8">
          <TableSkeleton rows={8} columns={6} />
        </div>
      ) : error ? (
        <div className="precision-card p-12 text-center text-destructive border-rose-100 bg-rose-50/50">
          Error loading vehicle data. Please try again or contact support.
        </div>
      ) : (
        <div className="space-y-4">
          {vehicleStatus === "services_due" ? (
            <ServiceDueTable
              vehicles={data?.results || []}
              sortConfig={sortConfig}
              onSort={handleSort}
            />
          ) : (
            <VehicleTable
              vehicles={data?.results || []}
              onDelete={handleDelete}
              sortConfig={sortConfig}
              onSort={handleSort}
            />
          )}

          {/* Pagination & Summary */}
          {data && data.count > 0 && (
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 px-2">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.1em]">
                Showing {(page - 1) * 10 + 1}-{Math.min(page * 10, data.count)} of {data.count} vehicles
              </span>

              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={!data.previous}
                  className="h-8 w-8 p-0"
                  aria-label="Previous page"
                >
                  <ChevronDown className="w-4 h-4 rotate-90" />
                </Button>

                {/* Numbered Pagination */}
                {Array.from({ length: Math.ceil(data.count / 20) }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === Math.ceil(data.count / 20) || (p >= page - 1 && p <= page + 1))
                  .map((p, i, arr) => (
                    <React.Fragment key={p}>
                      {i > 0 && arr[i - 1] !== p - 1 && (
                        <span className="text-muted-foreground px-1">...</span>
                      )}
                      <Button
                        variant={page === p ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setPage(p)}
                        className={cn(
                          "h-8 w-8 p-0 text-[11px] font-bold",
                          page === p ? "shadow-sm" : "text-muted-foreground"
                        )}
                      >
                        {p}
                      </Button>
                    </React.Fragment>
                  ))}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => p + 1)}
                  disabled={!data.next}
                  className="h-8 w-8 p-0"
                  aria-label="Next page"
                >
                  <ChevronDown className="w-4 h-4 -rotate-90" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Import Dialog */}
      <ImportDialog
        isOpen={showImportDialog}
        onClose={() => setShowImportDialog(false)}
        onImport={async (file) => {
          const result = await vehiclesApi.import(file);
          queryClient.invalidateQueries({ queryKey: ["vehicles"] });
          return result;
        }}
        title="Import Fleet"
        description="Upload an Excel file with vehicle data. Required columns: vin, make, model, year, and owner CID."
        accept=".xlsx"
        onDownloadTemplate={downloadVehicleTemplate}
      />
    </div>
  );
}
