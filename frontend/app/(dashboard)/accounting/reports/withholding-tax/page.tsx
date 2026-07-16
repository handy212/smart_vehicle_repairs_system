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
import { cn } from "@/lib/utils/cn";
import { ACCOUNTING_TABLE_HEAD_CLASS } from "@/lib/constants/table-typography";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function WithholdingTaxPage() {
  const { formatCurrency } = useCurrency();
  const { activeBranchId } = useBranchStore();
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data: report, isLoading } = useQuery({
    queryKey: ["accounting", "withholding-tax", startDate, endDate, activeBranchId],
    queryFn: () => accountingApi.getWithholdingTaxReport(startDate, endDate, activeBranchId || undefined),
  });

  const getExportPayload = () => {
    if (!report) return null;
    return {
      reportTitle: "Withholding Tax Report",
      filename: `withholding-tax_${startDate}_${endDate}`,
      dateInfo: `${startDate} to ${endDate}`,
      headers: ["Code", "Account", "Balance"],
      rows: report.lines.map((line) => [line.code, line.name, line.balance]),
      currencyColumnIndexes: [2],
    };
  };

  return (
    <div className="space-y-4">
      <div className="no-print space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4 pt-2">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">Withholding Tax</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              WHT liability balances from configured accounts
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

      <AccountingReportPrintHeader title="Withholding Tax Report" dateInfo={`${startDate} to ${endDate}`} />

      {isLoading ? (
        <AccountingReportSkeleton />
      ) : report ? (
        <div className="print-container space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{report.configured ? "Accounts configured" : "No WHT accounts found"}</Badge>
            <Badge variant="outline">Total withheld: {formatCurrency(report.total_withheld)}</Badge>
          </div>

          {report.note && (
            <Card className="border-warning/20 bg-warning/10">
              <CardContent className="p-4 text-sm text-warning">{report.note}</CardContent>
            </Card>
          )}

          <Card className="overflow-hidden">
            <CardHeader className="border-b pb-3">
              <CardTitle className="text-base">Period WHT Transactions</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {!report.period_transactions?.length ? (
                <p className="p-6 text-sm text-muted-foreground">No withholding tax recorded on vendor payments in this period.</p>
              ) : (
                <Table>
                  <TableHeader className="bg-muted/10">
                    <TableRow className="hover:bg-transparent border-none">
                      <TableHead className={ACCOUNTING_TABLE_HEAD_CLASS}>Date</TableHead>
                      <TableHead className={ACCOUNTING_TABLE_HEAD_CLASS}>Vendor</TableHead>
                      <TableHead className={ACCOUNTING_TABLE_HEAD_CLASS}>Bill</TableHead>
                      <TableHead className={cn(ACCOUNTING_TABLE_HEAD_CLASS, "text-right")}>WHT</TableHead>
                      <TableHead className={cn(ACCOUNTING_TABLE_HEAD_CLASS, "text-right")}>Net Paid</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.period_transactions.map((tx) => (
                      <TableRow key={tx.payment_number} className="border-b border-border hover:bg-muted/20">
                        <TableCell className="px-4 py-2 text-sm">{tx.payment_date}</TableCell>
                        <TableCell className="px-4 py-2 text-sm">{tx.vendor}</TableCell>
                        <TableCell className="px-4 py-2 text-sm font-mono">{tx.bill_number}</TableCell>
                        <TableCell className="px-4 py-2 text-sm text-right font-mono">{formatCurrency(tx.wht_amount)}</TableCell>
                        <TableCell className="px-4 py-2 text-sm text-right font-mono">{formatCurrency(tx.net_paid)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/20 font-semibold">
                      <TableCell colSpan={3} className="px-4 py-2 text-sm">Period Total</TableCell>
                      <TableCell className="px-4 py-2 text-sm text-right font-mono">
                        {formatCurrency(report.period_withheld_total || 0)}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="border-b pb-3">
              <CardTitle className="text-base">WHT Liability Balance</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {report.lines.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">No withholding tax balances for this period.</p>
              ) : (
                <Table>
                  <TableHeader className="bg-muted/10">
                    <TableRow className="hover:bg-transparent border-none">
                      <TableHead className={ACCOUNTING_TABLE_HEAD_CLASS}>Code</TableHead>
                      <TableHead className={ACCOUNTING_TABLE_HEAD_CLASS}>Account</TableHead>
                      <TableHead className={cn(ACCOUNTING_TABLE_HEAD_CLASS, "text-right")}>Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.lines.map((line) => (
                      <TableRow key={line.code} className="border-b border-border hover:bg-muted/20">
                        <TableCell className="px-4 py-2 text-sm font-mono">{line.code}</TableCell>
                        <TableCell className="px-4 py-2 text-sm">{line.name}</TableCell>
                        <TableCell className="px-4 py-2 text-sm text-right font-mono">
                          {formatCurrency(line.balance)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/20 font-semibold">
                      <TableCell colSpan={2} className="px-4 py-2 text-sm">Total</TableCell>
                      <TableCell className="px-4 py-2 text-sm text-right font-mono">
                        {formatCurrency(report.total_withheld)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
