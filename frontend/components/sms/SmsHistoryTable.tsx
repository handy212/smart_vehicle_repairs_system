"use client";

import { useMemo, useState } from "react";
import {
  Eye,
  History,
  Loader2,
  MoreVertical,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  TABLE_CELL_CLASS,
  TABLE_HEAD_CLASS,
  WORKSHOP_PANEL_CLASS,
} from "@/lib/constants/table-typography";
import { cn } from "@/lib/utils/cn";
import type { SMSHistoryItem } from "@/services/sms";
import {
  formatSmsDate,
  formatSmsTime,
  normalizeSmsStatus,
  SmsStatusBadge,
  type SmsStatusFilter,
} from "./sms-status";

interface SmsHistoryTableProps {
  rows?: SMSHistoryItem[];
  isLoading?: boolean;
  statusFilter: SmsStatusFilter;
  onStatusFilterChange: (filter: SmsStatusFilter) => void;
  onViewFullLogs: () => void;
  onResend: (row: SMSHistoryItem) => void;
  onView: (row: SMSHistoryItem) => void;
  onDelete: (row: SMSHistoryItem) => void;
  isMutating?: boolean;
  dense?: boolean;
  showToolbar?: boolean;
  className?: string;
}

const FILTER_CHIPS: { key: SmsStatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "sent", label: "Sent" },
  { key: "scheduled", label: "Scheduled" },
  { key: "failed", label: "Failed" },
];

export function SmsHistoryTable({
  rows,
  isLoading,
  statusFilter,
  onStatusFilterChange,
  onViewFullLogs,
  onResend,
  onView,
  onDelete,
  isMutating,
  dense = false,
  showToolbar = true,
  className,
}: SmsHistoryTableProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const list = rows ?? [];
    const q = search.trim().toLowerCase();
    return list.filter((row) => {
      if (statusFilter !== "all") {
        const key = normalizeSmsStatus(row.status);
        if (key !== statusFilter) return false;
      }
      if (!q) return true;
      return (
        row.recipient_name?.toLowerCase().includes(q) ||
        row.recipient_phone?.toLowerCase().includes(q) ||
        row.message?.toLowerCase().includes(q)
      );
    });
  }, [rows, search, statusFilter]);

  const headCls = dense
    ? cn(TABLE_HEAD_CLASS, "h-8 px-3")
    : TABLE_HEAD_CLASS;
  const cellCls = dense
    ? cn(TABLE_CELL_CLASS, "px-3 py-2")
    : TABLE_CELL_CLASS;

  return (
    <div className={cn(WORKSHOP_PANEL_CLASS, "overflow-hidden", className)}>
      {showToolbar && (
        <div className="flex flex-col gap-3 border-b border-[color:var(--outline-variant)] p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <History className="h-4 w-4 text-primary" />
            <span>Recent history</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[180px] flex-1 sm:flex-none">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search recipient or message…"
                className="h-8 rounded-md bg-muted/20 pl-8 text-xs"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {FILTER_CHIPS.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => onStatusFilterChange(chip.key)}
                  className={cn(
                    "rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
                    statusFilter === chip.key
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-transparent bg-muted/40 text-muted-foreground hover:bg-muted"
                  )}
                >
                  {chip.label}
                </button>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs font-medium text-primary hover:bg-primary/5"
              onClick={onViewFullLogs}
            >
              Full logs
            </Button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading history…
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<History className="h-8 w-8" />}
            title={
              search || statusFilter !== "all"
                ? "No matching messages"
                : "No recent history"
            }
            description={
              search || statusFilter !== "all"
                ? "Try a different search or status filter."
                : "Compose a message above to get started."
            }
            className="m-4 border-none bg-transparent py-10"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={headCls}>Recipient</TableHead>
                <TableHead className={headCls}>Message</TableHead>
                <TableHead className={headCls}>When</TableHead>
                <TableHead className={cn(headCls, "text-center")}>
                  Status
                </TableHead>
                <TableHead className={cn(headCls, "w-10")} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className={cellCls}>
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-foreground">
                        {row.recipient_name}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {row.recipient_phone || "No phone"}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className={cellCls}>
                    <p
                      className="line-clamp-1 max-w-[280px] text-xs text-muted-foreground"
                      title={row.message}
                    >
                      {row.message}
                    </p>
                  </TableCell>
                  <TableCell className={cellCls}>
                    <div className="text-xs font-medium text-foreground">
                      {formatSmsDate(row.created_at)}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {formatSmsTime(row.created_at)}
                    </div>
                  </TableCell>
                  <TableCell className={cn(cellCls, "text-center")}>
                    <SmsStatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className={cellCls}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label="Row actions"
                        >
                          <MoreVertical className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-xs"
                          disabled={isMutating}
                          onClick={() => onResend(row)}
                        >
                          <RotateCcw className="mr-2 h-3.5 w-3.5" />
                          Resend
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-xs"
                          onClick={() => onView(row)}
                        >
                          <Eye className="mr-2 h-3.5 w-3.5" />
                          View details
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-xs text-destructive focus:text-destructive"
                          disabled={isMutating}
                          onClick={() => onDelete(row)}
                        >
                          <Trash2 className="mr-2 h-3.5 w-3.5" />
                          Delete log
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

/** Compact table for the full-logs dialog (reuses same row actions). */
export function SmsFullLogsTable({
  rows,
  onResend,
  onView,
  onDelete,
  isMutating,
  isLoading,
}: {
  rows: SMSHistoryItem[];
  onResend: (row: SMSHistoryItem) => void;
  onView: (row: SMSHistoryItem) => void;
  onDelete: (row: SMSHistoryItem) => void;
  isMutating: boolean;
  isLoading?: boolean;
}) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (row) =>
        row.recipient_name?.toLowerCase().includes(q) ||
        row.recipient_phone?.toLowerCase().includes(q) ||
        row.message?.toLowerCase().includes(q)
    );
  }, [rows, search]);

  return (
    <div>
      <div className="border-b px-4 py-3">
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search logs…"
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading logs…
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={TABLE_HEAD_CLASS}>Recipient</TableHead>
                <TableHead className={TABLE_HEAD_CLASS}>Message</TableHead>
                <TableHead className={TABLE_HEAD_CLASS}>When</TableHead>
                <TableHead className={cn(TABLE_HEAD_CLASS, "text-center")}>
                  Status
                </TableHead>
                <TableHead className={TABLE_HEAD_CLASS}>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className={TABLE_CELL_CLASS}>
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold">
                        {row.recipient_name}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {row.recipient_phone || "No phone"}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className={TABLE_CELL_CLASS}>
                    <p className="line-clamp-2 max-w-[360px] text-xs text-muted-foreground">
                      {row.message}
                    </p>
                  </TableCell>
                  <TableCell className={TABLE_CELL_CLASS}>
                    <div className="text-xs">{formatSmsDate(row.created_at)}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {formatSmsTime(row.created_at)}
                    </div>
                  </TableCell>
                  <TableCell className={cn(TABLE_CELL_CLASS, "text-center")}>
                    <SmsStatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className={TABLE_CELL_CLASS}>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={isMutating}
                        onClick={() => onResend(row)}
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => onView(row)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        disabled={isMutating}
                        onClick={() => onDelete(row)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-12 text-center text-sm text-muted-foreground"
                  >
                    No SMS logs found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
