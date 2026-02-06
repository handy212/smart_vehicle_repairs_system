"use client";

import { useQuery } from "@tanstack/react-query";
import { inventoryApi, PurchaseOrder } from "@/lib/api/inventory";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Eye, FileText, MoreVertical, Edit, Printer, Truck, X, Download, Upload, ChevronDown, CheckCircle, Clock, AlertTriangle, DollarSign } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { AdvancedFilters, FilterOption, QuickFilter } from "@/components/ui/advanced-filters";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/lib/hooks/useToast";

// Stats Grid Component
// Stats Grid Component
const StatsGrid = ({ stats, loading }: { stats: any, loading: boolean }) => {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="shadow-sm border bg-muted/50">
            <CardContent className="p-3">
              <div className="h-4 w-20 bg-border rounded mb-2 animate-pulse" />
              <div className="h-6 w-12 bg-border rounded animate-pulse" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const items = [
    { label: "Total POs", value: stats.total_orders, color: "text-primary" },
    { label: "Pending", value: stats.pending_orders, color: "text-amber-600" },
    { label: "Completed", value: stats.completed_orders, color: "text-green-600" },
    { label: "Total Value", value: stats.total_value, isCurrency: true, color: "text-indigo-600" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      {items.map((item, index) => (
        <Card key={index} className="shadow-sm border bg-card">
          <CardContent className="p-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{item.label}</span>
            <span className={`text-lg font-bold ${item.color || 'text-gray-900'} dark:text-gray-100`}>
              {item.isCurrency ? <CurrencyValue value={item.value} /> : item.value?.toLocaleString() || 0}
            </span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

// Helper component for currency
const CurrencyValue = ({ value }: { value: any }) => {
  const { formatCurrency } = useCurrency();
  return <>{formatCurrency(value)}</>;
};


export default function PurchaseOrdersPage() {
  const { formatCurrency } = useCurrency();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [advancedFilters, setAdvancedFilters] = useState<Record<string, any>>({});
  const [page, setPage] = useState(1);
  const { toast } = useToast();

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["purchase-orders-stats"],
    queryFn: () => inventoryApi.purchaseOrdersDashboardStats(),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["purchase-orders", page, searchQuery, advancedFilters],
    queryFn: () =>
      inventoryApi.listPurchaseOrders({
        page,
        search: searchQuery || undefined,
        status: advancedFilters.status || undefined,
      }),
  });

  const purchaseOrders = Array.isArray(data) ? data : data?.results || [];

  const handleExport = () => {
    toast({ title: "Export", description: "Export functionality coming soon" });
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "draft": return "secondary";
      case "pending_approval": return "warning";
      case "approved": return "info";
      case "confirmed": return "success";
      case "received": return "success";
      case "partially_received": return "warning";
      case "cancelled": return "danger";
      default: return "default";
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      draft: "Draft",
      pending_approval: "Pending Approval",
      approved: "Approved",
      confirmed: "Confirmed",
      received: "Received",
      partially_received: "Partially Received",
      cancelled: "Cancelled",
    };
    return labels[status] || status.split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
  };

  const filterOptions: FilterOption[] = [
    {
      key: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "draft", label: "Draft" },
        { value: "pending_approval", label: "Pending Approval" },
        { value: "approved", label: "Approved" },
        { value: "confirmed", label: "Confirmed" },
        { value: "partially_received", label: "Partially Received" },
        { value: "received", label: "Received" },
        { value: "cancelled", label: "Cancelled" },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col space-y-4">
        <div className="flex justify-between items-center pt-2">
          <div>
            <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-1">
              <Link href="/dashboard" className="hover:text-primary transition-colors">Dashboard</Link>
              <span>/</span>
              <Link href="/inventory" className="hover:text-primary transition-colors">Inventory</Link>
              <span>/</span>
              <span className="text-foreground font-medium">Purchase Orders</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Purchase Orders
            </h1>
          </div>
        </div>

        <StatsGrid stats={stats} loading={statsLoading} />
      </div>

      {/* Unified Toolbar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card/50 p-1 rounded-lg">
        <div className="flex items-center gap-2 flex-1 w-full md:w-auto">
          {/* Search */}
          <div className="relative flex-1 md:flex-none md:w-64">
            <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              type="text"
              placeholder="Search purchase orders..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="pl-9 h-9 text-sm bg-muted border-none focus:ring-1 transition-all"
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
            title="Filter POs"
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
                <Badge key={key} variant="secondary" className="text-[10px] px-1.5 h-6 flex items-center gap-1 bg-gray-100 dark:bg-gray-800 text-muted-foreground font-normal">
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
              <Button variant="outline" size="sm" className="h-9 bg-card">
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

          <Link href="/inventory/purchase-orders/new">
            <Button size="sm" className="h-9 bg-primary hover:bg-primary/90 text-white shadow-sm">
              <Plus className="w-4 h-4 mr-2" />
              New PO
            </Button>
          </Link>
        </div>
      </div>

      {/* Purchase Orders Table */}
      <Card className="border-none shadow-sm overflow-hidden ring-1 ring-gray-200 dark:ring-gray-800">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6"><TableSkeleton rows={8} columns={7} /></div>
          ) : purchaseOrders.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50 border-y border-border">
                  <TableRow className="hover:bg-transparent border-none">
                    <TableHead className="h-9 text-[10px] uppercase tracking-wider font-semibold text-gray-500 px-4">PO Number</TableHead>
                    <TableHead className="h-9 text-[10px] uppercase tracking-wider font-semibold text-gray-500 px-4">Supplier</TableHead>
                    <TableHead className="h-9 text-[10px] uppercase tracking-wider font-semibold text-gray-500 px-4">Order Date</TableHead>
                    <TableHead className="h-9 text-[10px] uppercase tracking-wider font-semibold text-gray-500 px-4">Expected Delivery</TableHead>
                    <TableHead className="h-9 text-[10px] uppercase tracking-wider font-semibold text-gray-500 px-4">Status</TableHead>
                    <TableHead className="h-9 text-[10px] uppercase tracking-wider font-semibold text-gray-500 px-4 text-right">Total</TableHead>
                    <TableHead className="h-9 text-[10px] uppercase tracking-wider font-semibold text-gray-500 px-4 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchaseOrders.map((po) => (
                    <TableRow
                      key={po.id}
                      className="group hover:bg-gray-50/50 dark:hover:bg-gray-800/50 border-b border-border cursor-pointer transition-colors"
                      onClick={() => router.push(`/inventory/purchase-orders/${po.id}`)}
                    >
                      <TableCell className="px-4 py-2 font-mono text-xs font-medium text-card-foreground">
                        {po.po_number}
                      </TableCell>
                      <TableCell className="px-4 py-2">
                        <div className="flex items-center">
                          <Truck className="w-3.5 h-3.5 mr-2 text-gray-400" />
                          <span className="text-sm font-medium text-foreground">
                            {typeof po.supplier === "object" && po.supplier !== null
                              ? po.supplier.name
                              : po.supplier_name || "N/A"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-2 text-xs text-gray-500">
                        {po.order_date
                          ? format(new Date(po.order_date), "MMM dd, yyyy") // Keep it clean
                          : "-"}
                      </TableCell>
                      <TableCell className="px-4 py-2 text-xs text-gray-500">
                        {po.expected_delivery_date
                          ? format(new Date(po.expected_delivery_date), "MMM dd, yyyy")
                          : "-"}
                      </TableCell>
                      <TableCell className="px-4 py-2">
                        <Badge variant={getStatusVariant(po.status) as any} className="text-[10px] px-2 py-0 border shadow-none bg-transparent capitalize">
                          {getStatusLabel(po.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-4 py-2 font-mono text-xs text-foreground text-right">
                        {po.total ? `${formatCurrency(parseFloat(po.total))}` : "-"}
                      </TableCell>
                      <TableCell className="px-4 py-2 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 hover:bg-gray-100 text-gray-500"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreVertical className="w-3.5 h-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => router.push(`/inventory/purchase-orders/${po.id}`)}>
                              <Eye className="w-4 h-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            {po.status === 'draft' && (
                              <DropdownMenuItem onClick={() => router.push(`/inventory/purchase-orders/${po.id}/edit`)}>
                                <Edit className="w-4 h-4 mr-2" />
                                Edit Purchase Order
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => { /* TODO: Print */ }}>
                              <Printer className="w-4 h-4 mr-2" />
                              Print PO
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
              <FileText className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground">No purchase orders found</h3>
              <p className="text-gray-500 max-w-sm mx-auto mt-1 mb-4">
                Get started by creating a new purchase order.
              </p>
              <Link href="/inventory/purchase-orders/new">
                <Button variant="outline" size="sm">
                  <Plus className="w-3.5 h-3.5 mr-2" />
                  Create New PO
                </Button>
              </Link>
            </div>
          )}

          {/* Pagination */}
          {!Array.isArray(data) && data && data.count > 0 && (
            <div className="p-3 border-t border-border flex items-center justify-between bg-gray-50/30">
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
