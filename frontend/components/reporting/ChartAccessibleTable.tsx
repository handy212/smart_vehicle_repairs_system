"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface ChartDataColumn {
  key: string;
  label: string;
  /** Optional formatter for cell values */
  format?: (value: unknown, row: Record<string, unknown>) => string;
}

interface ChartAccessibleTableProps {
  /** Chart title used for the table caption and toggle label */
  title: string;
  columns: ChartDataColumn[];
  data: Record<string, unknown>[];
  className?: string;
  /** Start expanded (useful for print) */
  defaultExpanded?: boolean;
}

export function ChartAccessibleTable({
  title,
  columns,
  data,
  className,
  defaultExpanded = false,
}: ChartAccessibleTableProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (!data.length) return null;

  return (
    <div className={cn("mt-3", className)}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 text-xs text-muted-foreground"
        aria-expanded={expanded}
        aria-controls={`chart-table-${title.replace(/\s+/g, "-").toLowerCase()}`}
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? (
          <ChevronUp className="w-3.5 h-3.5 mr-1.5" aria-hidden />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 mr-1.5" aria-hidden />
        )}
        {expanded ? "Hide data table" : "View data table"}
      </Button>
      <div
        id={`chart-table-${title.replace(/\s+/g, "-").toLowerCase()}`}
        className={cn(
          "overflow-x-auto rounded-md border border-border mt-2",
          !expanded && "sr-only"
        )}
        aria-hidden={!expanded}
      >
        <Table>
          <caption className="sr-only">{title} — tabular data</caption>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col.key} className="text-xs">
                  {col.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row, rowIndex) => (
              <TableRow key={rowIndex}>
                {columns.map((col) => {
                  const raw = row[col.key];
                  const display = col.format
                    ? col.format(raw, row)
                    : raw == null
                      ? "—"
                      : String(raw);
                  return (
                    <TableCell key={col.key} className="text-xs">
                      {display}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
