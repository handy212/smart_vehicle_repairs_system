"use client";

import { AccountingReportSkeleton } from "../../components/AccountingReportSkeleton";

import { useQuery } from "@tanstack/react-query";
import { accountingApi } from "@/lib/api/accounting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, startOfMonth } from "date-fns";
import { useState } from "react";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { AccountingReportToolbar } from "../../components/AccountingReportToolbar";
import { AccountingReportPrintHeader } from "../../components/AccountingReportPrintHeader";
import type { TableExportPayload } from "@/lib/utils/report-export";
import apiClient from "@/lib/api/client";

interface Budget {
  id: number;
  name: string;
  fiscal_year: number;
}

export default function OpexVariancePage() {
  const { formatCurrency } = useCurrency();
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [budgetId, setBudgetId] = useState<string>("");

  const { data: budgets } = useQuery({
    queryKey: ["budgets-list"],
    queryFn: async () => {
      const res = await apiClient.get("/accounting/budgets/");
      return (res.data.results || res.data) as Budget[];
    }});

  const { data: report, isLoading } = useQuery({
    queryKey: ["opex-variance", budgetId, startDate, endDate],
    queryFn: () =>
      accountingApi.getOpexVariance(Number(budgetId), startDate, endDate),
    enabled: !!budgetId});

  const lines = (report as { lines?: Array<{ account_code: string; account_name: string; budget: number; actual: number; variance: number; variance_percent: number }> })?.lines ?? [];
  const totals = (report as { totals?: { budget: number; actual: number; variance: number; variance_percent: number } })?.totals;

  const buildExportPayload = (): TableExportPayload | null => {
    if (!budgetId || lines.length === 0) return null;
    const budgetName = budgets?.find((b) => String(b.id) === budgetId)?.name ?? budgetId;
    return {
      filename: `opex-variance_${startDate}_${endDate}`,
      reportTitle: `OPEX Variance — ${budgetName}`,
      dateInfo: `Period: ${startDate} to ${endDate}`,
      headers: ["Account", "Budget", "Actual", "Variance", "Variance %"],
      rows: lines.map((line) => [
        `${line.account_code} — ${line.account_name}`,
        line.budget,
        line.actual,
        line.variance,
        line.variance_percent.toFixed(1),
      ]),
      currencyColumnIndexes: [1, 2, 3]};
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="no-print flex flex-wrap items-start justify-between gap-4">
        <div>
        <h1 className="text-2xl font-bold">OPEX Variance vs Budget</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Operating expense accounts (excludes parts and direct labor GL ranges).
        </p>
        </div>
        <AccountingReportToolbar
          getExportPayload={buildExportPayload}
          disabled={!budgetId || isLoading}
          isLoading={isLoading}
        />
      </div>
      <AccountingReportPrintHeader title="OPEX Variance" />
      <div className="no-print flex flex-wrap gap-4 items-end">
        <div>
          <Label className="text-xs">Budget</Label>
          <Select value={budgetId} onValueChange={setBudgetId}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Select budget" />
            </SelectTrigger>
            <SelectContent>
              {(budgets ?? []).map((b) => (
                <SelectItem key={b.id} value={String(b.id)}>
                  {b.name} ({b.fiscal_year})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
        <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
      </div>
      <div className="print-container">
      {!budgetId ? (
        <p className="text-sm text-muted-foreground">Select a budget to view OPEX variance.</p>
      ) : isLoading ? (
        <AccountingReportSkeleton compact rows={4} />
      ) : (
        <>
          {totals && (
            <div className="grid grid-cols-3 gap-4 max-w-xl">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Budget</CardTitle></CardHeader>
                <CardContent className="font-semibold">{formatCurrency(totals.budget)}</CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Actual</CardTitle></CardHeader>
                <CardContent className="font-semibold">{formatCurrency(totals.actual)}</CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Variance</CardTitle></CardHeader>
                <CardContent className="font-semibold">
                  {formatCurrency(totals.variance)} ({totals.variance_percent}%)
                </CardContent>
              </Card>
            </div>
          )}
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Budget</TableHead>
                    <TableHead className="text-right">Actual</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                    <TableHead className="text-right">%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => (
                    <TableRow key={line.account_code}>
                      <TableCell>
                        {line.account_code} — {line.account_name}
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(line.budget)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(line.actual)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(line.variance)}</TableCell>
                      <TableCell className="text-right">{line.variance_percent.toFixed(1)}%</TableCell>
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
