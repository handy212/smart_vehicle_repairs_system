"use client";

import { useQuery } from "@tanstack/react-query";
import { auditLogsApi, AuditLog } from "@/lib/api/audit-logs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Download, RefreshCw } from "lucide-react";
import { useState } from "react";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { exportToCSV } from "@/lib/utils/export";
import { useToast } from "@/lib/hooks/useToast";

export default function ImportHistoryPage() {
  const [modelFilter, setModelFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const { toast } = useToast();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["import-history", modelFilter, search, startDate, endDate, page],
    queryFn: () =>
      auditLogsApi.importHistory({
        model_name: modelFilter || undefined,
        date_from: startDate || undefined,
        date_to: endDate || undefined,
        page,
      }),
  });

  const handleExport = () => {
    if (!data?.results || data.results.length === 0) {
      toast({
        title: "No Data",
        description: "No import history to export",
        variant: "destructive",
      });
      return;
    }

    exportToCSV(
      data.results,
      "import_history",
      [
        { key: "timestamp", label: "Date" },
        { key: "user_name", label: "User" },
        { key: "model_name", label: "Model" },
        { key: "object_repr", label: "Description" },
        { key: "changes", label: "Details" },
      ]
    );

    toast({ title: "Success", description: "Import history exported successfully" });
  };

  const getModelBadgeVariant = (modelName?: string) => {
    switch (modelName) {
      case "Customer":
        return "default";
      case "Vehicle":
        return "success";
      case "Part":
        return "warning";
      default:
        return "secondary";
    }
  };

  const getStatusBadge = (log: AuditLog) => {
    const changes = log.changes || {};
    if (changes.error) {
      return <Badge variant="danger">Failed</Badge>;
    }
    if (changes.imported > 0) {
      return <Badge variant="success">Success</Badge>;
    }
    return <Badge variant="secondary">No imports</Badge>;
  };

  if (isLoading && !data) {
    return <TableSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Import History</h1>
          <p className="mt-1 text-sm text-gray-500">View and track all CSV import operations</p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="secondary" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button variant="secondary" onClick={handleExport} disabled={!data?.results || data.results.length === 0}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-2">Filter by Model</label>
              <Select value={modelFilter} onChange={(e) => setModelFilter(e.target.value)}>
                <option value="">All Models</option>
                <option value="Customer">Customers</option>
                <option value="Vehicle">Vehicles</option>
                <option value="Part">Parts</option>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-2">Start Date</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-2">End Date</label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button
                variant="secondary"
                onClick={() => {
                  setModelFilter("");
                  setStartDate("");
                  setEndDate("");
                  setSearch("");
                }}
                className="w-full"
              >
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Import History Table */}
      <Card>
        <CardHeader>
          <CardTitle>Import Operations</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <TableSkeleton />
          ) : !data?.results || data.results.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">No import history found</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date & Time</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead>File</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Imported</TableHead>
                      <TableHead>Skipped</TableHead>
                      <TableHead>Errors</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.results.map((log) => {
                      const changes = log.changes || {};
                      const filename = changes.filename || "Unknown";
                      const imported = changes.imported || 0;
                      const skipped = changes.skipped || 0;
                      const errorCount = changes.total_errors || 0;

                      return (
                        <TableRow key={log.id}>
                          <TableCell>
                            {format(new Date(log.timestamp), "MMM d, yyyy h:mm a")}
                          </TableCell>
                          <TableCell>{log.user_name || log.user_email || "Unknown"}</TableCell>
                          <TableCell>
                            <Badge variant={getModelBadgeVariant(log.model_name) as any}>
                              {log.model_name || "N/A"}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-xs truncate" title={filename}>
                            {filename}
                          </TableCell>
                          <TableCell>{getStatusBadge(log)}</TableCell>
                          <TableCell>
                            <span className="text-green-700 font-medium">{imported}</span>
                          </TableCell>
                          <TableCell>
                            {skipped > 0 ? (
                              <span className="text-yellow-700 font-medium">{skipped}</span>
                            ) : (
                              <span className="text-gray-400">0</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {errorCount > 0 ? (
                              <span className="text-red-700 font-medium">{errorCount}</span>
                            ) : (
                              <span className="text-gray-400">0</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {data.count > 0 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-gray-600">
                    Showing {((page - 1) * 20) + 1} to {Math.min(page * 20, data.count)} of {data.count} imports
                  </p>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="secondary"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={!data.previous}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => setPage((p) => p + 1)}
                      disabled={!data.next}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

