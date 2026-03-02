"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, AuditLog } from "@/lib/api/admin";
import { useToast } from "@/lib/hooks/useToast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ArrowLeft, Search, Filter, Eye, RotateCcw, Download, Archive, Settings } from "lucide-react";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PermissionGuard } from "@/components/auth/PermissionGuard";

const ACTION_CHOICES = [
  { value: "create", label: "Create" },
  { value: "update", label: "Update" },
  { value: "delete", label: "Delete" },
];

export default function AuditLogPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [archiveDays, setArchiveDays] = useState(90);
  const [isDownloading, setIsDownloading] = useState(false);

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

  const archiveMutation = useMutation({
    mutationFn: (days: number) => adminApi.auditLogs.archive(days),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "audit-logs"] });
      toast({
        title: "Success",
        description: data.message,
      });
      setShowArchiveDialog(false);
    },

    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to archive logs",
        variant: "destructive",
      });
    },
  });

  const handleDownload = async (format: 'csv' | 'json') => {
    setIsDownloading(true);
    try {
      const blob = await adminApi.auditLogs.download({
        format,
        action: actionFilter !== "all" ? actionFilter : undefined,
        search: searchTerm || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });

      // Verify blob is valid
      if (!blob || blob.size === 0) {
        throw new Error("Received empty file");
      }

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit_logs_${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Success",
        description: `Audit logs downloaded as ${format.toUpperCase()}`,
      });

    } catch (error: any) {
      const errorMessage = error?.message || error?.response?.data?.error || error?.response?.data?.detail || "Failed to download logs";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
      console.error("Download error:", error);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleArchive = () => {
    if (archiveDays < 1) {
      toast({
        title: "Error",
        description: "Days must be at least 1",
        variant: "destructive",
      });
      return;
    }
    archiveMutation.mutate(archiveDays);
  };

  return (
    <PermissionGuard permission="view_audit_logs">
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
              <h1 className="text-3xl font-bold text-foreground">Audit Log</h1>
            </div>
          </div>
        </div>


        {/* Statistics */}
        {statsData && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 flex flex-col justify-center">
                <div className="text-xl font-bold">{statsData.total}</div>
                <p className="text-xs text-muted-foreground">Total Logs</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex flex-col justify-center">
                <div className="text-xl font-bold">{statsData.by_action.length}</div>
                <p className="text-xs text-muted-foreground">Action Types</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex flex-col justify-center">
                <div className="text-xl font-bold">{statsData.top_users.length}</div>
                <p className="text-xs text-muted-foreground">Active Users</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex flex-col justify-center">
                <div className="text-xl font-bold">{statsData.top_models.length}</div>
                <p className="text-xs text-muted-foreground">Models Tracked</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Actions Bar */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownload('csv')}
                  disabled={isDownloading}
                  className="h-8 text-xs"
                >
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  Download CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownload('json')}
                  disabled={isDownloading}
                  className="h-8 text-xs"
                >
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  Download JSON
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowArchiveDialog(true)}
                  className="h-8 text-xs"
                >
                  <Archive className="w-3.5 h-3.5 mr-1.5" />
                  Archive Logs
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Search</label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-muted-foreground w-3.5 h-3.5" />
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
                <label className="block text-xs font-medium text-foreground mb-1">Action</label>
                <select
                  value={actionFilter}
                  onChange={(e) => {
                    setActionFilter(e.target.value);
                    setPage(1);
                  }}
                  className="w-full px-2 py-1 h-8 text-sm border border-border rounded-md focus:ring-2 focus:ring-primary focus:border-primary bg-background border-border"
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
                <label className="block text-xs font-medium text-foreground mb-1">From</label>
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
                <label className="block text-xs font-medium text-foreground mb-1">To</label>
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
                <TableRow className="bg-muted/50 hover:bg-muted/50">
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
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
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
                    <TableRow key={log.id} className="hover:bg-muted/50">
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
                          <Eye className="w-3.5 h-3.5 text-primary" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            {/* Pagination */}
            {logsData && (logsData.next || logsData.previous || logsData.count > 0) && (
              <div className="flex items-center justify-between p-4 border-t border-border">
                <div className="text-sm text-foreground">
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

            </DialogHeader>

            {selectedLog && (
              <div className="flex-1 overflow-y-auto">
              {/* // Top Meta Section */}
                <div className="grid grid-cols-2 gap-px bg-muted border-b">
                  <div className="bg-card bg-background p-6">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">User / Actor</h4>
                    <div className="flex items-center space-x-3">
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-bold text-lg">
                        {selectedLog.user_name?.charAt(0) || "S"}
                      </div>
                      <div>
                        <div className="font-medium text-foreground">{selectedLog.user_name}</div>
                        <div className="text-sm text-muted-foreground">{selectedLog.user_email}</div>
                      </div>
                    </div>
                  </div>
                  <div className="bg-card bg-background p-6">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Action Info</h4>
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant={getActionVariant(selectedLog.action)} className="px-3 py-1 capitalize">
                        {selectedLog.action}
                      </Badge>
                      <span className="text-sm text-muted-foreground font-mono">
                        {format(new Date(selectedLog.timestamp), "MMM dd, HH:mm:ss")}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground mt-2">
                      IP: <span className="font-mono text-foreground">{selectedLog.ip_address || "N/A"}</span>
                    </div>
                  </div>
                </div>

                <div className="p-6">
                {/* // Entity Info */}
                  <div className="mb-8">
                    <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center">
                      <span className="w-1 h-4 bg-primary rounded-full mr-2"></span>
                      Affected Entity
                    </h4>
                    <div className="bg-muted bg-background rounded-lg p-4 border border-border">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <span className="text-xs text-muted-foreground block">Model</span>
                          <span className="font-medium capitalize">{selectedLog.model_name}</span>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground block">Object ID</span>
                          <span className="font-mono text-sm">{selectedLog.object_id}</span>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground block">Representation</span>
                          <span className="font-medium truncate block" title={selectedLog.object_repr}>
                            {selectedLog.object_repr}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                {/* // Changes Table */}
                  <div>
                    <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center">
                      <span className="w-1 h-4 bg-primary rounded-full mr-2"></span>
                      Changes Log
                    </h4>
                    {selectedLog.changes && Object.keys(selectedLog.changes).length > 0 ? (
                      <div className="border border-border rounded-lg overflow-hidden shadow-sm">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted bg-background">
                              <TableHead className="w-[25%]">Field Changed</TableHead>
                              <TableHead className="w-[37.5%] text-red-600/80">From (Old Value)</TableHead>
                              <TableHead className="w-[37.5%] text-success/80">To (New Value)</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {Object.entries(selectedLog.changes).map(([key, value]) => {

                              const castVal = value as any;
                              const oldValue = Array.isArray(castVal) && castVal.length === 2 ? castVal[0] : '-';
                              const newValue = Array.isArray(castVal) && castVal.length === 2 ? castVal[1] : value;

                              // Format values for better readability

                              const formatValue = (val: any) => {
                                if (val === null) return <span className="text-muted-foreground italic">null</span>;
                                if (val === "") return <span className="text-muted-foreground italic">empty</span>;
                                if (typeof val === 'boolean') return <span className={val ? "text-success font-bold" : "text-red-500 font-bold"}>{String(val)}</span>;
                                if (typeof val === 'object') return <pre className="text-[10px] whitespace-pre-wrap">{JSON.stringify(val, null, 2)}</pre>;
                                return String(val);
                              }

                              return (
                                <TableRow key={key}>
                                  <TableCell className="font-medium font-mono text-xs bg-muted/50 bg-background/30">
                                    {key.replace(/_/g, " ")}
                                  </TableCell>
                                  <TableCell className="font-mono text-xs break-all bg-red-50/30 dark:bg-red-900/10">
                                    {formatValue(oldValue)}
                                  </TableCell>
                                  <TableCell className="font-mono text-xs break-all bg-success/10/30 dark:bg-green-900/10">
                                    {formatValue(newValue)}
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center p-8 bg-muted border border-dashed border-border rounded-lg text-muted-foreground">
                        No field changes recorded for this action.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Archive Dialog */}
        <Dialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Archive className="w-5 h-5 text-primary" />
                Archive Audit Logs
              </DialogTitle>
              <DialogDescription className="pt-2">
                Archive logs older than the specified number of days. This will permanently delete logs older than the cutoff date.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Archive logs older than (days)
                </label>
                <Input
                  type="number"
                  min="1"
                  value={archiveDays}
                  onChange={(e) => setArchiveDays(parseInt(e.target.value) || 90)}
                  className="h-9"
                  placeholder="90"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Logs older than {archiveDays} days will be permanently deleted.
                </p>
              </div>
              <div className="bg-warning/10 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                <p className="text-xs text-yellow-800 dark:text-yellow-200">
                  <strong>Warning:</strong> This action cannot be undone. Make sure to download logs before archiving if you need to keep a record.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowArchiveDialog(false)}
                disabled={archiveMutation.isPending}
                className="h-8 text-xs"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleArchive}
                disabled={archiveMutation.isPending}
                className="h-8 text-xs bg-primary hover:bg-orange-700"
              >
                {archiveMutation.isPending ? "Archiving..." : "Archive Logs"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PermissionGuard>

  );
}
