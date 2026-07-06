"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock } from "lucide-react";
import { format } from "date-fns";

export type RecentJournalEntry = {
  id: number;
  entry_number?: string;
  date: string;
  description?: string;
  status?: string;
};

interface RecentActivityPanelProps {
  entries: RecentJournalEntry[];
  isLoading?: boolean;
}

export function RecentActivityPanel({ entries, isLoading }: RecentActivityPanelProps) {
  return (
    <Card className="h-full md:col-span-3">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground" />
          Recent Journal Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 rounded bg-muted" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No recent journal entries.</p>
        ) : (
          <div className="space-y-2">
            {entries.slice(0, 6).map((entry) => (
              <Link
                key={entry.id}
                href={`/accounting/journal-entries/${entry.id}`}
                className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm hover:bg-muted/40 transition-colors"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">
                    {entry.entry_number || `JE-${entry.id}`}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {entry.description || "Journal entry"}
                  </p>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <p className="text-xs text-muted-foreground">
                    {entry.date && !Number.isNaN(new Date(entry.date).getTime())
                      ? format(new Date(entry.date), "MMM d")
                      : "—"}
                  </p>
                  {entry.status && (
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {entry.status}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
        <div className="mt-3 pt-2 border-t">
          <Link href="/accounting/journal-entries" className="text-xs text-primary hover:underline">
            View all journal entries
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
