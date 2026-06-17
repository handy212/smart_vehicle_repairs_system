"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth } from "date-fns";
import { accountingApi } from "@/lib/api/accounting";
import { AccountingReportSkeleton } from "../../components/AccountingReportSkeleton";
import { AccountingReportToolbar } from "../../components/AccountingReportToolbar";
import { AccountingReportPrintHeader } from "../../components/AccountingReportPrintHeader";
import { BranchReportChip } from "@/components/reporting/BranchReportChip";
import { useBranchStore } from "@/store/branchStore";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export default function VatReturnPage() {
  const { formatCurrency } = useCurrency();
  const { activeBranchId } = useBranchStore();
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data: report, isLoading } = useQuery({
    queryKey: ["accounting", "vat-return", startDate, endDate, activeBranchId],
    queryFn: () => accountingApi.getVatReturn(startDate, endDate, activeBranchId || undefined),
  });

  const worksheet = report?.worksheet;
  const getExportPayload = () => {
    if (!worksheet) return null;
    return {
      reportTitle: "VAT Return Worksheet",
      filename: `vat-return_${startDate}_${endDate}`,
      dateInfo: `${startDate} to ${endDate}`,
      headers: ["Line", "Amount"],
      rows: [
        ["Output VAT", worksheet.output_vat],
        ["Output NHIL", worksheet.output_nhil],
        ["Output GETFund", worksheet.output_getfund],
        ["Output HRL", worksheet.output_hrl],
        ["Total Output Tax", worksheet.total_output_tax],
        ["Input VAT", worksheet.input_vat],
        ["Net VAT Payable", worksheet.net_vat_payable],
      ],
      currencyColumnIndexes: [1],
    };
  };

  const lines = worksheet
    ? [
        { label: "Output VAT", value: worksheet.output_vat },
        { label: "Output NHIL", value: worksheet.output_nhil },
        { label: "Output GETFund", value: worksheet.output_getfund },
        { label: "Output HRL", value: worksheet.output_hrl },
        { label: "Total Output Tax", value: worksheet.total_output_tax, highlight: true },
        { label: "Input VAT", value: worksheet.input_vat },
        { label: "Net VAT Payable", value: worksheet.net_vat_payable, highlight: true },
      ]
    : [];

  return (
    <div className="space-y-4">
      <div className="no-print space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4 pt-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">VAT Return</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Output tax collected vs input VAT paid
            </p>
          </div>
          <BranchReportChip />
        </div>

        <Card>
          <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="start_date" className="text-xs">Start Date</Label>
              <Input id="start_date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 text-sm" />
            </div>
            <div>
              <Label htmlFor="end_date" className="text-xs">End Date</Label>
              <Input id="end_date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9 text-sm" />
            </div>
          </CardContent>
        </Card>

        <AccountingReportToolbar getExportPayload={getExportPayload} disabled={!report} isLoading={isLoading} />
      </div>

      <AccountingReportPrintHeader title="VAT Return Worksheet" dateInfo={`${startDate} to ${endDate}`} />

      {isLoading ? (
        <AccountingReportSkeleton />
      ) : report ? (
        <div className="print-container space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="capitalize">{report.status}</Badge>
            <Badge variant="outline">{report.supporting.invoice_count} invoices</Badge>
            <Badge variant="outline">{report.supporting.bill_count} bills</Badge>
          </div>

          <Card>
            <CardHeader className="border-b bg-muted/10">
              <CardTitle className="text-base">Worksheet</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4">
              {lines.map((line) => (
                <div
                  key={line.label}
                  className={`flex items-center justify-between rounded-lg border p-3 ${
                    line.highlight ? "border-primary/20 bg-primary/10" : "bg-muted/20"
                  }`}
                >
                  <span className={line.highlight ? "font-semibold" : "font-medium"}>{line.label}</span>
                  <span className={`font-mono font-bold ${line.highlight ? "text-lg" : ""}`}>
                    {formatCurrency(line.value)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
