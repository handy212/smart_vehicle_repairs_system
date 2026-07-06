"use client";

import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertCircle, History, RefreshCcw } from "lucide-react";
import { quickbooksApi } from "@/lib/api/quickbooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function statusVariant(status: string): "success" | "danger" | "secondary" {
  if (status === "success") return "success";
  if (status === "failed") return "danger";
  return "secondary";
}

export interface QboSyncLogPanelProps {
  /** Show logs even when QBO is disconnected (admin integrations). */
  alwaysShow?: boolean;
}

export function QboSyncLogPanel({ alwaysShow = false }: QboSyncLogPanelProps) {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [directionFilter, setDirectionFilter] = useState<string>("");

  const { data: status } = useQuery({
    queryKey: ["qbo", "status"],
    queryFn: () => quickbooksApi.getStatus(),
    staleTime: 60_000,
  });

  const isConnected = status?.is_connected ?? false;
  const enabled = alwaysShow || isConnected;

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["qbo", "sync-logs", statusFilter, directionFilter],
    queryFn: () =>
      quickbooksApi.listSyncLogs({
        limit: 50,
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(directionFilter ? { direction: directionFilter } : {}),
      }),
    enabled,
    refetchInterval: 60_000,
  });

  if (!enabled) {
    return null;
  }

  const logs = data?.results ?? [];

  return (
    <Card className="border shadow-sm">
      <CardHeader className="py-3 px-4 border-b bg-muted/30">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <History className="w-4 h-4 text-primary" />
            Sync run history
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All statuses</option>
              <option value="failed">Failed only</option>
              <option value="success">Success only</option>
              <option value="running">Running</option>
            </select>
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              value={directionFilter}
              onChange={(e) => setDirectionFilter(e.target.value)}
            >
              <option value="">All directions</option>
              <option value="outbound">Outbound</option>
              <option value="inbound">Inbound</option>
            </select>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCcw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <p className="px-4 py-3 text-xs text-muted-foreground border-b">
          Each row is one sync job (scheduled or manual). Failed rows include the full QuickBooks error below the table cells.
        </p>
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading sync history…</div>
        ) : logs.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No sync runs match your filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">When</TableHead>
                  <TableHead className="text-xs">Entity</TableHead>
                  <TableHead className="text-xs">Direction</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs text-right">Pulled</TableHead>
                  <TableHead className="text-xs text-right">Updated</TableHead>
                  <TableHead className="text-xs">Duration</TableHead>
                  <TableHead className="text-xs">Triggered by</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <Fragment key={log.id}>
                    <TableRow>
                      <TableCell className="text-xs whitespace-nowrap align-top">
                        {format(new Date(log.started_at), "MMM d, yyyy h:mm a")}
                      </TableCell>
                      <TableCell className="text-xs align-top">{log.entity_type_display}</TableCell>
                      <TableCell className="text-xs capitalize align-top">{log.direction}</TableCell>
                      <TableCell className="text-xs align-top">
                        <Badge variant={statusVariant(log.status)} className="text-[10px] capitalize">
                          {log.status_display}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-right align-top">{log.records_pulled}</TableCell>
                      <TableCell className="text-xs text-right align-top">{log.records_updated}</TableCell>
                      <TableCell className="text-xs align-top">
                        {log.duration_seconds != null ? `${log.duration_seconds}s` : "—"}
                      </TableCell>
                      <TableCell className="text-xs align-top">
                        {log.triggered_by_name || "Scheduled"}
                      </TableCell>
                    </TableRow>
                    {log.status === "failed" && log.error_message ? (
                      <TableRow key={`${log.id}-err`} className="bg-destructive/5 hover:bg-destructive/5">
                        <TableCell colSpan={8} className="py-2 px-4">
                          <div className="flex gap-2 text-xs text-destructive">
                            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                            <pre className="whitespace-pre-wrap font-sans leading-relaxed">
                              {log.error_message}
                            </pre>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
