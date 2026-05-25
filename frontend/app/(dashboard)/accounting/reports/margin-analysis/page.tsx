"use client";

import { AccountingReportSkeleton } from "../../components/AccountingReportSkeleton";

import { useQuery } from "@tanstack/react-query";
import { accountingApi } from "@/lib/api/accounting";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, startOfMonth } from "date-fns";
import { useState } from "react";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { useBranchStore } from "@/store/branchStore";
import { AccountingReportToolbar } from "../../components/AccountingReportToolbar";
import { AccountingReportPrintHeader } from "../../components/AccountingReportPrintHeader";
import type { TableExportPayload } from "@/lib/utils/report-export";
import apiClient from "@/lib/api/client";

export default function MarginAnalysisPage() {
  const { formatCurrency } = useCurrency();
  const { activeBranchId } = useBranchStore();
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data: jobs, isLoading: loadingJobs } = useQuery({
    queryKey: ["margin", "jobs", startDate, endDate, activeBranchId],
    queryFn: async () => {
      const params: Record<string, string> = {
        start_date: startDate,
        end_date: endDate,
      };
      if (activeBranchId) params.branch_id = String(activeBranchId);
      const res = await apiClient.get("/accounting/reports/job-profitability/", { params });
      return res.data;
    },
  });

  const jobData = jobs as {
    jobs?: Array<{ work_order_number?: string; margin_percent?: number; total_revenue?: number; total_cost?: number; net_profit?: number }>;
    totals?: { total_revenue?: number; total_cost?: number; total_profit?: number; avg_margin_percent?: number };
  };
  const jobList = jobData?.jobs ?? [];
  const totals = jobData?.totals;

  const buildExportPayload = (): TableExportPayload | null => {
    if (jobList.length === 0) return null;
    return {
      filename: `margin-analysis_${startDate}_${endDate}`,
      reportTitle: "Margin Analysis — Job profitability",
      dateInfo: `Period: ${startDate} to ${endDate}`,
      headers: ["Work order", "Revenue", "Cost", "Profit", "Margin %"],
      rows: jobList.map((j) => [
        j.work_order_number ?? "",
        j.total_revenue ?? 0,
        j.total_cost ?? 0,
        j.net_profit ?? 0,
        (j.margin_percent ?? 0).toFixed(1),
      ]),
      currencyColumnIndexes: [1, 2, 3],
    };
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="no-print flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Margin Analysis</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Combined gross margin from invoicing and per-job profitability.
          </p>
        </div>
        <AccountingReportToolbar
          getExportPayload={buildExportPayload}
          disabled={loadingJobs}
          isLoading={loadingJobs}
        />
      </div>
      <AccountingReportPrintHeader title="Margin Analysis" dateInfo={`${startDate} to ${endDate}`} />
      <div className="no-print flex gap-4">
        <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
        <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
      </div>
      <div className="print-container">
      {loadingJobs ? (
        <AccountingReportSkeleton compact rows={4} />
      ) : totals ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Revenue</CardTitle></CardHeader>
            <CardContent className="text-lg font-semibold">{formatCurrency(totals.total_revenue ?? 0)}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Cost</CardTitle></CardHeader>
            <CardContent className="text-lg font-semibold">{formatCurrency(totals.total_cost ?? 0)}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Gross profit</CardTitle></CardHeader>
            <CardContent className="text-lg font-semibold">{formatCurrency(totals.total_profit ?? 0)}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Avg margin %</CardTitle></CardHeader>
            <CardContent className="text-lg font-semibold">{(totals.avg_margin_percent ?? 0).toFixed(1)}%</CardContent>
          </Card>
        </div>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Job-level margin</CardTitle>
          <CardDescription>Top jobs by revenue in period</CardDescription>
        </CardHeader>
        <CardContent className="max-h-[420px] overflow-auto">
          {loadingJobs ? (
        <AccountingReportSkeleton compact rows={4} />
      ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Work order</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                  <TableHead className="text-right">Margin %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobList.slice(0, 50).map((j, i) => (
                  <TableRow key={i}>
                    <TableCell>{j.work_order_number ?? "—"}</TableCell>
                    <TableCell className="text-right">{formatCurrency(j.total_revenue ?? 0)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(j.total_cost ?? 0)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(j.net_profit ?? 0)}</TableCell>
                    <TableCell className="text-right">{(j.margin_percent ?? 0).toFixed(1)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
