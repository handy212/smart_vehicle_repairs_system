"use client";

import { Button } from "@/components/ui/button";
import { ReportExportMenu } from "@/components/reports/ReportExportMenu";
import type { TableExportPayload } from "@/lib/utils/report-export";
import { cn } from "@/lib/utils/cn";
import { Printer } from "lucide-react";
import type { ReactNode } from "react";

interface AccountingReportToolbarProps {
  getExportPayload: () => TableExportPayload | null;
  disabled?: boolean;
  isLoading?: boolean;
  className?: string;
  /** Filters, date inputs, branch chip, etc. */
  children?: ReactNode;
}

export function AccountingReportToolbar({
  getExportPayload,
  disabled = false,
  isLoading = false,
  className,
  children,
}: AccountingReportToolbarProps) {
  return (
    <div
      className={cn(
        "no-print flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2",
        className
      )}
    >
      {children}
      <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
        <ReportExportMenu getPayload={getExportPayload} disabled={disabled || isLoading} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 text-xs"
          onClick={() => window.print()}
          disabled={disabled || isLoading}
          aria-label="Print report"
        >
          <Printer className="h-4 w-4 mr-1" />
          Print
        </Button>
      </div>
    </div>
  );
}
