"use client";

import { AlertCircle, Clock, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { SMSStats } from "@/services/sms";
import type { SmsStatusFilter } from "./sms-status";

interface SmsStatsRowProps {
  stats?: SMSStats;
  activeFilter: SmsStatusFilter;
  onFilterChange: (filter: SmsStatusFilter) => void;
}

const CARDS: {
  key: Exclude<SmsStatusFilter, "all">;
  label: string;
  icon: typeof TrendingUp;
  valueKey: keyof SMSStats;
  accent: string;
}[] = [
  {
    key: "sent",
    label: "Sent today",
    icon: TrendingUp,
    valueKey: "sent_today",
    accent: "text-success",
  },
  {
    key: "scheduled",
    label: "Scheduled",
    icon: Clock,
    valueKey: "scheduled",
    accent: "text-primary",
  },
  {
    key: "failed",
    label: "Failed today",
    icon: AlertCircle,
    valueKey: "failed_today",
    accent: "text-destructive",
  },
];

export function SmsStatsRow({
  stats,
  activeFilter,
  onFilterChange,
}: SmsStatsRowProps) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {CARDS.map((card) => {
        const Icon = card.icon;
        const active = activeFilter === card.key;
        const value = stats?.[card.valueKey] ?? 0;
        return (
          <button
            key={card.key}
            type="button"
            onClick={() =>
              onFilterChange(active ? "all" : card.key)
            }
            className={cn(
              "flex items-center justify-between rounded-md border px-3 py-2.5 text-left transition-colors",
              "border-[color:var(--outline-variant)] bg-[var(--panel-bg)] shadow-none",
              active
                ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20"
                : "hover:bg-muted/40"
            )}
          >
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">
                {card.label}
              </p>
              <p
                className={cn(
                  "mt-0.5 text-lg font-semibold tabular-nums tracking-tight",
                  card.accent
                )}
              >
                {value}
              </p>
            </div>
            <Icon className={cn("h-4 w-4 shrink-0 opacity-70", card.accent)} />
          </button>
        );
      })}
    </div>
  );
}
