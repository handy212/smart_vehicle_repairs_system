"use client";

import { useQuery } from "@tanstack/react-query";
import { adminApi, AuditLog } from "@/lib/api/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Search, Filter, Eye, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const ACTION_CHOICES = [
  { value: "create", label: "Create" },
  { value: "update", label: "Update" },
  { value: "delete", label: "Delete" },
];

export default function AuditLogPage() {
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const { data: logsData, isLoading } = useQuery({
    queryKey: ["admin", "audit-logs", actionFilter, searchTerm, dateFrom, dateTo, page],
    queryFn: () =>
      adminApi.auditLogs.list({
        page,
        action: actionFilter !== "all" ? actionFilter : undefined,
        search: searchTerm || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      }),
  });

  const { data: statsData } = useQuery({
    queryKey: ["admin", "audit-logs", "stats", dateFrom, dateTo],
    queryFn: () =>
      adminApi.auditLogs.stats({
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      }),
  });

  const getActionVariant = (action: string) => {
    switch (action) {
      case "create": return "success";
      case "update": return "info";
      case "delete": return "danger";
      default: return "default";
    }
  };

  const logs = logsData?.results || [];

  const handleClearFilters = () => {
    setActionFilter("all");
    setSearchTerm("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/admin">
            <Button variant="secondary">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Audit Log</h1>
            <p className="text-sm text-gray-500 mt-1">View system activity and audit trail</p>
          </div>
        </div>
      </div>

      {/* Statistics */}
      {statsData && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 flex flex-col justify-center">
              <div className="text-xl font-bold">{statsData.total}</div>
              <p className="text-xs text-gray-500">Total Logs</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex flex-col justify-center">
              <div className="text-xl font-bold">{statsData.by_action.length}</div>
              <p className="text-xs text-gray-500">Action Types</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex flex-col justify-center">
              <div className="text-xl font-bold">{statsData.top_users.length}</div>
              <p className="text-xs text-gray-500">Active Users</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex flex-col justify-center">
              <div className="text-xl font-bold">{statsData.top_models.length}</div>
              <p className="text-xs text-gray-500">Models Tracked</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Search</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
                <Input
                  placeholder="Search logs..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setPage(1);
                  }}
                  className="pl-8 h-8 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Action</label>
              <select
                value={actionFilter}
                onChange={(e) => {
                  setActionFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full px-2 py-1 h-8 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-950 dark:border-slate-800"
              >
                <option value="all">All</option>
                {ACTION_CHOICES.map((action) => (
                  <option key={action.value} value={action.value}>
                    {action.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">From</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">To</label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Button variant="outline" onClick={handleClearFilters} className="w-full h-8 text-xs">
                <RotateCcw className="w-3 h-3 mr-2" />
                Reset
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Audit Logs Table */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-base">
            Audit Logs ({logsData?.count || 0})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/50 hover:bg-gray-50/50">
                <TableHead className="py-2 h-9 text-xs font-semibold">Time</TableHead>
                <TableHead className="py-2 h-9 text-xs font-semibold">User</TableHead>
                <TableHead className="py-2 h-9 text-xs font-semibold">Action</TableHead>
                <TableHead className="py-2 h-9 text-xs font-semibold">Entity</TableHead>
                <TableHead className="py-2 h-9 text-xs font-semibold">IP</TableHead>
                <TableHead className="py-2 h-9 text-xs font-semibold text-right">Info</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                    No logs found.
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id} className="hover:bg-gray-50/50">
                    <TableCell className="whitespace-nowrap py-2 text-xs text-muted-foreground">
                      {format(new Date(log.timestamp), "MMM dd, HH:mm")}
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="flex items-center space-x-2 max-w-[200px]">
                        <span className="font-medium text-sm truncate" title={log.user_name || "Unknown"}>
                          {log.user_name || "Unknown"}
                        </span>
                        {log.user_email && log.user_email !== "system@system.local" && (
                          <span className="text-xs text-muted-foreground truncate hidden lg:inline" title={log.user_email}>
                            &lt;{log.user_email}&gt;
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-2">
                      <Badge variant={getActionVariant(log.action)} className="px-1.5 py-0 text-[10px] uppercase tracking-wide">
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="flex items-center text-xs max-w-[250px]">
                        <span className="font-medium capitalize mr-1">{log.model_name}:</span>
                        <span className="text-muted-foreground truncate" title={log.object_repr}>
                          {log.object_repr || log.object_id}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs py-2 text-muted-foreground">{log.ip_address || "-"}</TableCell>
                    <TableCell className="text-right py-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => setSelectedLog(log)}
                      >
                        <Eye className="w-3.5 h-3.5 text-blue-600" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          {logsData && (logsData.next || logsData.previous || logsData.count > 0) && (
            <div className="flex items-center justify-between p-4 border-t border-gray-200">
              <div className="text-sm text-gray-700">
                Showing {((page - 1) * 20) + 1} to {Math.min(page * 20, logsData.count)} of {logsData.count} logs
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={!logsData.previous || isLoading}
                >
                  Previous
                </Button>
                <span className="text-sm font-medium px-2">Page {page}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!logsData.next || isLoading}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Log Details Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="p-6 pb-4 border-b">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-xl">Audit Log Details</DialogTitle>
              <Badge variant="secondary" className="font-mono">#{selectedLog?.id}</Badge>
            </div>
            <DialogDescription>
              View complete details of this system transaction
            </DialogDescription>
          </DialogHeader>

          {selectedLog && (
            <div className="flex-1 overflow-y-auto">
              {/* Top Meta Section */}
              <div className="grid grid-cols-2 gap-px bg-gray-200 dark:bg-gray-800 border-b">
                <div className="bg-white dark:bg-slate-950 p-6">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">User / Actor</h4>
                  <div className="flex items-center space-x-3">
                    <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-bold text-lg">
                      {selectedLog.user_name?.charAt(0) || "S"}
                    </div>
                    <div>
                      <div className="font-medium text-gray-900 dark:text-gray-100">{selectedLog.user_name}</div>
                      <div className="text-sm text-gray-500">{selectedLog.user_email}</div>
                    </div>
                  </div>
                </div>
                <div className="bg-white dark:bg-slate-950 p-6">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Action Info</h4>
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant={getActionVariant(selectedLog.action)} className="px-3 py-1 capitalize">
                      {selectedLog.action}
                    </Badge>
                    <span className="text-sm text-gray-500 font-mono">
                      {format(new Date(selectedLog.timestamp), "MMM dd, HH:mm:ss")}
                    </span>
                  </div>
                  <div className="text-sm text-gray-500 mt-2">
                    IP: <span className="font-mono text-gray-900 dark:text-gray-200">{selectedLog.ip_address || "N/A"}</span>
                  </div>
                </div>
              </div>

              <div className="p-6">
                {/* Entity Info */}
                <div className="mb-8">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center">
                    <span className="w-1 h-4 bg-blue-600 rounded-full mr-2"></span>
                    Affected Entity
                  </h4>
                  <div className="bg-gray-50 dark:bg-slate-900 rounded-lg p-4 border border-gray-200 dark:border-gray-800">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <span className="text-xs text-gray-500 block">Model</span>
                        <span className="font-medium capitalize">{selectedLog.model_name}</span>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500 block">Object ID</span>
                        <span className="font-mono text-sm">{selectedLog.object_id}</span>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500 block">Representation</span>
                        <span className="font-medium truncate block" title={selectedLog.object_repr}>
                          {selectedLog.object_repr}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Changes Table */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center">
                    <span className="w-1 h-4 bg-orange-500 rounded-full mr-2"></span>
                    Changes Log
                  </h4>
                  {selectedLog.changes && Object.keys(selectedLog.changes).length > 0 ? (
                    <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden shadow-sm">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-gray-50 dark:bg-slate-900">
                            <TableHead className="w-[25%]">Field Changed</TableHead>
                            <TableHead className="w-[37.5%] text-red-600/80">From (Old Value)</TableHead>
                            <TableHead className="w-[37.5%] text-green-600/80">To (New Value)</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {Object.entries(selectedLog.changes).map(([key, value]) => {
                            const castVal = value as any;
                            const oldValue = Array.isArray(castVal) && castVal.length === 2 ? castVal[0] : '-';
                            const newValue = Array.isArray(castVal) && castVal.length === 2 ? castVal[1] : value;

                            // Format values for better readability
                            const formatValue = (val: any) => {
                              if (val === null) return <span className="text-gray-400 italic">null</span>;
                              if (val === "") return <span className="text-gray-400 italic">empty</span>;
                              if (typeof val === 'boolean') return <span className={val ? "text-green-600 font-bold" : "text-red-500 font-bold"}>{String(val)}</span>;
                              if (typeof val === 'object') return <pre className="text-[10px] whitespace-pre-wrap">{JSON.stringify(val, null, 2)}</pre>;
                              return String(val);
                            }

                            return (
                              <TableRow key={key}>
                                <TableCell className="font-medium font-mono text-xs bg-gray-50/50 dark:bg-slate-900/30">
                                  {key.replace(/_/g, " ")}
                                </TableCell>
                                <TableCell className="font-mono text-xs break-all bg-red-50/30 dark:bg-red-900/10">
                                  {formatValue(oldValue)}
                                </TableCell>
                                <TableCell className="font-mono text-xs break-all bg-green-50/30 dark:bg-green-900/10">
                                  {formatValue(newValue)}
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center p-8 bg-gray-50 border border-dashed border-gray-300 rounded-lg text-gray-500">
                      No field changes recorded for this action.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
