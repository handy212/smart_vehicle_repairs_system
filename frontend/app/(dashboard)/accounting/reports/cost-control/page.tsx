"use client";

import { AccountingReportSkeleton } from "../../components/AccountingReportSkeleton";

import { useQuery } from "@tanstack/react-query";
import { accountingApi } from "@/lib/api/accounting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, startOfMonth } from "date-fns";
import { useState } from "react";
import { Package, Wrench, BarChart3 } from "lucide-react";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { useBranchStore } from "@/store/branchStore";
import { AccountingReportToolbar } from "../../components/AccountingReportToolbar";
import { AccountingReportPrintHeader } from "../../components/AccountingReportPrintHeader";
import type { TableExportPayload } from "@/lib/utils/report-export";

type ExpenseCategory = { amount?: number; percent?: number; label?: string };
type ReturnJob = {
  work_order_number?: string;
  status?: string;
  cost_variance?: number;
  branch?: string;
  is_warranty_rework?: boolean;
};

export default function CostControlReportPage() {
  const { formatCurrency } = useCurrency();
  const { activeBranchId } = useBranchStore();
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data, isLoading } = useQuery({
    queryKey: ["cost-control", startDate, endDate, activeBranchId],
    queryFn: () =>
      accountingApi.getCostControlReport(startDate, endDate, activeBranchId || undefined)});

  const expense = (data as { expense_breakdown?: { categories?: Record<string, ExpenseCategory>; total_expenses?: number } })
    ?.expense_breakdown;
  const returnJobs = (data as { return_jobs?: ReturnJob[] })?.return_jobs ?? [];
  const cats = expense?.categories ?? {};

  const icons: Record<string, typeof Package> = {
    parts: Package,
    labor: Wrench,
    overhead: BarChart3};

  const buildExportPayload = (): TableExportPayload | null => {
    if (returnJobs.length === 0) return null;
    return {
      filename: `cost-control_${startDate}_${endDate}`,
      reportTitle: "Cost Control — Return & rework jobs",
      dateInfo: `Period: ${startDate} to ${endDate}`,
      headers: ["Work order", "Branch", "Status", "Warranty rework", "Cost variance"],
      rows: returnJobs.map((j) => [
        j.work_order_number ?? "",
        j.branch ?? "",
        j.status ?? "",
        j.is_warranty_rework ? "Yes" : "No",
        j.cost_variance ?? 0,
      ]),
      currencyColumnIndexes: [4]};
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="no-print flex flex-wrap items-start justify-between gap-4">
        <div>
        <h1 className="text-2xl font-bold">Cost Control Report</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Operating costs by category plus warranty and return/rework jobs.
        </p>
        </div>
        <AccountingReportToolbar
          getExportPayload={buildExportPayload}
          disabled={isLoading}
          isLoading={isLoading}
          reportPrint={{
            slug: "cost-control",
            getQueryParams: () => ({
              start_date: startDate,
              end_date: endDate,
            }),
            pdfFilename: `cost-control_${startDate}_${endDate}`,
          }}
        />
      </div>
      <AccountingReportPrintHeader title="Cost Control" dateInfo={`${startDate} to ${endDate}`} />
      <div className="no-print flex gap-4">
        <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
        <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
      </div>
      <div className="print-container">
      {isLoading ? (
        <AccountingReportSkeleton compact rows={4} />
      ) : (
        <>
          <p className="text-sm font-medium">
            Total expenses: {formatCurrency(expense?.total_expenses ?? 0)}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(["parts", "labor", "overhead"] as const).map((key) => {
              const c = cats[key];
              const Icon = icons[key];
              return (
                <Card key={key}>
                  <CardHeader className="pb-2 flex flex-row items-center gap-2">
                    <Icon className="h-4 w-4" />
                    <CardTitle className="text-sm">{c?.label ?? key}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-lg font-semibold">{formatCurrency(c?.amount ?? 0)}</p>
                    <p className="text-xs text-muted-foreground">{(c?.percent ?? 0).toFixed(1)}% of total</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Return & rework jobs ({returnJobs.length})</CardTitle>
            </CardHeader>
            <CardContent className="max-h-[400px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Work order</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Warranty rework</TableHead>
                    <TableHead className="text-right">Cost variance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {returnJobs.map((j, i) => (
                    <TableRow key={i}>
                      <TableCell>{j.work_order_number ?? "—"}</TableCell>
                      <TableCell>{j.branch ?? "—"}</TableCell>
                      <TableCell>{j.status}</TableCell>
                      <TableCell>{j.is_warranty_rework ? "Yes" : "No"}</TableCell>
                      <TableCell className="text-right">{formatCurrency(j.cost_variance ?? 0)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
      </div>
    </div>
  );
}
