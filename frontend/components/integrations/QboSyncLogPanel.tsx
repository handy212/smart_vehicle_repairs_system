"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { History, RefreshCcw } from "lucide-react";
import { quickbooksApi } from "@/lib/api/quickbooks";
import { useQuickBooksConnection } from "@/hooks/useQuickBooksConnection";
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

export function QboSyncLogPanel() {
  const { isConnected } = useQuickBooksConnection();

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["qbo", "sync-logs"],
    queryFn: () => quickbooksApi.listSyncLogs({ limit: 25 }),
    enabled: isConnected,
    refetchInterval: 60000,
  });

  if (!isConnected) {
    return null;
  }

  const logs = data?.results ?? [];

  return (
    <Card className="border shadow-sm">
      <CardHeader className="py-3 px-4 border-b bg-muted/30">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <History className="w-4 h-4 text-primary" />
            QuickBooks Sync History
          </CardTitle>
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
      </CardHeader>
      <CardContent className="p-0">
        <p className="px-4 py-3 text-xs text-muted-foreground border-b">
          Recent inbound pulls from QuickBooks. Use this to confirm vendor, invoice, and bill sync runs.
        </p>
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading sync history...</div>
        ) : logs.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No sync runs recorded yet.</div>
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
                  <TableHead className="text-xs">Triggered by</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {format(new Date(log.started_at), "MMM d, yyyy h:mm a")}
                    </TableCell>
                    <TableCell className="text-xs">{log.entity_type_display}</TableCell>
                    <TableCell className="text-xs capitalize">{log.direction}</TableCell>
                    <TableCell className="text-xs">
                      <Badge variant={statusVariant(log.status)} className="text-[10px] capitalize">
                        {log.status_display}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-right">{log.records_pulled}</TableCell>
                    <TableCell className="text-xs text-right">{log.records_updated}</TableCell>
                    <TableCell className="text-xs">{log.triggered_by_name || "Scheduled"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
