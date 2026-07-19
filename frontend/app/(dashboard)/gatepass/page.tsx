"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { gatepassApi, type GatePass } from "@/lib/api/gatepass";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, FileText, X, MoreVertical, Eye, Edit, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { ComponentProps } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { useToast } from "@/lib/hooks/useToast";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { AdvancedFilters, FilterOption, QuickFilter } from "@/components/ui/advanced-filters";
import { SortableHeader, SortConfig } from "@/components/ui/sortable-header";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { StaffPageHeader } from "@/components/shared/StaffPageHeader";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getUserFacingError } from "@/lib/api/errors";
import { toLocalCalendarDate } from "@/lib/utils/calendar-date";

function getStatusVariant(status: string): ComponentProps<typeof Badge>["variant"] {
  switch (status) {
    case "pending":
      return "secondary";
    case "issued":
      return "default";
    case "completed":
      return "success";
    case "cancelled":
      return "danger";
    default:
      return "secondary";
  }
}

export default function GatePassPage() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 500);
  const [page, setPage] = useState(1);
  const [advancedFilters, setAdvancedFilters] = useState<Record<string, string>>({});
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const router = useRouter();

  const filterOptions: FilterOption[] = [
    {
      key: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "pending", label: "Pending" },
        { value: "issued", label: "Issued" },
        { value: "completed", label: "Completed" },
        { value: "cancelled", label: "Cancelled" },
      ],
    },
    {
      key: "created_at",
      label: "Created Date",
      type: "daterange",
    },
  ];

  const quickFilters: QuickFilter[] = useMemo(() => {
    const today = new Date();
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    return [
      {
        label: "Last 7 Days",
        value: "last_7_days",
        filters: {
          created_at_from: toLocalCalendarDate(sevenDaysAgo),
          created_at_to: toLocalCalendarDate(today),
        },
      },
      {
        label: "Pending",
        value: "pending",
        filters: {
          status: "pending",
        },
      },
      {
        label: "Completed",
        value: "completed",
        filters: {
          status: "completed",
        },
      },
    ];
  }, []);

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
    queryKey: ["gatepasses", page, debouncedSearch, advancedFilters, sortConfig],
    queryFn: () => {
      const ordering = sortConfig
        ? `${sortConfig.direction === "desc" ? "-" : ""}${sortConfig.field}`
        : undefined;
      return gatepassApi.list({
        page,
        search: debouncedSearch || undefined,
        status: advancedFilters.status || undefined,
        created_at__gte: advancedFilters.created_at_from || undefined,
        created_at__lte: advancedFilters.created_at_to || undefined,
        ordering,
      });
    },
  });

  const gatePasses = data?.results || [];

  const deleteMutation = useMutation({
    mutationFn: (id: number) => gatepassApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gatepasses"] });
      toast({ title: "Success", description: "Gate pass deleted successfully" });
    },

    onError: (error: unknown) => {
      toast({
        title: "Error",
        description: getUserFacingError(error, "Failed to delete gate pass"),
        variant: "destructive",
      });
    },
  });


  const handleDelete = (gatePass: GatePass) => {
    if (confirm(`Are you sure you want to delete gate pass "${gatePass.gate_pass_number}"? This action cannot be undone.`)) {
      deleteMutation.mutate(gatePass.id);
    }
  };

  if (error) {
    return (
      <div className="bg-destructive/10 dark:bg-destructive/20 border border-destructive/20 dark:border-destructive/30 text-destructive dark:text-destructive px-4 py-3 rounded">
        Error loading gate passes. Please try again.
      </div>
    );
  }

  return (
    <div className="space-y-4 h-full flex flex-col">
      <StaffPageHeader
        title="Gate Passes"
        className="pb-2"
      />

      {/* Unified Toolbar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 bg-card/50 p-2 rounded-lg border border-border shadow-sm">
        <div className="flex items-center gap-2 flex-1 w-full md:w-auto">
          {/* Search */}
          <div className="relative flex-1 md:flex-none md:w-56">
            <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-muted-foreground w-3.5 h-3.5" />
            <Input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-8 h-8 text-xs bg-muted border-border focus:ring-1 transition-all"
            />
          </div>

          {/* Advanced Filters Button */}
          <div className="h-8 text-xs px-2.5 flex items-center">
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
          </div>

          {/* Clear Filters */}
          {(search || Object.keys(advancedFilters).length > 0) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                setAdvancedFilters({});
                setPage(1);
              }}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
              aria-label="Clear all filters"
              title="Clear all filters"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          <PermissionGuard permission="create_gatepass">
            <Link href="/gatepass/new">
              <Button size="sm" className="h-8 text-xs bg-primary hover:bg-primary/90 text-white shadow-sm">
                <Plus className="w-3.5 h-3.5 mr-2" />
                New Gate Pass
              </Button>
            </Link>
          </PermissionGuard>
        </div>
      </div>

      {/* Gate Passes Table */}
      <Card className="border-border shadow-sm overflow-hidden flex-1">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4">
              <TableSkeleton rows={8} columns={8} />
            </div>
          ) : gatePasses.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50 border-b border-border">
                    <SortableHeader
                      field="gate_pass_number"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                      className="px-3 h-8 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground"
                    >
                      Gate Pass #
                    </SortableHeader>
                    <SortableHeader
                      field="work_order__work_order_number"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                      className="px-3 h-8 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground"
                    >
                      Work Order
                    </SortableHeader>
                    <SortableHeader
                      field="customer__user__last_name"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                      className="px-3 h-8 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground"
                    >
                      Customer
                    </SortableHeader>
                    <SortableHeader
                      field="vehicle__license_plate"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                      className="px-3 h-8 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground"
                    >
                      Vehicle
                    </SortableHeader>
                    <SortableHeader
                      field="pickup_person_name"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                      className="px-3 h-8 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground"
                    >
                      Pickup Person
                    </SortableHeader>
                    <SortableHeader
                      field="status"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                      className="px-3 h-8 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground"
                    >
                      Status
                    </SortableHeader>
                    <SortableHeader
                      field="created_at"
                      sortConfig={sortConfig}
                      onSort={handleSort}
                      className="px-3 h-8 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground"
                    >
                      Created
                    </SortableHeader>
                    <TableHead className="px-3 h-8 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gatePasses.map((gatePass) => (
                    <TableRow
                      key={gatePass.id}
                      className="group hover:bg-muted/80 transition-colors border-b border-border cursor-pointer"
                      onDoubleClick={() => router.push(`/gatepass/${gatePass.id}`)}
                    >
                      <TableCell className="px-3 py-1.5 font-mono text-[11px] font-bold text-primary">
                        {gatePass.gate_pass_number || "-"}
                      </TableCell>
                      <TableCell className="px-3 py-1.5 text-xs font-medium text-foreground">
                        <Link href={`/workorders/${typeof gatePass.work_order === 'object' ? gatePass.work_order.id : gatePass.work_order}`} className="text-primary hover:underline">
                          {gatePass.work_order_number || "-"}
                        </Link>
                      </TableCell>
                      <TableCell className="px-3 py-1.5 text-xs font-medium text-foreground">{gatePass.customer_name || "N/A"}</TableCell>
                      <TableCell className="px-3 py-1.5 text-xs text-muted-foreground max-w-[150px] truncate" title={gatePass.vehicle_info || ""}>{gatePass.vehicle_info || "N/A"}</TableCell>
                      <TableCell className="px-3 py-1.5 text-xs text-muted-foreground">
                        {gatePass.pickup_person_display || "N/A"}
                      </TableCell>
                      <TableCell className="px-3 py-1.5">

                        <Badge variant={getStatusVariant(gatePass.status)} className="text-[9px] px-1.5 py-0 h-4 capitalize font-bold border shadow-none bg-transparent">
                          {gatePass.status?.replace(/_/g, " ") || gatePass.status || "-"}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-3 py-1.5 text-[11px] text-muted-foreground">
                        {gatePass.created_at
                          ? format(new Date(gatePass.created_at), "MMM dd")
                          : "-"}
                      </TableCell>
                      <TableCell className="px-3 py-1.5 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 data-[state=open]:bg-muted dark:data-[state=open]:bg-muted"
                            >
                              <span className="sr-only">Open menu</span>
                              <MoreVertical className="w-3.5 h-3.5 text-muted-foreground" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuLabel className="text-xs">Actions</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => router.push(`/gatepass/${gatePass.id}`)} className="text-xs">
                              <Eye className="mr-2 h-3.5 w-3.5" />
                              View Details
                            </DropdownMenuItem>
                            <PermissionGuard permission="change_gatepass">
                              <DropdownMenuItem onClick={() => router.push(`/gatepass/${gatePass.id}/edit`)} className="text-xs">
                                <Edit className="mr-2 h-3.5 w-3.5" />
                                Edit Gate Pass
                              </DropdownMenuItem>
                            </PermissionGuard>
                            <DropdownMenuSeparator />
                            <PermissionGuard permission="delete_gatepass">
                              <DropdownMenuItem
                                onClick={() => handleDelete(gatePass)}
                                className="text-destructive dark:text-destructive focus:text-destructive dark:focus:text-destructive focus:bg-destructive/10 dark:focus:bg-destructive/20 text-xs"
                                disabled={deleteMutation.isPending}
                              >
                                <Trash2 className="mr-2 h-3.5 w-3.5" />
                                Delete
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
              <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No gate passes found.</p>
              <PermissionGuard permission="create_gatepass">
                <Link href="/gatepass/new">
                  <Button className="mt-4" variant="secondary">
                    <Plus className="w-4 h-4 mr-2" />
                    Create First Gate Pass
                  </Button>
                </Link>
              </PermissionGuard>
            </div>
          )}

          {/* Pagination */}
          {data && data.count > 0 && (
            <div className="p-2 border-t border-border flex items-center justify-between">
              <div className="text-[10px] text-muted-foreground pl-2">
                Page {page} of {Math.ceil(data.count / 20)} ({data.count} items)
              </div>
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={!data.previous}
                  className="h-7 text-xs px-2"
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!data.next}
                  className="h-7 text-xs px-2"
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
