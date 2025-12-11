"use client";

import { useQuery } from "@tanstack/react-query";
import { inspectionsApi, VehicleInspection } from "@/lib/api/inspections";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { FileText, Plus, Search, Filter, MoreVertical } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { PermissionGuard } from "@/components/auth/PermissionGuard";

const statusColors: Record<string, string> = {
  in_progress: "bg-yellow-100 text-yellow-800",
  completed: "bg-blue-100 text-blue-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

const resultColors: Record<string, string> = {
  pass: "bg-green-100 text-green-800",
  pass_with_advisory: "bg-yellow-100 text-yellow-800",
  fail: "bg-red-100 text-red-800",
  needs_attention: "bg-orange-100 text-orange-800",
};

export default function InspectionsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [resultFilter, setResultFilter] = useState<string>("");
  const [actionMenuOpen, setActionMenuOpen] = useState<number | null>(null);
  const { hasPermission } = usePermissions();

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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const inspections = data?.results || [];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Vehicle Inspections</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage and track vehicle inspections
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/inspections/templates">
            <Button variant="outline">
              <FileText className="w-4 h-4 mr-2" />
              Templates
            </Button>
          </Link>
          <PermissionGuard permission="create_inspections">
            <Link href="/inspections/new">
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                New Inspection
              </Button>
            </Link>
          </PermissionGuard>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search inspections..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">All Status</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <div>
              <select
                value={resultFilter}
                onChange={(e) => setResultFilter(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">All Results</option>
                <option value="pass">Pass</option>
                <option value="pass_with_advisory">Pass with Advisory</option>
                <option value="fail">Fail</option>
                <option value="needs_attention">Needs Attention</option>
              </select>
            </div>
            <div>
              <Button
                variant="outline"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("");
                  setResultFilter("");
                }}
                className="w-full"
              >
                <Filter className="w-4 h-4 mr-2" />
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Inspections ({data?.count || 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {inspections.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No inspections</h3>
              <p className="mt-1 text-sm text-gray-500">
                Get started by creating a new inspection.
              </p>
              <div className="mt-6">
                <PermissionGuard permission="create_inspections">
                  <Link href="/inspections/new">
                    <Button>
                      <Plus className="w-4 h-4 mr-2" />
                      New Inspection
                    </Button>
                  </Link>
                </PermissionGuard>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Inspection #</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Template</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead>Performed By</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inspections.map((inspection) => (
                    <TableRow key={inspection.id}>
                      <TableCell className="font-medium">
                        {inspection.inspection_number}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/vehicles/${typeof inspection.vehicle === 'object' ? inspection.vehicle.id : inspection.vehicle}`}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          {inspection.vehicle_info || "View Vehicle"}
                        </Link>
                      </TableCell>
                      <TableCell>{inspection.template_name || "N/A"}</TableCell>
                      <TableCell>
                        {format(new Date(inspection.inspection_date), "MMM dd, yyyy")}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={statusColors[inspection.status] || "bg-gray-100 text-gray-800"}
                        >
                          {inspection.status_display || inspection.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {inspection.overall_result ? (
                          <Badge
                            className={
                              resultColors[inspection.overall_result] || "bg-gray-100 text-gray-800"
                            }
                          >
                            {inspection.overall_result_display || inspection.overall_result}
                          </Badge>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </TableCell>
                      <TableCell>{inspection.performed_by_name || "N/A"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-24 bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full"
                              style={{
                                width: `${inspection.completion_percentage || 0}%`,
                              }}
                            />
                          </div>
                          <span className="text-sm text-gray-600">
                            {inspection.completion_percentage || 0}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="relative flex justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setActionMenuOpen(actionMenuOpen === inspection.id ? null : inspection.id)}
                            className="h-8 w-8 p-0 dark:hover:bg-gray-700"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                          {actionMenuOpen === inspection.id && (
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                onClick={() => setActionMenuOpen(null)}
                              />
                              <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-20">
                                <div className="py-1">
                                  <Link
                                    href={`/inspections/${inspection.id}`}
                                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                    onClick={() => setActionMenuOpen(null)}
                                  >
                                    <Eye className="w-4 h-4" />
                                    View Details
                                  </Link>
                                  {inspection.status !== 'completed' && (
                                    <Link
                                      href={`/inspections/${inspection.id}/perform`}
                                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                      onClick={() => setActionMenuOpen(null)}
                                    >
                                      <Edit className="w-4 h-4" />
                                      Edit Inspection
                                    </Link>
                                  )}
                                  {inspection.status === 'completed' && (
                                    <>
                                      <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                                      <button
                                        onClick={() => {
                                          // TODO: Implement print functionality
                                          setActionMenuOpen(null);
                                        }}
                                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                      >
                                        <Printer className="w-4 h-4" />
                                        Print Report
                                      </button>
                                    </>
                                  )}
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
          )}

          {data && data.count > 0 && (
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-gray-700">
                Showing {inspections.length} of {data.count} inspections
              </div>
              <div className="flex gap-2">
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
    </div>
  );
}

