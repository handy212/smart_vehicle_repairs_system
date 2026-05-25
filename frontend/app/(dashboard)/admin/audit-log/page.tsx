"use client";

import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api/admin";
import { auditLogsApi, type AuditLog, type AuditLogStats } from "@/lib/api/audit-logs";
import { useToast } from "@/lib/hooks/useToast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Search, Eye, RotateCcw, Download } from "lucide-react";
import Link from "next/link";
import { useState, useCallback, useRef } from "react";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PermissionPageGuard } from "@/components/auth/PermissionPageGuard";

const ACTION_CHOICES = [
  { value: "create", label: "Create" },
  { value: "update", label: "Update" },
  { value: "delete", label: "Delete" },
];

function getActorInitial(userName?: string, userEmail?: string): string {
  const name = (userName || "").trim();
  if (name && name.toLowerCase() !== "system") {
    return name[0].toUpperCase();
  }
  const email = (userEmail || "").trim();
  if (email && email !== "system@system.local") {
    return email[0].toUpperCase();
  }
  return "S";
}

function entityLabel(log: AuditLog): string {
  return log.model_label || log.model_name || "Record";
}

export default function AuditLogPage() {
  const { toast } = useToast();

  const [actionFilter, setActionFilter] = useState<string>("all");
  const [modelFilter, setModelFilter] = useState<string>("all");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const listParams = {
    page,
    action: actionFilter !== "all" ? actionFilter : undefined,
    model_name: modelFilter !== "all" ? modelFilter : undefined,
    user: userFilter !== "all" ? Number(userFilter) : undefined,
    search: debouncedSearch || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  };

  const statsParams = {
    action: listParams.action,
    model_name: listParams.model_name,
    user: listParams.user,
    search: listParams.search,
    date_from: listParams.date_from,
    date_to: listParams.date_to,
  };

  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 300);
  }, []);

  const { data: filterOptions } = useQuery({
    queryKey: ["admin", "audit-logs", "filter_options"],
    queryFn: () => auditLogsApi.filterOptions(),
  });

  const {
    data: logsData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: [
      "admin",
      "audit-logs",
      actionFilter,
      modelFilter,
      userFilter,
      debouncedSearch,
      dateFrom,
      dateTo,
      page,
    ],
    queryFn: () => adminApi.auditLogs.list(listParams),
  });

  const { data: statsData } = useQuery<AuditLogStats>({
    queryKey: [
      "admin",
      "audit-logs",
      "stats",
      actionFilter,
      modelFilter,
      userFilter,
      debouncedSearch,
      dateFrom,
      dateTo,
    ],
    queryFn: () => adminApi.auditLogs.stats(statsParams),
  });

  const getActionVariant = (action: string) => {
    switch (action) {
      case "create":
        return "success";
      case "update":
        return "info";
      case "delete":
        return "danger";
      default:
        return "default";
    }
  };

  const logs = logsData?.results || [];

  const handleClearFilters = () => {
    setActionFilter("all");
    setModelFilter("all");
    setUserFilter("all");
    setSearchTerm("");
    setDebouncedSearch("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };

  const handleExport = async (fileFormat: "xlsx" | "json") => {
    setIsDownloading(true);
    try {
      const blob = await adminApi.auditLogs.download({
        format: fileFormat,
        action: listParams.action,
        model_name: listParams.model_name,
        user: listParams.user,
        search: debouncedSearch || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });

      if (!blob || blob.size === 0) {
        throw new Error("Received empty file");
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit_logs_${new Date().toISOString().split("T")[0]}.${fileFormat === "xlsx" ? "xlsx" : "json"}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Success",
        description: `Audit logs exported as ${fileFormat === "xlsx" ? "Excel" : "JSON"}`,
      });
    } catch (err: unknown) {
      const errorMessage =
        (err as Error)?.message ||
        (err as { response?: { data?: { error?: string; detail?: string } } })?.response?.data?.error ||
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Failed to download logs";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const topUser = statsData?.top_users?.[0];
  const topModel = statsData?.top_models?.[0];
  const actionCounts: AuditLogStats["by_action"] = statsData?.by_action ?? [];

  return (
    <PermissionPageGuard permission="view_audit_logs">
      <div className="space-y-6">
        <div className="flex items-center space-x-4">
          <Link href="/admin">
            <Button variant="secondary">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Audit Log</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Application-wide change history (users, inventory, billing, HR, and more).
              Accounting journal controls are logged separately under{" "}
              <Link href="/accounting/controls" className="text-primary hover:underline">
                Accounting → Controls
              </Link>
              .
            </p>
          </div>
        </div>

        {statsData && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 flex flex-col justify-center">
                <div className="text-xl font-bold">{statsData.total}</div>
                <p className="text-xs text-muted-foreground">Events (filtered)</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex flex-col justify-center gap-2">
                <p className="text-xs text-muted-foreground">By action</p>
                <div className="flex flex-wrap gap-1.5">
                  {actionCounts.length === 0 ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : (
                    actionCounts.map((item) => (
                      <Badge key={item.action} variant={getActionVariant(item.action)} className="text-[10px]">
                        {item.action} {item.count}
                      </Badge>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex flex-col justify-center">
                <div className="text-xl font-bold truncate" title={topUser?.user_name}>
                  {topUser ? topUser.count : "—"}
                </div>
                <p className="text-xs text-muted-foreground truncate" title={topUser?.user_email}>
                  {topUser ? `Top user: ${topUser.user_name}` : "Top user"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex flex-col justify-center">
                <div className="text-xl font-bold">{topModel ? topModel.count : "—"}</div>
                <p className="text-xs text-muted-foreground truncate" title={topModel?.model_label}>
                  {topModel ? `Top type: ${topModel.model_label}` : "Top entity type"}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
              <div className="sm:col-span-2 lg:col-span-2">
                <label className="block text-xs font-medium text-foreground mb-1">Search</label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-muted-foreground w-3.5 h-3.5" />
                  <Input
                    placeholder="User, entity, IP..."
                    value={searchTerm}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="pl-8 h-8 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Action</label>
                <Select
                  value={actionFilter}
                  onValueChange={(v) => {
                    setActionFilter(v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="All actions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {ACTION_CHOICES.map((action) => (
                      <SelectItem key={action.value} value={action.value}>
                        {action.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Entity type</label>
                <Select
                  value={modelFilter}
                  onValueChange={(v) => {
                    setModelFilter(v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    {(filterOptions?.models ?? []).map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">User</label>
                <Select
                  value={userFilter}
                  onValueChange={(v) => {
                    setUserFilter(v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="All users" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All users</SelectItem>
                    {(filterOptions?.users ?? []).map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 pt-1 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport("xlsx")}
                disabled={isDownloading}
                className="h-8 text-xs"
              >
                <Download className="w-3 h-3 mr-1.5" />
                Excel
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport("json")}
                disabled={isDownloading}
                className="h-8 text-xs"
              >
                <Download className="w-3 h-3 mr-1.5" />
                JSON
              </Button>
              <Button variant="outline" size="sm" onClick={handleClearFilters} className="h-8 text-xs">
                <RotateCcw className="w-3 h-3 mr-1.5" />
                Reset
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-base">Audit Logs ({logsData?.count ?? 0})</CardTitle>
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
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                      </div>
                    </TableCell>
                  </TableRow>
                ) : isError ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <p className="text-sm text-destructive mb-2">
                        {(error as Error)?.message || "Failed to load audit logs"}
                      </p>
                      <Button variant="outline" size="sm" onClick={() => refetch()}>
                        Retry
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                      No logs match your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((log) => (
                    <TableRow key={log.id} className="hover:bg-muted/50">
                      <TableCell className="whitespace-nowrap py-2 text-xs text-muted-foreground">
                        {format(new Date(log.timestamp), "MMM dd yyyy, HH:mm")}
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="flex flex-col max-w-[200px]">
                          <span className="font-medium text-sm truncate" title={log.user_name || "Unknown"}>
                            {log.user_name || "Unknown"}
                          </span>
                          {log.user_email && log.user_email !== "system@system.local" && (
                            <span className="text-xs text-muted-foreground truncate" title={log.user_email}>
                              {log.user_email}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-2">
                        <Badge
                          variant={getActionVariant(log.action)}
                          className="px-1.5 py-0 text-[10px] uppercase tracking-wide"
                        >
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="flex flex-col text-xs max-w-[250px]">
                          <span className="font-medium">{entityLabel(log)}</span>
                          <span className="text-muted-foreground truncate" title={log.object_repr}>
                            {log.object_repr || log.object_id}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs py-2 text-muted-foreground">
                        {log.ip_address || "-"}
                      </TableCell>
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

            {logsData && (logsData.next || logsData.previous || logsData.count > 0) && (
              <div className="flex items-center justify-between p-4 border-t border-border">
                <div className="text-sm text-foreground">
                  Showing {(page - 1) * 20 + 1} to {Math.min(page * 20, logsData.count)} of {logsData.count}{" "}
                  logs
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

        <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
          <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
            <DialogHeader className="p-6 pb-4 border-b">
              <div className="flex items-center justify-between">
                <DialogTitle className="text-xl">Audit Log Details</DialogTitle>
                <Badge variant="secondary" className="font-mono">
                  #{selectedLog?.id}
                </Badge>
              </div>
            </DialogHeader>

            {selectedLog && (
              <div className="flex-1 overflow-y-auto">
                <div className="grid grid-cols-2 gap-px bg-muted border-b">
                  <div className="bg-card p-6">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      User / Actor
                    </h4>
                    <div className="flex items-center space-x-3">
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-bold text-lg">
                        {getActorInitial(selectedLog.user_name, selectedLog.user_email)}
                      </div>
                      <div>
                        <div className="font-medium text-foreground">{selectedLog.user_name || "System"}</div>
                        <div className="text-sm text-muted-foreground">{selectedLog.user_email}</div>
                      </div>
                    </div>
                  </div>
                  <div className="bg-card p-6">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      Action Info
                    </h4>
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant={getActionVariant(selectedLog.action)} className="px-3 py-1 capitalize">
                        {selectedLog.action}
                      </Badge>
                      <span className="text-sm text-muted-foreground font-mono">
                        {format(new Date(selectedLog.timestamp), "MMM dd yyyy, HH:mm:ss")}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground mt-2">
                      IP:{" "}
                      <span className="font-mono text-foreground">{selectedLog.ip_address || "N/A"}</span>
                    </div>
                  </div>
                </div>

                <div className="p-6">
                  <div className="mb-8">
                    <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center">
                      <span className="w-1 h-4 bg-primary rounded-full mr-2" />
                      Affected Entity
                    </h4>
                    <div className="bg-muted rounded-lg p-4 border border-border">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <span className="text-xs text-muted-foreground block">Type</span>
                          <span className="font-medium">{entityLabel(selectedLog)}</span>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground block">Object ID</span>
                          <span className="font-mono text-sm">{selectedLog.object_id}</span>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground block">Description</span>
                          <span className="font-medium truncate block" title={selectedLog.object_repr}>
                            {selectedLog.object_repr}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center">
                      <span className="w-1 h-4 bg-primary rounded-full mr-2" />
                      Field Changes
                    </h4>
                    {selectedLog.changes && Object.keys(selectedLog.changes).length > 0 ? (
                      <div className="border border-border rounded-lg overflow-hidden shadow-sm">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted">
                              <TableHead className="w-[25%]">Field</TableHead>
                              <TableHead className="w-[37.5%]">Previous</TableHead>
                              <TableHead className="w-[37.5%]">New</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {Object.entries(selectedLog.changes).map(([key, value]) => {
                              const castVal = value as unknown;
                              const oldValue =
                                Array.isArray(castVal) && castVal.length === 2 ? castVal[0] : "-";
                              const newValue =
                                Array.isArray(castVal) && castVal.length === 2 ? castVal[1] : value;

                              const formatValue = (val: unknown) => {
                                if (val === null)
                                  return <span className="text-muted-foreground italic">null</span>;
                                if (val === "")
                                  return <span className="text-muted-foreground italic">empty</span>;
                                if (typeof val === "boolean")
                                  return (
                                    <span className={val ? "text-success font-bold" : "text-destructive font-bold"}>
                                      {String(val)}
                                    </span>
                                  );
                                if (typeof val === "object")
                                  return (
                                    <pre className="text-[10px] whitespace-pre-wrap">
                                      {JSON.stringify(val, null, 2)}
                                    </pre>
                                  );
                                return String(val);
                              };

                              return (
                                <TableRow key={key}>
                                  <TableCell className="font-medium font-mono text-xs bg-muted/50">
                                    {key.replace(/_/g, " ")}
                                  </TableCell>
                                  <TableCell className="font-mono text-xs break-all">{formatValue(oldValue)}</TableCell>
                                  <TableCell className="font-mono text-xs break-all">{formatValue(newValue)}</TableCell>
                                </TableRow>
                              );
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

      </div>
    </PermissionPageGuard>
  );
}
