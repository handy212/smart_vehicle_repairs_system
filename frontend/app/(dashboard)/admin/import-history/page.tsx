"use client";

import { useQuery } from "@tanstack/react-query";
import { auditLogsApi, AuditLog } from "@/lib/api/audit-logs";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Search, Download, RefreshCw, FileText, CheckCircle2, AlertOctagon, XCircle } from "lucide-react";
import { useState } from "react";
import { exportToCSV } from "@/lib/utils/export";
import { useToast } from "@/lib/hooks/useToast";
import { Label } from "@/components/ui/label";
import { PermissionGuard } from "@/components/auth/PermissionGuard";

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
        return "secondary";
      case "Part":
        return "outline";
      default:
        return "secondary";
    }
  };

  const getStatusBadge = (log: AuditLog) => {
    const changes = log.changes || {};
    if (changes.error) {
      return (
        <Badge variant="danger" className="h-5 px-1.5 gap-1">
          <AlertOctagon className="w-3 h-3" /> Failed
        </Badge>
      );
    }
    if (changes.imported > 0) {
      return (
        <Badge variant="success" className="h-5 px-1.5 gap-1">
          <CheckCircle2 className="w-3 h-3" /> Success
        </Badge>
      );
    }
    return <Badge variant="secondary" className="h-5 px-1.5">No imports</Badge>;
  };

  return (
    <PermissionGuard permission="view_audit_logs">
      <div className="space-y-4 bg-background min-h-screen">
        <div className="flex items-center justify-between px-4 pt-4">
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">Import History</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Track bulk data import operations</p>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="ghost" size="sm" onClick={() => refetch()} className="h-8 w-8 p-0" title="Refresh">
              <RefreshCw className="w-4 h-4 text-muted-foreground" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={!data?.results || data.results.length === 0} className="h-8 text-xs bg-card">
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card className="mx-4 border-none shadow-sm bg-muted/50">
          <CardContent className="p-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Model</Label>
                <Select
                  value={modelFilter}
                  onValueChange={(val) => {
                    setModelFilter(val);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="h-8 w-[140px] text-xs bg-card">
                    <SelectValue placeholder="All Models" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Models</SelectItem>
                    <SelectItem value="Customer">Customers</SelectItem>
                    <SelectItem value="Vehicle">Vehicles</SelectItem>
                    <SelectItem value="Part">Parts</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Start Date</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setPage(1);
                  }}
                  className="h-8 w-[140px] text-xs bg-card"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">End Date</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setPage(1);
                  }}
                  className="h-8 w-[140px] text-xs bg-card"
                />
              </div>

              {(modelFilter || startDate || endDate) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setModelFilter("");
                    setStartDate("");
                    setEndDate("");
                    setSearch("");
                    setPage(1);
                  }}
                  className="h-8 text-xs text-muted-foreground hover:text-foreground"
                >
                  <XCircle className="w-3.5 h-3.5 mr-1" />
                  Clear
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Import History Table */}
        <div className="px-4 pb-8">
          <Card className="border border-border shadow-sm overflow-hidden">
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-8">
                  <TableSkeleton />
                </div>
              ) : !data?.results || data.results.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-12 h-12 bg-border rounded-full flex items-center justify-center mb-3">
                    <FileText className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-foreground">No import history found</p>
                  <p className="text-xs text-muted-foreground mt-1">Try adjusting your filters</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-muted/80">
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="h-9 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[180px]">Date & Time</TableHead>
                          <TableHead className="h-9 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">User</TableHead>
                          <TableHead className="h-9 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Model</TableHead>
                          <TableHead className="h-9 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">File</TableHead>
                          <TableHead className="h-9 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</TableHead>
                          <TableHead className="h-9 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Imported</TableHead>
                          <TableHead className="h-9 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Skipped</TableHead>
                          <TableHead className="h-9 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Errors</TableHead>
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
                            <TableRow key={log.id} className="hover:bg-muted/50 transition-colors">
                              <TableCell className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                                {format(new Date(log.timestamp), "MMM d, yyyy h:mm a")}
                              </TableCell>
                              <TableCell className="px-4 py-2.5 text-xs text-card-foreground font-medium">
                                {log.user_name || log.user_email || "Unknown"}
                              </TableCell>
                              <TableCell className="px-4 py-2.5">

                                <Badge variant={getModelBadgeVariant(log.model_name) as any} className="text-[10px] h-5 px-2 font-medium border-border">
                                  {log.model_name || "N/A"}
                                </Badge>
                              </TableCell>
                              <TableCell className="px-4 py-2.5">
                                <div className="flex items-center gap-1.5 max-w-[200px]" title={filename}>
                                  <FileText className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                                  <span className="text-xs text-muted-foreground truncate">{filename}</span>
                                </div>
                              </TableCell>
                              <TableCell className="px-4 py-2.5">
                                {getStatusBadge(log)}
                              </TableCell>
                              <TableCell className="px-4 py-2.5 text-right">
                                <span className={`text-xs font-mono font-medium ${imported > 0 ? 'text-success' : 'text-muted-foreground'}`}>
                                  {imported}
                                </span>
                              </TableCell>
                              <TableCell className="px-4 py-2.5 text-right">
                                <span className={`text-xs font-mono font-medium ${skipped > 0 ? 'text-yellow-600' : 'text-muted-foreground'}`}>
                                  {skipped}
                                </span>
                              </TableCell>
                              <TableCell className="px-4 py-2.5 text-right">
                                <span className={`text-xs font-mono font-medium ${errorCount > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                                  {errorCount}
                                </span>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  // Pagination
                  {data.count > 0 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/50">
                      <p className="text-xs text-muted-foreground">
                        Showing <span className="font-medium text-foreground">{((page - 1) * 20) + 1}</span> to <span className="font-medium text-foreground">{Math.min(page * 20, data.count)}</span> of <span className="font-medium text-foreground">{data.count}</span> results
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          disabled={!data.previous}
                          className="h-7 text-xs bg-card"
                        >
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPage((p) => p + 1)}
                          disabled={!data.next}
                          className="h-7 text-xs bg-card"
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
      </div>
    </PermissionGuard>
  );
}
