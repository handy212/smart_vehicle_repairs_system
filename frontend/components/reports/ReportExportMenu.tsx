"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { useToast } from "@/lib/hooks/useToast";
import {
  runTableExport,
  type TableExportPayload,
} from "@/lib/utils/report-export";
import { ChevronDown, Download, FileDown, FileSpreadsheet } from "lucide-react";

type ReportExportMenuProps = {
  getPayload: () => TableExportPayload | null;
  disabled?: boolean;
  size?: "default" | "sm" | "lg";
  variant?: "default" | "outline" | "ghost";
};

export function ReportExportMenu({
  getPayload,
  disabled = false,
  size = "sm",
  variant = "outline",
}: ReportExportMenuProps) {
  const { formatCurrency, currencySymbol } = useCurrency();
  const { toast } = useToast();

  const enrich = (payload: TableExportPayload): TableExportPayload => ({
    ...payload,
    formatCurrency,
    currencySymbol,
  });

  const exportFormat = (format: "xlsx" | "pdf" | "csv") => {
    const base = getPayload();
    if (!base || base.rows.length === 0) {
      toast({
        title: "Nothing to export",
        description: "Load report data or switch to a tab with rows first.",
      });
      return;
    }
    try {
      runTableExport(enrich(base), format);
      toast({
        title: "Export started",
        description: `Downloading ${format === "xlsx" ? "Excel" : "PDF"} file.`,
      });
    } catch {
      toast({
        title: "Export failed",
        description: "Could not generate the file.",
        variant: "destructive",
      });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} disabled={disabled} type="button">
          <Download className="h-4 w-4 mr-1" />
          Export
          <ChevronDown className="h-4 w-4 ml-1 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => exportFormat("csv")}>
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Export CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportFormat("xlsx")}>
          <Download className="h-4 w-4 mr-2" />
          Export Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportFormat("pdf")}>
          <FileDown className="h-4 w-4 mr-2" />
          Export PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
