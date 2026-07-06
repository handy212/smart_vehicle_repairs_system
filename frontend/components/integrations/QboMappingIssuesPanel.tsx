"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertTriangle, Database, RefreshCcw, Trash2 } from "lucide-react";
import { quickbooksApi, QboOutboundEntityType } from "@/lib/api/quickbooks";
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
import { useToast } from "@/lib/hooks/useToast";
import { getUserFacingError } from "@/lib/api/errors";

function statusVariant(status: string): "success" | "danger" | "secondary" {
  if (status === "synced") return "success";
  if (status === "failed") return "danger";
  return "secondary";
}

export function QboMappingIssuesPanel() {
  const [statusFilter, setStatusFilter] = useState("failed");
  const [retryingId, setRetryingId] = useState<number | null>(null);
  const [clearingId, setClearingId] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["qbo", "mappings", statusFilter],
    queryFn: () =>
      quickbooksApi.listMappings({
        limit: 100,
        ...(statusFilter ? { status: statusFilter } : {}),
      }),
    refetchInterval: 60_000,
  });

  const mappings = data?.results ?? [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["qbo", "mappings"] });
    queryClient.invalidateQueries({ queryKey: ["qbo", "sync-logs"] });
    queryClient.invalidateQueries({ queryKey: ["qbo", "status"] });
  };

  const handleRetry = async (entityType: string | null, objectId: number, rowId: number) => {
    if (!entityType) return;
    try {
      setRetryingId(rowId);
      const result = await quickbooksApi.syncOutbound({
        entity_type: entityType as QboOutboundEntityType,
        object_id: objectId,
        inline: true,
      });
      if (
        result &&
        typeof result === "object" &&
        "status" in result &&
        (result as { status?: string }).status === "failed"
      ) {
        const failed = result as { detail?: string; qbo_sync_error?: string };
        toast({
          title: "Sync failed",
          description: failed.qbo_sync_error || failed.detail || "QuickBooks rejected the sync.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Synced", description: "Record pushed to QuickBooks successfully." });
      }
      invalidate();
    } catch (error: unknown) {
      toast({
        title: "Sync failed",
        description: getUserFacingError(error, "Could not sync to QuickBooks."),
        variant: "destructive",
      });
    } finally {
      setRetryingId(null);
    }
  };

  const handleClear = async (entityType: string | null, objectId: number, rowId: number) => {
    if (!entityType) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm("Clear the QuickBooks link for this record? The next sync will create or re-match in QBO.")
    ) {
      return;
    }
    try {
      setClearingId(rowId);
      await quickbooksApi.clearMapping({
        entity_type: entityType as QboOutboundEntityType,
        object_id: objectId,
      });
      toast({ title: "Link cleared", description: "You can retry sync to re-link this record." });
      invalidate();
    } catch (error: unknown) {
      toast({
        title: "Clear failed",
        description: getUserFacingError(error, "Could not clear the QuickBooks link."),
        variant: "destructive",
      });
    } finally {
      setClearingId(null);
    }
  };

  return (
    <Card className="border shadow-sm">
      <CardHeader className="py-3 px-4 border-b bg-muted/30">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            Per-record sync status
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="failed">Failed</option>
              <option value="pending">Pending</option>
              <option value="synced">Synced</option>
              <option value="">All</option>
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
          One row per SVR record linked to QuickBooks. The error column shows exactly why a record is not synced.
        </p>
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading mappings…</div>
        ) : mappings.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">
            No {statusFilter || "mapping"} records found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Entity</TableHead>
                  <TableHead className="text-xs">Record</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">QBO ID</TableHead>
                  <TableHead className="text-xs">Last attempt</TableHead>
                  <TableHead className="text-xs min-w-[280px]">Error</TableHead>
                  <TableHead className="text-xs text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mappings.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-xs align-top">{row.entity_type_display}</TableCell>
                    <TableCell className="text-xs align-top">
                      <div className="font-medium">{row.object_label}</div>
                      <div className="text-muted-foreground">ID {row.object_id}</div>
                      {!row.object_exists ? (
                        <div className="text-destructive text-[11px]">Local record deleted</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-xs align-top">
                      <Badge variant={statusVariant(row.status)} className="text-[10px] capitalize">
                        {row.status_display}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs align-top font-mono">
                      {row.qbo_id || "—"}
                    </TableCell>
                    <TableCell className="text-xs align-top whitespace-nowrap">
                      {format(new Date(row.last_synced_at), "MMM d, h:mm a")}
                    </TableCell>
                    <TableCell className="text-xs align-top">
                      {row.error_message ? (
                        <pre className="whitespace-pre-wrap font-sans text-destructive leading-relaxed max-w-xl">
                          {row.error_message}
                        </pre>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs align-top text-right">
                      <div className="flex justify-end gap-1">
                        {row.entity_type && row.object_exists ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            disabled={retryingId === row.id || clearingId === row.id}
                            onClick={() => handleRetry(row.entity_type, row.object_id, row.id)}
                          >
                            <Database
                              className={`h-3.5 w-3.5 mr-1 ${retryingId === row.id ? "animate-spin" : ""}`}
                            />
                            Retry
                          </Button>
                        ) : null}
                        {row.entity_type ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            disabled={retryingId === row.id || clearingId === row.id}
                            onClick={() => handleClear(row.entity_type, row.object_id, row.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1" />
                            Clear
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
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
