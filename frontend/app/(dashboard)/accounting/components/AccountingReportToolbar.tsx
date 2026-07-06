"use client";

import { Button } from "@/components/ui/button";
import { ReportExportMenu } from "@/components/reports/ReportExportMenu";
import type { AccountingReportPrintSlug } from "@/lib/accounting/accounting-report-print";
import { useAccountingReportPrint } from "@/lib/hooks/useAccountingReportPrint";
import type { TableExportPayload } from "@/lib/utils/report-export";
import { cn } from "@/lib/utils/cn";
import { Printer } from "lucide-react";
import { useToast } from "@/lib/hooks/useToast";
import type { ReactNode } from "react";

export interface AccountingReportPrintConfig {
  slug: AccountingReportPrintSlug;
  getQueryParams: () => Record<string, string | undefined>;
  /** Base filename without extension for server PDF */
  pdfFilename?: string;
}

interface AccountingReportToolbarProps {
  getExportPayload: () => TableExportPayload | null;
  disabled?: boolean;
  isLoading?: boolean;
  className?: string;
  /** Server-side Django template print/PDF (recommended) */
  reportPrint?: AccountingReportPrintConfig;
  children?: ReactNode;
}

export function AccountingReportToolbar({
  getExportPayload,
  disabled = false,
  isLoading = false,
  className,
  reportPrint,
  children,
}: AccountingReportToolbarProps) {
  const { toast } = useToast();
  const {
    openReportPrint,
    downloadReportPdf,
    isOpeningPrint,
    isDownloadingPdf,
  } = useAccountingReportPrint();

  const busy = disabled || isLoading || isOpeningPrint;

  const handlePrint = async () => {
    if (reportPrint) {
      try {
        await openReportPrint(reportPrint.slug, reportPrint.getQueryParams());
      } catch (err) {
        toast({
          title: "Print failed",
          description: err instanceof Error ? err.message : "Could not open print view",
          variant: "destructive",
        });
      }
      return;
    }
    window.print();
  };

  const handleServerPdf = reportPrint
    ? async () => {
        const payload = getExportPayload();
        const name =
          reportPrint.pdfFilename ||
          payload?.filename ||
          `${reportPrint.slug}-report`;
        await downloadReportPdf(reportPrint.slug, reportPrint.getQueryParams(), name);
      }
    : undefined;

  return (
    <div
      className={cn(
        "no-print flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2",
        className
      )}
    >
      {children}
      <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
        <ReportExportMenu
          getPayload={getExportPayload}
          disabled={disabled || isLoading}
          onServerPdf={handleServerPdf}
          serverPdfLoading={isDownloadingPdf}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 text-xs"
          onClick={handlePrint}
          disabled={busy}
          aria-label="Print report"
        >
          <Printer className="h-4 w-4 mr-1" />
          {isOpeningPrint ? "Opening…" : "Print"}
        </Button>
      </div>
    </div>
  );
}
