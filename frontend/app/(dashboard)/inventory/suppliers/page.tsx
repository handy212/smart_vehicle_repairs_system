"use client";

import { useQuery } from "@tanstack/react-query";
import { inventoryApi, Supplier } from "@/lib/api/inventory";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Eye, Edit, Building2, MoreVertical, Trash2, X, Download, Upload, ChevronDown, CheckCircle, Store, Factory, Truck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdvancedFilters, FilterOption, QuickFilter } from "@/components/ui/advanced-filters";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/lib/hooks/useToast";

// Stats Grid Component
// Stats Grid Component
const StatsGrid = ({ stats, loading }: { stats: any, loading: boolean }) => {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="shadow-sm border bg-gray-50/50 dark:bg-gray-800/50">
            <CardContent className="p-3">
              <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded mb-2 animate-pulse" />
              <div className="h-6 w-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const items = [
    { label: "Total Suppliers", value: stats.total_suppliers, color: "text-blue-600" },
    { label: "Active", value: stats.active_suppliers, color: "text-green-600" },
    { label: "Preferred", value: stats.preferred_suppliers, color: "text-amber-600" },
  ];

};

export default function SuppliersPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [advancedFilters, setAdvancedFilters] = useState<Record<string, any>>({});
  const [page, setPage] = useState(1);
  const { toast } = useToast();

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["supplier-stats"],
    queryFn: () => inventoryApi.suppliersDashboardStats(),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["suppliers", page, searchQuery, advancedFilters],
    queryFn: () =>
      inventoryApi.listSuppliers({
        page,
        search: searchQuery || undefined,
        is_active: advancedFilters.is_active === 'true' ? true : advancedFilters.is_active === 'false' ? false : undefined,
        supplier_type: advancedFilters.supplier_type || undefined,
      }),
  });

  const suppliers = Array.isArray(data) ? data : data?.results || [];

  const handleExport = () => {
    toast({ title: "Export", description: "Export functionality coming soon" });
  };

  const filterOptions: FilterOption[] = [
    {
      key: "is_active",
      label: "Status",
      type: "select",
      options: [
        { value: "true", label: "Active" },
        { value: "false", label: "Inactive" },
      ],
    },
    {
      key: "supplier_type",
      label: "Type",
      type: "select",
      options: [
        { value: "manufacturer", label: "Manufacturer" },
        { value: "distributor", label: "Distributor" },
        { value: "wholesaler", label: "Wholesaler" },
        { value: "retailer", label: "Retailer" },
        { value: "other", label: "Other" },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col space-y-4">
        <div className="flex justify-between items-center pt-2">
          <div>
            <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-1">
              <Link href="/dashboard" className="hover:text-blue-600 transition-colors">Dashboard</Link>
              <span>/</span>
              <Link href="/inventory" className="hover:text-blue-600 transition-colors">Inventory</Link>
              <span>/</span>
              <span className="text-gray-900 dark:text-gray-100 font-medium">Suppliers</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
              Suppliers
            </h1>
          </div>
        </div>

        <StatsGrid stats={stats} loading={statsLoading} />
      </div>

      {/* Unified Toolbar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-gray-900/50 p-1 rounded-lg">
        <div className="flex items-center gap-2 flex-1 w-full md:w-auto">
          {/* Search */}
          <div className="relative flex-1 md:flex-none md:w-64">
            <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              type="text"
              placeholder="Search suppliers..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="pl-9 h-9 text-sm bg-gray-50 dark:bg-gray-800 border-none focus:ring-1 transition-all"
            />
          </div>

          {/* Advanced Filters */}
          <AdvancedFilters
            filters={filterOptions}
            activeFilters={advancedFilters}
            onFiltersChange={(filters) => {
              setAdvancedFilters(filters);
              setPage(1);
            }}
            onClear={() => {
              setAdvancedFilters({});
              setPage(1);
            }}
            title="Filter Suppliers"
          />

          {/* Clear Filters (Icon only) */}
          {(searchQuery || Object.keys(advancedFilters).length > 0) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchQuery("");
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
              let displayLabel = key;
              let displayValue = String(value);

              const filter = filterOptions.find((f) => f.key === key);
              if (filter) {
                displayLabel = filter.label;
                if (filter.type === 'select') {
                  const option = filter.options?.find(o => o.value === String(value));
                  if (option) displayValue = option.label;
                }
              }

              return (
                <Badge key={key} variant="secondary" className="text-[10px] px-1.5 h-6 flex items-center gap-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-normal">
                  {displayLabel}: {displayValue}
                  <X
                    className="w-3 h-3 cursor-pointer hover:text-red-500"
                    onClick={() => {
                      const newFilters = { ...advancedFilters };
                      delete newFilters[key];
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
              <Button variant="outline" size="sm" className="h-9 bg-white dark:bg-gray-800">
                Actions
                <ChevronDown className="w-3.5 h-3.5 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={handleExport}>
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Link href="/inventory/suppliers/new">
            <Button size="sm" className="h-9 bg-blue-600 hover:bg-blue-700 text-white shadow-sm">
              <Plus className="w-4 h-4 mr-2" />
              Add Supplier
            </Button>
          </Link>
        </div>
      </div>

      {/* Suppliers Table */}
      <Card className="border-none shadow-sm overflow-hidden ring-1 ring-gray-200 dark:ring-gray-800">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6"><TableSkeleton rows={8} columns={7} /></div>
          ) : suppliers.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-gray-50/50 dark:bg-gray-800/50 border-y border-gray-100 dark:border-gray-800">
                  <TableRow className="hover:bg-transparent border-none">
                    <TableHead className="h-9 text-[10px] uppercase tracking-wider font-semibold text-gray-500 px-4">Code</TableHead>
                    <TableHead className="h-9 text-[10px] uppercase tracking-wider font-semibold text-gray-500 px-4">Name</TableHead>
                    <TableHead className="h-9 text-[10px] uppercase tracking-wider font-semibold text-gray-500 px-4">Type</TableHead>
                    <TableHead className="h-9 text-[10px] uppercase tracking-wider font-semibold text-gray-500 px-4">Contact</TableHead>
                    <TableHead className="h-9 text-[10px] uppercase tracking-wider font-semibold text-gray-500 px-4">Location</TableHead>
                    <TableHead className="h-9 text-[10px] uppercase tracking-wider font-semibold text-gray-500 px-4 text-center">Parts</TableHead>
                    <TableHead className="h-9 text-[10px] uppercase tracking-wider font-semibold text-gray-500 px-4">Status</TableHead>
                    <TableHead className="h-9 text-[10px] uppercase tracking-wider font-semibold text-gray-500 px-4 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suppliers.map((supplier) => (
                    <TableRow
                      key={supplier.id}
                      className="group hover:bg-gray-50/50 dark:hover:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800 cursor-pointer transition-colors"
                    >
                      <TableCell className="px-4 py-2 font-mono text-xs font-medium text-gray-700 dark:text-gray-300">
                        {supplier.supplier_code}
                      </TableCell>
                      <TableCell className="px-4 py-2">
                        <div className="flex items-center">
                          <Building2 className="w-3.5 h-3.5 mr-2 text-gray-400" />
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{supplier.name}</span>
                          {supplier.is_preferred && (
                            <Badge variant="success" className="ml-2 text-[10px] px-1.5 py-0 h-4">
                              Pref
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-2">
                        <Badge variant="secondary" className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-normal capitalize">
                          {supplier.supplier_type || "N/A"}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-4 py-2">
                        <div className="text-xs">
                          {supplier.contact_person && (
                            <div className="font-medium text-gray-900 dark:text-gray-100">{supplier.contact_person}</div>
                          )}
                          {supplier.email && (
                            <div className="text-gray-500">{supplier.email}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-2 text-xs text-gray-600 dark:text-gray-400">
                        {supplier.city && supplier.state
                          ? `${supplier.city}, ${supplier.state}`
                          : supplier.city || supplier.state || "-"}
                      </TableCell>
                      <TableCell className="px-4 py-2 text-center">
                        <Badge variant="outline" className="border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400">
                          {supplier.parts_count || 0}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-4 py-2">
                        <Badge variant={supplier.is_active ? "success" : "secondary"} className="text-[10px] px-2 py-0">
                          {supplier.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-4 py-2 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-gray-100 text-gray-500">
                              <MoreVertical className="w-3.5 h-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem asChild>
                              <Link href={`/inventory/suppliers/${supplier.id}`} className="flex items-center cursor-pointer">
                                <Eye className="w-4 h-4 mr-2" />
                                View Details
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/inventory/suppliers/${supplier.id}/edit`} className="flex items-center cursor-pointer">
                                <Edit className="w-4 h-4 mr-2" />
                                Edit Supplier
                              </Link>
                            </DropdownMenuItem>
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
              <Building2 className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">No suppliers found</h3>
              <p className="text-gray-500 max-w-sm mx-auto mt-1 mb-4">
                Get started by adding a new supplier to your system.
              </p>
              <Link href="/inventory/suppliers/new">
                <Button variant="outline" size="sm">
                  <Plus className="w-3.5 h-3.5 mr-2" />
                  Add Supplier
                </Button>
              </Link>
            </div>
          )}

          {/* Pagination */}
          {!Array.isArray(data) && data && data.count > 0 && (
            <div className="p-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/30">
              <div className="text-xs text-gray-500">
                Showing {((page - 1) * 10) + 1} to {Math.min(page * 10, data.count)} of {data.count}
              </div>
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={!data.previous}
                  className="h-7 text-xs bg-white"
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!data.next}
                  className="h-7 text-xs bg-white"
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
