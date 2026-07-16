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
import { CheckCircle2, AlertTriangle } from "lucide-react";

export default function TaxReconciliationPage() {
  const { formatCurrency } = useCurrency();
  const { activeBranchId } = useBranchStore();
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data: report, isLoading } = useQuery({
    queryKey: ["accounting", "tax-reconciliation", startDate, endDate, activeBranchId],
    queryFn: () => accountingApi.getTaxReconciliation(startDate, endDate, activeBranchId || undefined),
  });

  const getExportPayload = () => {
    if (!report) return null;
    return {
      reportTitle: "Tax Reconciliation",
      filename: `tax-reconciliation_${startDate}_${endDate}`,
      dateInfo: `${startDate} to ${endDate}`,
      headers: ["Source", "Output", "Input", "Net"],
      rows: [
        ["GL", report.gl.output_tax_balance, report.gl.input_tax_balance, report.gl.net_position],
        ["Operational", report.operational.output_tax_total, report.operational.input_tax_total, report.operational.net_position],
        ["Variance", report.variance.output, report.variance.input, report.variance.net],
      ],
      currencyColumnIndexes: [1, 2, 3],
    };
  };

  const sections = report
    ? [
        { title: "General Ledger", data: report.gl },
        { title: "Operational", data: report.operational },
        { title: "Variance", data: report.variance, isVariance: true },
      ]
    : [];

  return (
    <div className="space-y-4">
      <div className="no-print space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4 pt-2">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">Tax Reconciliation</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              GL tax accounts vs operational tax totals
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

      <AccountingReportPrintHeader title="Tax Reconciliation" dateInfo={`${startDate} to ${endDate}`} />

      {isLoading ? (
        <AccountingReportSkeleton />
      ) : report ? (
        <div className="print-container space-y-4">
          <div className="flex items-center gap-2">
            {report.in_balance ? (
              <Badge className="bg-success/10 text-success border-success/20">
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                In Balance
              </Badge>
            ) : (
              <Badge variant="danger">
                <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                Out of Balance
              </Badge>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {sections.map((section) => (
              <Card key={section.title}>
                <CardHeader className="border-b bg-muted/10 pb-3">
                  <CardTitle className="text-base">{section.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 p-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Output</span>
                    <span className="font-mono font-medium">
                      {formatCurrency(
                        "output_tax_balance" in section.data
                          ? section.data.output_tax_balance
                          : "output_tax_total" in section.data
                            ? section.data.output_tax_total
                            : section.data.output
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Input</span>
                    <span className="font-mono font-medium">
                      {formatCurrency(
                        "input_tax_balance" in section.data
                          ? section.data.input_tax_balance
                          : "input_tax_total" in section.data
                            ? section.data.input_tax_total
                            : section.data.input
                      )}
                    </span>
                  </div>
                  <div className={`flex justify-between text-sm font-semibold border-t pt-3 ${section.isVariance ? "text-destructive" : ""}`}>
                    <span>Net</span>
                    <span className="font-mono">
                      {formatCurrency(
                        "net_position" in section.data ? section.data.net_position : section.data.net
                      )}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
