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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Percent, Scale, TrendingUp } from "lucide-react";

const RATIO_LABELS: Record<string, { label: string; description: string; suffix?: string }> = {
  current_ratio: { label: "Current Ratio", description: "Current assets / current liabilities" },
  quick_ratio: { label: "Quick Ratio", description: "Liquid assets / current liabilities" },
  cash_ratio: { label: "Cash Ratio", description: "Cash & bank / current liabilities" },
  debt_to_equity: { label: "Debt to Equity", description: "Total liabilities / equity" },
  debt_ratio: { label: "Debt Ratio", description: "Total liabilities / total assets" },
  equity_ratio: { label: "Equity Ratio", description: "Equity / total assets" },
  net_profit_margin: { label: "Net Profit Margin", description: "Net income / revenue", suffix: "%" },
  return_on_assets: { label: "Return on Assets", description: "Net income / total assets", suffix: "%" },
  return_on_equity: { label: "Return on Equity", description: "Net income / equity", suffix: "%" },
  expense_ratio: { label: "Expense Ratio", description: "Expenses / revenue", suffix: "%" },
};

function formatRatio(value: number | null | undefined, suffix?: string) {
  if (value == null) return "N/A";
  return suffix ? `${value.toFixed(2)}${suffix}` : value.toFixed(2);
}

export default function FinancialRatiosPage() {
  const { activeBranchId } = useBranchStore();
  const [asOfDate, setAsOfDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data: report, isLoading } = useQuery({
    queryKey: ["accounting", "financial-ratios", asOfDate, startDate, endDate, activeBranchId],
    queryFn: () =>
      accountingApi.getFinancialRatios({
        as_of_date: asOfDate,
        start_date: startDate,
        end_date: endDate,
        branch_id: activeBranchId || undefined,
      }),
  });

  const getExportPayload = () => {
    if (!report) return null;
    return {
      reportTitle: "Financial Ratios",
      filename: `financial-ratios_${asOfDate}`,
      dateInfo: `As of ${asOfDate} | P&L ${startDate} to ${endDate}`,
      headers: ["Ratio", "Value"],
      rows: Object.entries(report.ratios).map(([key, value]) => [
        RATIO_LABELS[key]?.label ?? key,
        formatRatio(value, RATIO_LABELS[key]?.suffix),
      ]),
    };
  };

  const liquidityRatios = ["current_ratio", "quick_ratio", "cash_ratio"];
  const leverageRatios = ["debt_to_equity", "debt_ratio", "equity_ratio"];
  const profitabilityRatios = ["net_profit_margin", "return_on_assets", "return_on_equity", "expense_ratio"];

  const renderRatioCards = (keys: string[]) =>
    keys.map((key) => {
      const meta = RATIO_LABELS[key];
      const value = report?.ratios[key];
      return (
        <Card key={key}>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">{meta?.label ?? key}</p>
                <p className="text-xs text-muted-foreground mt-1">{meta?.description}</p>
                <p className="text-2xl font-semibold mt-3">{formatRatio(value, meta?.suffix)}</p>
              </div>
              <div className="rounded-md border border-primary/20 bg-primary/10 p-2.5">
                {key.includes("margin") || key.startsWith("return") ? (
                  <TrendingUp className="h-5 w-5 text-primary" />
                ) : key.includes("debt") ? (
                  <Scale className="h-5 w-5 text-primary" />
                ) : (
                  <Percent className="h-5 w-5 text-primary" />
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      );
    });

  return (
    <div className="space-y-4">
      <div className="no-print space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4 pt-2">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">Financial Ratios</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Liquidity, leverage, and profitability metrics
            </p>
          </div>
          <BranchReportChip />
        </div>

        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label htmlFor="as_of_date" className="text-xs">As Of Date</Label>
                <Input
                  id="as_of_date"
                  type="date"
                  value={asOfDate}
                  onChange={(e) => setAsOfDate(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div>
                <Label htmlFor="start_date" className="text-xs">P&L Start</Label>
                <Input
                  id="start_date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div>
                <Label htmlFor="end_date" className="text-xs">P&L End</Label>
                <Input
                  id="end_date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <AccountingReportToolbar
          getExportPayload={getExportPayload}
          disabled={!report}
          isLoading={isLoading}
        />
      </div>

      <AccountingReportPrintHeader
        title="Financial Ratios"
        dateInfo={`As of ${asOfDate} | P&L ${startDate} to ${endDate}`}
      />

      {isLoading ? (
        <AccountingReportSkeleton />
      ) : report ? (
        <div className="print-container space-y-6">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">Balance sheet as of {report.as_of_date}</Badge>
            <Badge variant="outline">
              Period {report.period.start} to {report.period.end}
            </Badge>
          </div>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Liquidity</h2>
            <div className="grid gap-3 md:grid-cols-3">{renderRatioCards(liquidityRatios)}</div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Leverage</h2>
            <div className="grid gap-3 md:grid-cols-3">{renderRatioCards(leverageRatios)}</div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Profitability</h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{renderRatioCards(profitabilityRatios)}</div>
          </section>

          <Card>
            <CardHeader className="border-b bg-muted/10">
              <CardTitle className="text-base">Inputs</CardTitle>
            </CardHeader>
            <CardContent className="p-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(report.inputs).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between rounded border bg-muted/20 px-3 py-2 text-sm">
                  <span className="text-muted-foreground capitalize">{key.replace(/_/g, " ")}</span>
                  <span className="font-mono font-medium">{Number(value).toLocaleString()}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
