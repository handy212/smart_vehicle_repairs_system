"use client";

import { useQuery } from "@tanstack/react-query";
import { inspectionsApi, VehicleInspection } from "@/lib/api/inspections";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { FileText, Plus, Search, Filter, MoreVertical, Eye, Edit, Printer } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { cn } from "@/lib/utils/cn";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

// Removed const statusColors and resultColors as they are now handled inline or could be moved to utility


export default function InspectionsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [resultFilter, setResultFilter] = useState<string>("");
  const { hasPermission } = usePermissions();
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ["inspections", "list", page, search, statusFilter, resultFilter],
    queryFn: () =>
      inspectionsApi.list({
        page,
        search: search || undefined,
        status: statusFilter || undefined,
        overall_result: resultFilter || undefined,
      }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const inspections = data?.results || [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-1">
            <Link href="/dashboard" className="hover:text-primary transition-colors">Dashboard</Link>
            <span>/</span>
            <span className="text-foreground font-medium">Inspections</span>
          </div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">Vehicle Inspections</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/inspections/templates">
            <Button variant="outline" size="sm" className="h-9 bg-muted text-foreground border-border">
              <FileText className="w-3.5 h-3.5 mr-2" />
              Templates
            </Button>
          </Link>
          <PermissionGuard permission="create_inspections">
            <Link href="/inspections/new">
              <Button size="sm" className="h-9 bg-primary hover:bg-primary/90 text-white shadow-sm">
                <Plus className="w-3.5 h-3.5 mr-2" />
                New Inspection
              </Button>
            </Link>
          </PermissionGuard>
        </div>
      </div>

      {/* Filters */}
      <Card className="border-none shadow-sm bg-muted/50">
        <CardContent className="p-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search inspections..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-sm bg-card border-border focus:w-full transition-all"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-9 rounded-md border border-border bg-card px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">All Status</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
              <select
                value={resultFilter}
                onChange={(e) => setResultFilter(e.target.value)}
                className="h-9 rounded-md border border-border bg-card px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">All Results</option>
                <option value="pass">Pass</option>
                <option value="pass_with_advisory">Pass with Advisory</option>
                <option value="fail">Fail</option>
                <option value="needs_attention">Needs Attention</option>
              </select>
              {(search || statusFilter || resultFilter) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setStatusFilter("");
                    setResultFilter("");
                  }}
                  className="h-9 px-3 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <Filter className="w-3.5 h-3.5 mr-2" />
                  Clear
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border-t shadow-sm">
        <CardHeader className="py-3 px-4 border-b bg-muted/50">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-card-foreground">
              Inspections List
            </CardTitle>
            <span className="text-xs text-muted-foreground font-medium">
              {data?.count || 0} records
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {inspections.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="mx-auto h-12 w-12 text-gray-300 text-muted-foreground" />
              <h3 className="mt-2 text-sm font-medium text-foreground">No inspections found</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Get started by creating a new inspection or try adjusting your filters.
              </p>
              <div className="mt-6">
                <PermissionGuard permission="create_inspections">
                  <Link href="/inspections/new">
                    <Button size="sm">
                      <Plus className="w-4 h-4 mr-2" />
                      New Inspection
                    </Button>
                  </Link>
                </PermissionGuard>
              </div>
            </div>
          ) : (
            <div className="rounded-md">
              <Table>
                <TableHeader className="bg-muted/50 hover:bg-muted/50">
                  <TableRow>
                    <TableHead className="w-[100px] h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Number</TableHead>
                    <TableHead className="h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Vehicle</TableHead>
                    <TableHead className="h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Template</TableHead>
                    <TableHead className="h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Date</TableHead>
                    <TableHead className="h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Status</TableHead>
                    <TableHead className="h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Result</TableHead>
                    <TableHead className="h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Progress</TableHead>
                    <TableHead className="h-10 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inspections.map((inspection) => (
                    <TableRow
                      key={inspection.id}
                      className="group hover:bg-muted/80 hover:bg-muted/50 cursor-pointer"
                      onDoubleClick={() => router.push(`/inspections/${inspection.id}`)}
                    >
                      <TableCell className="py-2 font-mono text-xs font-medium text-primary">
                        {inspection.inspection_number}
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="text-sm font-medium text-foreground">
                          {inspection.vehicle_info || "Unknown Vehicle"}
                        </div>
                      </TableCell>
                      <TableCell className="py-2 text-sm text-muted-foreground">
                        {inspection.template_name || "N/A"}
                      </TableCell>
                      <TableCell className="py-2 text-sm text-muted-foreground">
                        {format(new Date(inspection.inspection_date), "MMM dd, yyyy")}
                      </TableCell>
                      <TableCell className="py-2">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] px-2 py-0.5 font-medium border shadow-none",
                            inspection.status === 'completed' && "border-green-200 text-green-700 bg-success/10",
                            inspection.status === 'in_progress' && "border-orange-200 text-primary bg-primary/5",
                            inspection.status === 'approved' && "border-indigo-200 text-indigo-700 bg-indigo-50/50",
                            inspection.status === 'rejected' && "border-red-200 text-red-700 bg-red-50/50",
                          )}
                        >
                          {inspection.status_display || inspection.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2">
                        {inspection.overall_result ? (
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] px-2 py-0.5 font-medium border shadow-none",
                              inspection.overall_result === 'pass' && "border-green-200 text-green-700 bg-success/10",
                              inspection.overall_result === 'pass_with_advisory' && "border-yellow-200 text-yellow-700 bg-warning/10",
                              inspection.overall_result === 'fail' && "border-red-200 text-red-700 bg-red-50/50",
                              inspection.overall_result === 'needs_attention' && "border-orange-200 text-primary bg-orange-50/50",
                            )}
                          >
                            {inspection.overall_result_display || inspection.overall_result}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-muted rounded-full h-1.5">
                            <div
                              className="bg-primary h-1.5 rounded-full transition-all duration-500"
                              style={{
                                width: `${inspection.completion_percentage || 0}%`,
                              }}
                            />
                          </div>
                          <span className="text-[10px] text-muted-foreground font-medium">
                            {inspection.completion_percentage || 0}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-2 text-right">
                        <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-muted hover:bg-muted">
                                <div className="flex gap-0.5">
                                  <div className="h-0.5 w-0.5 rounded-full bg-gray-500" />
                                  <div className="h-0.5 w-0.5 rounded-full bg-gray-500" />
                                  <div className="h-0.5 w-0.5 rounded-full bg-gray-500" />
                                </div>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem onClick={() => router.push(`/inspections/${inspection.id}`)}>
                                <Eye className="w-4 h-4 mr-2" />
                                View Details
                              </DropdownMenuItem>
                              {inspection.status !== 'completed' && (
                                <DropdownMenuItem onClick={() => router.push(`/inspections/${inspection.id}/perform`)}>
                                  <Edit className="w-4 h-4 mr-2" />
                                  Edit Inspection
                                </DropdownMenuItem>
                              )}
                              {inspection.status === 'completed' && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem>
                                    <Printer className="w-4 h-4 mr-2" />
                                    Print Report
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {data && data.count > 0 && (
            <div className="flex items-center justify-between p-4 border-t bg-muted/30">
              <div className="text-xs text-muted-foreground">
                Showing {inspections.length} of {data.count} records
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={!data.previous} className="h-7 text-xs">
                  Previous
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={!data.next} className="h-7 text-xs">
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

