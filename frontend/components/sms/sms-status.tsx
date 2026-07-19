"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";

export type SmsStatusFilter = "all" | "sent" | "failed" | "scheduled";

export function normalizeSmsStatus(status: string): SmsStatusFilter | "other" {
  const s = status.toLowerCase();
  if (s === "sent" || s === "delivered") return "sent";
  if (s === "failed") return "failed";
  if (s === "scheduled" || s === "pending") return "scheduled";
  return "other";
}

export function formatSmsStatusLabel(status: string): string {
  const key = normalizeSmsStatus(status);
  if (key === "sent") return "Sent";
  if (key === "failed") return "Failed";
  if (key === "scheduled") return "Scheduled";
  if (!status) return "Unknown";
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

export function SmsStatusBadge({ status }: { status: string }) {
  const key = normalizeSmsStatus(status);
  let config = {
    label: formatSmsStatusLabel(status),
    dot: "bg-muted-foreground",
    bg: "bg-muted text-muted-foreground border-border",
  };

  if (key === "sent") {
    config = {
      label: "Sent",
      dot: "bg-success",
      bg: "bg-success/10 text-success border-success/20",
    };
  } else if (key === "failed") {
    config = {
      label: "Failed",
      dot: "bg-destructive",
      bg: "bg-destructive/10 text-destructive border-destructive/20",
    };
  } else if (key === "scheduled") {
    config = {
      label: "Scheduled",
      dot: "bg-info",
      bg: "bg-info/10 text-primary border-info/20",
    };
  }

  return (
    <Badge
      variant="outline"
      className={cn(
        "min-w-[5.5rem] justify-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium tracking-normal",
        config.bg
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", config.dot)} />
      {config.label}
    </Badge>
  );
}

export function formatSmsDate(value: string) {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "Today";
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatSmsTime(value: string) {
  return new Date(value).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export function smsCharInfo(message: string) {
  const len = message.length;
  if (len === 0) return { len: 0, segments: 0 };
  const segments = len > 160 ? Math.ceil(len / 153) : 1;
  return { len, segments };
}
